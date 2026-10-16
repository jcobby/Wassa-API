// Shapes ledger records for the admin console's receipts and statements.
// `channel` is how the money moved as Paystack reports it (mobile_money, card,
// bank, bank_transfer, ussd, …) — null until a transaction has been verified.

function channelOf(paystackData: unknown): string | null {
  const channel = (paystackData as { channel?: unknown } | null)?.channel;
  return typeof channel === "string" && channel ? channel : null;
}

type RawPayment = {
  _id: unknown;
  reference: string;
  batchReference?: string | null;
  amount: number;
  currency: string;
  status: string;
  purpose: string;
  year: number;
  quarter?: number | null;
  paystackData?: unknown;
  createdAt?: Date;
  completedAt?: Date | null;
};

export function paymentView(p: RawPayment) {
  return {
    id: String(p._id),
    reference: p.reference,
    batchReference: p.batchReference ?? null,
    amount: p.amount,
    currency: p.currency,
    status: p.status,
    purpose: p.purpose,
    year: p.year,
    quarter: p.quarter ?? null,
    channel: channelOf(p.paystackData),
    createdAt: p.createdAt ?? null,
    completedAt: p.completedAt ?? null,
  };
}

type RawContribution = {
  _id: unknown;
  donorName: string;
  donorEmail: string;
  donorPhone?: string | null;
  anonymous?: boolean | null;
  amount: number;
  currency: string;
  cause?: string | null;
  message?: string | null;
  memberId?: unknown;
  reference: string;
  status: string;
  paystackData?: unknown;
  createdAt?: Date;
  completedAt?: Date | null;
};

export function contributionView(c: RawContribution) {
  return {
    id: String(c._id),
    donorName: c.donorName,
    donorEmail: c.donorEmail,
    donorPhone: c.donorPhone ?? "",
    anonymous: Boolean(c.anonymous),
    amount: c.amount,
    currency: c.currency,
    cause: c.cause ?? "",
    message: c.message ?? "",
    memberId: c.memberId ? String(c.memberId) : null,
    reference: c.reference,
    status: c.status,
    channel: channelOf(c.paystackData),
    createdAt: c.createdAt ?? null,
    completedAt: c.completedAt ?? null,
  };
}

type RawMember = {
  _id: unknown;
  fullName: string;
  email: string;
  applicantId?: string | null;
};

// Who a receipt or statement is for.
export function memberContact(m: RawMember) {
  return {
    id: String(m._id),
    fullName: m.fullName,
    email: m.email,
    applicantId: m.applicantId ?? null,
  };
}
