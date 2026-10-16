import { PaymentModel } from "../models/Payment.js";
import { MemberModel } from "../models/Member.js";
import { getOrCreateSettings } from "../models/Settings.js";

export function currentQuarterOf(date = new Date()): number {
  return Math.floor(date.getMonth() / 3) + 1; // 1-4
}

type QuarterInput = {
  year: number;
  paid: Set<number>;
  waived: Set<number>;
  disabled: Set<number>;
};

// The one rule for what a member owes, shared by the member's own dues page,
// the admin member page and the admin Dues overview, so they always agree.
// A quarter is:
//   paid    — a successful dues_renewal payment exists for it (Paystack, or
//             recorded by an admin)
//   waived  — an admin has waived it (member doesn't owe it)
//   disabled— dues collection is turned off for it for everyone
//   due     — a quarter already reached (earlier year, or this/an earlier
//             quarter of this year) that is none of the above
//   upcoming— a future quarter, including every quarter of a later year
//
// `payable` is separate from `due`: a future quarter isn't owed yet but can
// still be settled in advance, so the page offers a "pay ahead" button.
export function quarterStates({ year, paid, waived, disabled }: QuarterInput) {
  const currentQuarter = currentQuarterOf();
  const thisYear = new Date().getFullYear();
  return [1, 2, 3, 4].map((q) => {
    const settled = paid.has(q) || waived.has(q) || disabled.has(q);
    return {
      quarter: q,
      paid: paid.has(q),
      waived: waived.has(q),
      disabled: disabled.has(q),
      due:
        !settled &&
        (year < thisYear || (year === thisYear && q <= currentQuarter)),
      // Anything not already settled can be paid, future quarters included.
      payable: !settled,
    };
  });
}

type YearQuarter = { year: number; quarter: number };

function quartersIn(list: YearQuarter[] | null | undefined, year: number) {
  return new Set(
    (list ?? [])
      .filter((x) => x.year === year)
      .map((x) => x.quarter)
      .filter((q): q is number => !!q)
  );
}

// Per-quarter dues status for one member in a given year. `withLedger` adds
// which payment settled each paid quarter — for the admin console, which can
// undo a quarter an admin recorded by hand.
export async function memberDuesStatus(
  memberId: string,
  year: number,
  opts: { withLedger?: boolean } = {}
) {
  const settings = await getOrCreateSettings();

  const paidDocs = await PaymentModel.find({
    memberId,
    purpose: "dues_renewal",
    status: "success",
    year,
  }).select("quarter recordedBy");
  const ledger = new Map<number, { id: string; manual: boolean }>();
  for (const p of paidDocs) {
    if (p.quarter) {
      ledger.set(p.quarter, { id: String(p._id), manual: Boolean(p.recordedBy) });
    }
  }

  const member = await MemberModel.findById(memberId).select("duesWaivers");
  const quarters = quarterStates({
    year,
    paid: new Set(ledger.keys()),
    waived: quartersIn(member?.duesWaivers, year),
    disabled: quartersIn(settings.disabledDuesQuarters, year),
  });

  return {
    year,
    currentQuarter: currentQuarterOf(),
    amount: settings.quarterlyDues.amount,
    currency: settings.quarterlyDues.currency,
    quarters: opts.withLedger
      ? quarters.map((q) => ({ ...q, payment: ledger.get(q.quarter) ?? null }))
      : quarters,
  };
}

// Every active member's dues for a year in one pass — the admin Dues page and
// the dashboard's arrears figure. Admin accounts don't pay dues and are left
// out, as on the admin member page.
export async function duesOverview(year: number) {
  const settings = await getOrCreateSettings();
  const [members, payments] = await Promise.all([
    MemberModel.find({ status: "active", role: "member" })
      .select("fullName email applicantId duesWaivers")
      .sort({ fullName: 1 })
      .lean(),
    PaymentModel.find({ purpose: "dues_renewal", status: "success", year })
      .select("memberId quarter amount recordedBy")
      .lean(),
  ]);

  // memberId → quarter → recorded by an admin?
  const paidBy = new Map<string, Map<number, boolean>>();
  let collected = 0; // pesewas, so the sum can't pick up float dust
  for (const p of payments) {
    collected += Math.round(p.amount * 100);
    if (!p.quarter) continue;
    const key = String(p.memberId);
    if (!paidBy.has(key)) paidBy.set(key, new Map());
    paidBy.get(key)!.set(p.quarter, Boolean(p.recordedBy));
  }

  const disabled = quartersIn(settings.disabledDuesQuarters, year);
  const rows = members.map((m) => {
    const paid = paidBy.get(String(m._id)) ?? new Map<number, boolean>();
    const quarters = quarterStates({
      year,
      paid: new Set(paid.keys()),
      waived: quartersIn(m.duesWaivers, year),
      disabled,
    }).map((q) => ({ ...q, manual: paid.get(q.quarter) ?? false }));
    return {
      memberId: String(m._id),
      fullName: m.fullName,
      email: m.email,
      applicantId: m.applicantId ?? null,
      quarters,
      owed: quarters.filter((q) => q.due).length,
    };
  });

  const rate = settings.quarterlyDues.amount;
  const quartersOwed = rows.reduce((sum, r) => sum + r.owed, 0);
  return {
    year,
    currentQuarter: currentQuarterOf(),
    amount: rate,
    currency: settings.quarterlyDues.currency,
    rows,
    summary: {
      activeMembers: rows.length,
      membersOwing: rows.filter((r) => r.owed > 0).length,
      quartersOwed,
      // At today's rate — what it would take to clear every overdue quarter.
      amountOwed: (Math.round(rate * 100) * quartersOwed) / 100,
      quartersPaid: payments.length,
      collected: collected / 100,
    },
  };
}
