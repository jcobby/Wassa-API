import { MemberModel } from "../models/Member.js";
import { sendEmail } from "../email/client.js";
import { duesReminderEmail } from "../email/templates/duesReminder.js";
import { memberDuesStatus } from "./dues.js";
import { HttpError } from "../middleware/error.js";
import { config } from "../config.js";

type MemberDoc = InstanceType<typeof MemberModel>;

// Emails a member the quarters they owe and a link to pay them. Only this
// year's count: that's as far back as members can pay online, so the email
// never asks for something the dues page won't take. Refuses when nothing is
// owed, so a paid-up member is never chased.
export async function sendDuesReminder(m: MemberDoc) {
  const status = await memberDuesStatus(String(m._id), new Date().getFullYear());
  if (status.amount <= 0) {
    throw new HttpError(400, "Set the quarterly dues amount in Settings first.");
  }
  const quarters = status.quarters
    .filter((q) => q.due)
    .map((q) => ({ year: status.year, quarter: q.quarter }));
  if (quarters.length === 0) {
    throw new HttpError(400, `${m.fullName} has no dues outstanding for ${status.year}.`);
  }
  // In pesewas, so the total can't pick up float dust.
  const total = (Math.round(status.amount * 100) * quarters.length) / 100;

  const tpl = duesReminderEmail({
    fullName: m.fullName,
    applicantId: m.applicantId ?? null,
    quarters,
    total,
    currency: status.currency,
    duesUrl: `${config.publicBaseUrl}/dashboard/dues`,
    continueUrl: `${config.publicBaseUrl}/membership/continue`,
  });
  await sendEmail({ to: m.email, subject: tpl.subject, html: tpl.html, text: tpl.text });

  m.duesReminderSentAt = new Date();
  await m.save();
  return { quarters, total, currency: status.currency, sentAt: m.duesReminderSentAt };
}
