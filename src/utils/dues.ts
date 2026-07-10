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

  return {
    year,
    currentQuarter,
    amount: settings.quarterlyDues.amount,
    currency: settings.quarterlyDues.currency,
    quarters: [1, 2, 3, 4].map((q) => ({
      quarter: q,
      paid: paidQuarters.has(q),
      waived: waived.has(q),
      due: q <= currentQuarter && !paidQuarters.has(q) && !waived.has(q),
    })),
  };
}
