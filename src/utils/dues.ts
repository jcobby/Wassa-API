import { PaymentModel } from "../models/Payment.js";
import { MemberModel } from "../models/Member.js";
import { getOrCreateSettings } from "../models/Settings.js";

export function currentQuarterOf(date = new Date()): number {
  return Math.floor(date.getMonth() / 3) + 1; // 1-4
}

// Per-quarter dues status for a member in a given year. A quarter is:
//   paid    — a successful dues_renewal payment exists for it
//   waived  — an admin has waived it (member doesn't owe it)
//   due     — this/a past quarter that is neither paid nor waived
//   upcoming— a future quarter
//
// `payable` is separate from `due`: a future quarter isn't owed yet but can
// still be settled in advance, so the page offers a "pay ahead" button.
export async function memberDuesStatus(memberId: string, year: number) {
  const currentQuarter = currentQuarterOf();
  const settings = await getOrCreateSettings();

  const paidDocs = await PaymentModel.find({
    memberId,
    purpose: "dues_renewal",
    status: "success",
    year,
  }).select("quarter");
  const paidQuarters = new Set(
    paidDocs.map((p) => p.quarter).filter((q): q is number => !!q)
  );

  const member = await MemberModel.findById(memberId).select("duesWaivers");
  const waived = new Set(
    (member?.duesWaivers ?? [])
      .filter((w) => w.year === year)
      .map((w) => w.quarter)
      .filter((q): q is number => !!q)
  );

  // Quarters the association has disabled for everyone — no one owes them.
  const disabled = new Set(
    (settings.disabledDuesQuarters ?? [])
      .filter((d) => d.year === year)
      .map((d) => d.quarter)
      .filter((q): q is number => !!q)
  );

  return {
    year,
    currentQuarter,
    amount: settings.quarterlyDues.amount,
    currency: settings.quarterlyDues.currency,
    quarters: [1, 2, 3, 4].map((q) => {
      const settled = paidQuarters.has(q) || waived.has(q) || disabled.has(q);
      return {
        quarter: q,
        paid: paidQuarters.has(q),
        waived: waived.has(q),
        disabled: disabled.has(q),
        due: q <= currentQuarter && !settled,
        // Anything not already settled can be paid, future quarters included.
        payable: !settled,
      };
    }),
  };
}
