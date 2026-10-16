import crypto from "node:crypto";
import { MemberModel } from "../models/Member.js";
import { ApplicationModel } from "../models/Application.js";
import { getOrCreateSettings } from "../models/Settings.js";
import { sendEmail } from "../email/client.js";
import { approvalEmail } from "../email/templates/approval.js";
import { welcomeEmail } from "../email/templates/welcome.js";
import { verifyEmailTemplate } from "../email/templates/verifyEmail.js";
import { nextApplicantId } from "./applicantId.js";
import { config } from "../config.js";

// Re-sending the email an applicant or member is stuck waiting on. Shared by
// the admin console (one member or everyone at once), the public "continue
// your application" page and expired payment links, so every path issues
// links the same way.

const LINK_TTL_MS = 14 * 24 * 60 * 60 * 1000; // payment & set-password links
const VERIFY_TTL_MS = 7 * 24 * 60 * 60 * 1000; // email-confirmation links
// Never-confirmed applications are auto-deleted this long after they're created
// (or after a confirmation link is re-sent). Cleared the instant they confirm.
export const UNCONFIRMED_TTL_MS = 14 * 24 * 60 * 60 * 1000;

type MemberDoc = InstanceType<typeof MemberModel>;
type AppDoc = InstanceType<typeof ApplicationModel>;

// Both member emails carry the WPN ID. Every member gets one at approval, so
// this only backfills legacy records admitted before codes existed.
async function ensureApplicantId(m: MemberDoc): Promise<string> {
  if (!m.applicantId) {
    m.applicantId = await nextApplicantId();
    await m.save();
  }
  return m.applicantId;
}

// Approved, not yet paid: the approval email again, with the payment link. A
// still-valid link is re-sent as is, so an earlier email keeps working too; an
// expired one is replaced.
export async function sendPaymentLink(m: MemberDoc): Promise<void> {
  const applicantId = await ensureApplicantId(m);
  let token = m.accessToken ?? "";
  let expires = m.accessTokenExpiresAt ?? null;
  if (!token || !expires || expires.getTime() < Date.now()) {
    token = crypto.randomBytes(32).toString("hex");
    expires = new Date(Date.now() + LINK_TTL_MS);
    m.accessToken = token;
    m.accessTokenExpiresAt = expires;
    await m.save();
  }
  const settings = await getOrCreateSettings();
  const tpl = approvalEmail({
    fullName: m.fullName,
    applicantId,
    paymentUrl: `${config.publicBaseUrl}/membership/payment/${token}`,
    amount: settings.membershipFee.amount,
    currency: settings.membershipFee.currency,
    expiresAt: expires,
  });
  await sendEmail({ to: m.email, subject: tpl.subject, html: tpl.html, text: tpl.text });
}

// Paid, but never chose a password: the welcome email with the set-password
// link. Same reuse-or-replace rule as the payment link.
export async function sendSetPasswordLink(m: MemberDoc): Promise<void> {
  const applicantId = await ensureApplicantId(m);
  let token = m.setPasswordToken ?? "";
  let expires = m.tokenExpiresAt ?? null;
  if (!token || !expires || expires.getTime() < Date.now()) {
    token = crypto.randomBytes(32).toString("hex");
    expires = new Date(Date.now() + LINK_TTL_MS);
    m.setPasswordToken = token;
    m.tokenExpiresAt = expires;
    await m.save();
  }
  const tpl = welcomeEmail({
    fullName: m.fullName,
    email: m.email,
    applicantId,
    setPasswordUrl: `${config.publicBaseUrl}/set-password/${token}`,
    expiresAt: expires,
  });
  await sendEmail({ to: m.email, subject: tpl.subject, html: tpl.html, text: tpl.text });
}

// Applied, never confirmed their email: a fresh confirmation link. It
// supersedes any old one, and restarts the auto-cleanup clock so a
// resent-but-ignored application still purges.
export async function sendConfirmationLink(app: AppDoc): Promise<void> {
  const verifyToken = crypto.randomBytes(32).toString("hex");
  const verifyTokenExpiresAt = new Date(Date.now() + VERIFY_TTL_MS);
  app.verifyToken = verifyToken;
  app.verifyTokenExpiresAt = verifyTokenExpiresAt;
  app.emailVerified = false;
  app.cleanupAt = new Date(Date.now() + UNCONFIRMED_TTL_MS);
  await app.save();

  const tpl = verifyEmailTemplate({
    fullName: app.fullName,
    verifyUrl: `${config.publicBaseUrl}/membership/verify/${verifyToken}`,
    expiresAt: verifyTokenExpiresAt,
  });
  await sendEmail({ to: app.email, subject: tpl.subject, html: tpl.html, text: tpl.text });
}

export type ResumeStep = "payment" | "set_password" | "confirmation" | "none";

// Works out where someone stopped and re-sends that step's email. The result
// is for logging only — public callers must never reveal it, or the page
// becomes a way to find out who has applied.
export async function resumeOnboarding(email: string): Promise<ResumeStep> {
  const member = await MemberModel.findOne({ email });
  if (member) {
    if (member.role === "member" && member.status === "pending_payment") {
      await sendPaymentLink(member);
      return "payment";
    }
    if (member.status === "active" && !member.passwordHash) {
      await sendSetPasswordLink(member);
      return "set_password";
    }
    return "none"; // a full member: sign in, or reset the password
  }
  const unconfirmed = await ApplicationModel.findOne({
    email,
    status: "pending",
    emailVerified: false,
  }).sort({ createdAt: -1 });
  if (unconfirmed) {
    await sendConfirmationLink(unconfirmed);
    return "confirmation";
  }
  // Under review (nothing to send yet), rejected, never applied, or an
  // unconfirmed application that has already been cleaned up.
  return "none";
}

// "s•••1@gmail.com" — enough for someone to recognise their own address.
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return email;
  const shown = local.length <= 2 ? local[0] : `${local[0]}•••${local.at(-1)}`;
  return `${shown}@${domain}`;
}
