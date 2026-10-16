import { PaymentModel } from "../models/Payment.js";
import { MemberModel } from "../models/Member.js";
import { sendEmail } from "../email/client.js";
import { duesReceiptEmail } from "../email/templates/duesReceipt.js";
import { channelLabel } from "./transactions.js";
import { config } from "../config.js";

// Emails the member a receipt for a dues payment — one quarter, or every
// quarter of a multi-quarter checkout — exactly once. The first row is the
// lock: whichever caller flips its receiptSentAt sends the email, so the
// webhook and the return page fulfilling the same payment can't both send one.
// Claiming before sending means a crash mid-send loses a receipt rather than
// duplicating it. Returns whether this call sent it.
export async function sendDuesReceipt(paymentIds: unknown[]): Promise<boolean> {
  const rows = await PaymentModel.find({
    _id: { $in: paymentIds },
    purpose: "dues_renewal",
    status: "success",
  }).sort({ _id: 1 });
  if (rows.length === 0) return false;

  const claimed = await PaymentModel.findOneAndUpdate(
    { _id: rows[0]._id, receiptSentAt: null },
    { $set: { receiptSentAt: new Date() } }
  );
  if (!claimed) return false;
  await PaymentModel.updateMany(
    { _id: { $in: rows.map((r) => r._id) }, receiptSentAt: null },
    { $set: { receiptSentAt: new Date() } }
  );

  const member = await MemberModel.findById(rows[0].memberId).select(
    "fullName email applicantId"
  );
  if (!member) return false;

  const first = rows[0];
  const quarters = rows
    .filter((r) => r.quarter)
    .map((r) => ({ year: r.year, quarter: r.quarter! }))
    .sort((a, b) => a.year - b.year || a.quarter - b.quarter);
  const paystackChannel = (first.paystackData as { channel?: string } | null)
    ?.channel;

  const tpl = duesReceiptEmail({
    fullName: member.fullName,
    applicantId: member.applicantId ?? null,
    quarters,
    total: rows.reduce((sum, r) => sum + Math.round(r.amount * 100), 0) / 100,
    currency: first.currency,
    paidAt: first.completedAt ?? new Date(),
    method: channelLabel(paystackChannel) ?? (first.method || null),
    // What the member can match on their own records: the Paystack checkout
    // reference, or the admin's receipt number for a cash payment.
    reference: first.externalReference || first.batchReference || first.reference,
    duesUrl: `${config.publicBaseUrl}/dashboard/dues`,
  });
  await sendEmail({
    to: member.email,
    subject: tpl.subject,
    html: tpl.html,
    text: tpl.text,
  });
  return true;
}
