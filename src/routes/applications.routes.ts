import { Router } from "express";
import crypto from "node:crypto";
import { Types } from "mongoose";
import { ApplicationModel } from "../models/Application.js";
import { MemberModel } from "../models/Member.js";
import { PaymentModel } from "../models/Payment.js";
import {
  ApplicationInput,
  ReopenInput,
  ResumeApplicationInput,
  ReviewInput,
  VerifyEmailInput,
} from "../utils/validation.js";
import { requireAuth } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { HttpError } from "../middleware/error.js";
import { getOrCreateSettings } from "../models/Settings.js";
import { sendEmail } from "../email/client.js";
import { approvalEmail } from "../email/templates/approval.js";
import { approvalWithdrawnEmail } from "../email/templates/approvalWithdrawn.js";
import { rejectionEmail } from "../email/templates/rejection.js";
import { verifyEmailTemplate } from "../email/templates/verifyEmail.js";
import { emailKey, rateLimit } from "../middleware/rateLimit.js";
import { nextApplicantId } from "../utils/applicantId.js";
import {
  resumeOnboarding,
  sendConfirmationLink,
  UNCONFIRMED_TTL_MS,
} from "../utils/onboarding.js";
import { verifyTransaction } from "../payments/paystack.js";
import { config } from "../config.js";

export const applicationsRouter = Router();

// Submitting sends a confirmation email and writes a record. Many phones on a
// Ghanaian mobile network share one public address, so the per-network cap is
// generous — a busy hour after an announcement mustn't lock real applicants
// out at the last step. The strict cap is per email address, which is what
// protects an inbox from being flooded.
const submitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 60,
  message:
    "A lot of applications have come from your network in the last hour. Please try again a little later.",
});
const submitEmailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  keyGenerator: emailKey,
  message:
    "You've submitted several times with this email in the last hour. Check your inbox (and spam) for the confirmation link, or try again later.",
});
const verifyLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30 });
const adminResendLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });
// "Continue your application" sends an email, so keep it tight — per network,
// and strictly per address so nobody's inbox can be flooded.
const resumeIpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: "Too many requests. Please try again later.",
});
const resumeEmailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  keyGenerator: emailKey,
  message:
    "We've already sent a few emails to this address. Please check your inbox, including spam, or try again later.",
});

const CORRECTION_REASON_REQUIRED =
  "Give a reason for changing the decision — it's kept on the record.";

type AppDoc = InstanceType<typeof ApplicationModel>;

// The member record an approval created for this application, if any. Matched
// by provenance first; the email fallback covers records made before that link
// was stored, but never claims a member admitted through another application.
async function approvedMemberFor(app: { _id: unknown; email: string }) {
  return (
    (await MemberModel.findOne({ applicationId: app._id })) ??
    (await MemberModel.findOne({
      email: app.email,
      role: "member",
      applicationId: null,
    }))
  );
}

async function adminName(id: string): Promise<string> {
  const m = await MemberModel.findById(id).select("fullName").lean();
  return m?.fullName ?? "";
}

// Decisions made before the log existed live only in reviewedAt/reviewNotes.
// Copy that in before logging anything new, so a correction's trail starts at
// the original decision rather than at the fix.
function seedHistory(app: AppDoc): void {
  if (app.decisionHistory.length > 0 || app.status === "pending") return;
  app.decisionHistory.push({
    action: app.status,
    at: app.reviewedAt ?? app.updatedAt,
    by: app.reviewedBy ?? null,
    byName: "",
    notes: app.reviewNotes ?? "",
    correction: false,
  });
}

// A rejected applicant may have applied again since. Reviving the old
// application next to the new one would leave two live applications for one
// person, so point the admin at the newer one instead.
async function assertNoNewerApplication(app: AppDoc): Promise<void> {
  const newer = await ApplicationModel.exists({
    _id: { $ne: app._id },
    email: app.email,
    status: { $in: ["pending", "approved"] },
  });
  if (newer) {
    throw new HttpError(
      409,
      "This applicant has applied again since this decision. Review their newer application instead."
    );
  }
}

// Undo what approving `app` set in motion, so the decision can be corrected.
// Approval created a member record awaiting payment and emailed a payment link;
// deleting that record cancels the link. Allowed only while no money has
// changed hands: once the fee is paid they are a member, and undoing that is a
// refund plus a suspension, not a silent delete.
async function revokeApproval(app: AppDoc): Promise<void> {
  const member = await approvedMemberFor(app);
  if (!member) return; // never created, or already removed by hand

  const alreadyPaid =
    "This applicant has already paid the membership fee, so the approval can no longer be reversed here. Suspend them from their member page and arrange any refund with the Treasurer.";
  if (member.role !== "member" || member.status !== "pending_payment") {
    throw new HttpError(409, alreadyPaid);
  }
  if (await PaymentModel.exists({ memberId: member._id, status: "success" })) {
    throw new HttpError(409, alreadyPaid);
  }

  // A checkout they opened may have been paid moments ago, with Paystack's
  // webhook still on its way (or a MoMo prompt still awaiting approval). Ask
  // Paystack before deleting anything.
  const open = await PaymentModel.find({
    memberId: member._id,
    status: "initialized",
  });
  for (const p of open) {
    let status: string;
    try {
      status = (await verifyTransaction(p.reference)).status;
    } catch (err) {
      console.error("[revoke-approval] verify failed", p.reference, err);
      throw new HttpError(
        502,
        "We couldn't confirm with Paystack that no payment is in progress for this applicant. Please try again in a moment."
      );
    }
    if (status === "success") {
      throw new HttpError(
        409,
        "A payment from this applicant has just come through, so their membership is now active and can't be reversed here. Refresh the page to see it."
      );
    }
    if (status !== "abandoned" && status !== "failed") {
      throw new HttpError(
        409,
        "This applicant has a payment in progress right now. Wait a few minutes for it to finish or fail, then try again."
      );
    }
  }

  // Keep the unfinished checkouts in the ledger; only the member record goes.
  if (open.length) {
    await PaymentModel.updateMany(
      { _id: { $in: open.map((p) => p._id) } },
      { $set: { status: "abandoned" } }
    );
  }
  await member.deleteOne();
}

// Tell an applicant the outcome: a plain rejection, or that an approval they
// were already emailed is withdrawn. Never fails the request — the decision is
// already saved; the admin is told if the email didn't go.
async function notifyApplicant(
  app: AppDoc,
  outcome: "rejected" | "approval_withdrawn" | "back_under_review"
): Promise<{ sent: boolean; error?: string }> {
  try {
    const tpl =
      outcome === "rejected"
        ? rejectionEmail({ fullName: app.fullName })
        : approvalWithdrawnEmail({
            fullName: app.fullName,
            outcome: outcome === "approval_withdrawn" ? "rejected" : "under_review",
          });
    await sendEmail({
      to: app.email,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
    });
    return { sent: true };
  } catch (err) {
    console.error(`[${outcome}-email] failed`, err);
    return {
      sent: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// Public: submit a new application
applicationsRouter.post("/", submitLimiter, submitEmailLimiter, async (req, res, next) => {
  try {
    const input = ApplicationInput.parse(req.body);

    // Guard against duplicate signups for the same email (email is already
    // lowercased/trimmed by the validator).
    // 1) Already a member — nothing to apply for; point them at login.
    const existingMember = await MemberModel.findOne({ email: input.email })
      .select("_id")
      .lean();
    if (existingMember) {
      throw new HttpError(
        409,
        "An account with this email already exists. Please log in, or use “Forgot password” if you’ve lost access."
      );
    }
    // 2) Look at any prior applications for this email.
    const priorApps = await ApplicationModel.find({ email: input.email })
      .select("_id status emailVerified")
      .lean();
    if (priorApps.some((a) => a.status === "approved")) {
      throw new HttpError(
        409,
        "An application with this email has already been approved. To get your payment link again, use “Continue your application” under Membership."
      );
    }
    if (priorApps.some((a) => a.status === "pending" && a.emailVerified)) {
      throw new HttpError(
        409,
        "You’ve already applied with this email and it’s under review — no need to apply again."
      );
    }
    // Any leftover *unconfirmed* pending applications are stale (the applicant
    // never clicked the confirm link). Remove them so this fresh submission
    // replaces them cleanly instead of piling up duplicates. Rejected apps are
    // left untouched so a rejected person can legitimately re-apply.
    const staleIds = priorApps
      .filter((a) => a.status === "pending" && !a.emailVerified)
      .map((a) => a._id);
    if (staleIds.length) {
      await ApplicationModel.deleteMany({ _id: { $in: staleIds } });
    }

    const verifyToken = crypto.randomBytes(32).toString("hex");
    const verifyTokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    // No WPN code yet. An identity code means "admitted", so it is issued only
    // when the Executive Council approves — see the approve handler below.
    const app = await ApplicationModel.create({
      ...input,
      emailVerified: false,
      verifyToken,
      verifyTokenExpiresAt,
      cleanupAt: new Date(Date.now() + UNCONFIRMED_TTL_MS),
    });

    // Double opt-in: confirm the applicant controls this address. Don't fail
    // the submission if email delivery hiccups — the application is recorded
    // and an admin can see it's unverified.
    const verifyUrl = `${config.publicBaseUrl}/membership/verify/${verifyToken}`;
    let emailSent = false;
    try {
      const tpl = verifyEmailTemplate({
        fullName: app.fullName,
        verifyUrl,
        expiresAt: verifyTokenExpiresAt,
      });
      await sendEmail({
        to: app.email,
        subject: tpl.subject,
        html: tpl.html,
        text: tpl.text,
      });
      emailSent = true;
    } catch (err) {
      console.error("[verify-email] failed", err);
    }

    res.status(201).json({
      id: String(app._id),
      status: app.status,
      submittedAt: app.submittedAt,
      emailSent,
      // Dev only: lets you complete email confirmation on-screen without a
      // working mailbox. Never sent in production — surfacing the token there
      // would let anyone "confirm" an address they don't actually control.
      verifyUrl: config.isProd ? undefined : verifyUrl,
    });
  } catch (err) {
    next(err);
  }
});

// Public: confirm an applicant's email address from the link we mailed them
applicationsRouter.post("/verify", verifyLimiter, async (req, res, next) => {
  try {
    const { token } = VerifyEmailInput.parse(req.body);
    const app = await ApplicationModel.findOne({ verifyToken: token });
    if (!app) throw new HttpError(400, "This link is not valid");
    if (
      !app.verifyTokenExpiresAt ||
      app.verifyTokenExpiresAt.getTime() < Date.now()
    ) {
      throw new HttpError(410, "This confirmation link has expired");
    }
    // Idempotent on purpose: the token stays valid until it expires, so a
    // repeated click (or React StrictMode's double-invoke in dev) just
    // re-confirms rather than erroring on an already-consumed token.
    if (!app.emailVerified) {
      app.emailVerified = true;
      app.cleanupAt = null; // confirmed → keep it permanently
      await app.save();
    }
    res.json({ ok: true, email: app.email });
  } catch (err) {
    next(err);
  }
});

// Admin: resend the email-confirmation link for a pending application
applicationsRouter.post(
  "/:id/resend-verification",
  adminResendLimiter,
  requireAuth,
  requireAdmin,
  async (req, res, next) => {
    try {
      const app = await ApplicationModel.findById(req.params.id);
      if (!app) throw new HttpError(404, "Application not found");
      if (app.status !== "pending") {
        throw new HttpError(
          400,
          "Only pending applications can be sent a confirmation link."
        );
      }

      await sendConfirmationLink(app);
      res.json({ ok: true, email: app.email });
    } catch (err) {
      next(err);
    }
  }
);

// Public: pick up an application where the applicant left off. Emails the link
// for whichever step they're stuck on — confirming their email, paying the
// registration fee, or setting a password. Always answers the same way, so it
// can't be used to find out who has applied.
applicationsRouter.post(
  "/resume",
  resumeIpLimiter,
  resumeEmailLimiter,
  async (req, res, next) => {
    try {
      const { email } = ResumeApplicationInput.parse(req.body);
      try {
        await resumeOnboarding(email);
      } catch (err) {
        // Logged, never surfaced — the reply must not depend on the account.
        console.error("[resume] failed", err);
      }
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

// Admin: list with optional status filter & search
applicationsRouter.get("/", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const status = (req.query.status as string) || undefined;
    const search = (req.query.search as string)?.trim();
    const filter: Record<string, unknown> = {};
    // "pending" is the real review queue — only applicants who confirmed their
    // email. Unconfirmed ones sit in a separate bucket until they verify.
    if (status === "unconfirmed") {
      filter.status = "pending";
      filter.emailVerified = false;
    } else if (status && ["pending", "approved", "rejected"].includes(status)) {
      filter.status = status;
      if (status === "pending") filter.emailVerified = true;
    }
    if (search) {
      const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [{ fullName: rx }, { email: rx }];
    }
    const apps = await ApplicationModel.find(filter)
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();
    res.json(apps.map(formatList));
  } catch (err) {
    next(err);
  }
});

// Admin: stats
applicationsRouter.get(
  "/stats",
  requireAuth,
  requireAdmin,
  async (_req, res, next) => {
    try {
      const [pending, unconfirmed, approved, rejected] = await Promise.all([
        ApplicationModel.countDocuments({
          status: "pending",
          emailVerified: true,
        }),
        ApplicationModel.countDocuments({
          status: "pending",
          emailVerified: false,
        }),
        ApplicationModel.countDocuments({ status: "approved" }),
        ApplicationModel.countDocuments({ status: "rejected" }),
      ]);
      res.json({ pending, unconfirmed, approved, rejected });
    } catch (err) {
      next(err);
    }
  }
);

// Admin: detail
applicationsRouter.get(
  "/:id",
  requireAuth,
  requireAdmin,
  async (req, res, next) => {
    try {
      const app = await ApplicationModel.findById(req.params.id).lean();
      if (!app) throw new HttpError(404, "Application not found");
      // For an approved application, the member record it created — the
      // console offers to reverse an approval only while that member hasn't
      // paid yet.
      let linkedMember: { id: string; status: string } | null = null;
      if (app.status === "approved") {
        const m = await approvedMemberFor(app);
        if (m) linkedMember = { id: String(m._id), status: m.status };
      }
      res.json({ ...app, linkedMember });
    } catch (err) {
      next(err);
    }
  }
);

// Admin: approve → create Member with set-password token
applicationsRouter.patch(
  "/:id/approve",
  requireAuth,
  requireAdmin,
  async (req, res, next) => {
    try {
      const { notes } = ReviewInput.parse(req.body ?? {});
      const app = await ApplicationModel.findById(req.params.id);
      if (!app) throw new HttpError(404, "Application not found");
      if (app.status === "approved") {
        throw new HttpError(400, "Application already approved");
      }
      // Approving a rejected application overturns that decision.
      const correcting = app.status === "rejected";
      if (correcting) {
        if (!notes) throw new HttpError(400, CORRECTION_REASON_REQUIRED);
        await assertNoNewerApplication(app);
      }
      if (!app.emailVerified) {
        throw new HttpError(
          400,
          "This applicant hasn't confirmed their email yet, so they can't be approved. Resend the confirmation link and wait for them to verify."
        );
      }

      const existing = await MemberModel.findOne({ email: app.email });
      if (existing) {
        throw new HttpError(
          409,
          "A member with this email already exists. Reject this application or merge manually."
        );
      }

      const token = crypto.randomBytes(32).toString("hex");
      const expires = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // 14 days

      // Issue the WPN identity code. Approval is the moment someone becomes a
      // member, so this is where the code is minted; it's then kept for life.
      // Legacy applications that were assigned one at submission keep theirs.
      let applicantId = app.applicantId;
      if (!applicantId) {
        applicantId = await nextApplicantId();
        app.applicantId = applicantId;
      }

      const member = await MemberModel.create({
        applicantId,
        fullName: app.fullName,
        title: app.title,
        titleOther: app.titleOther,
        gender: app.gender,
        dateOfBirth: app.dateOfBirth,
        mobileNumbers: app.mobileNumbers,
        email: app.email,
        postalAddress: app.postalAddress,
        cityOfResidence: app.cityOfResidence,
        countryOfResidence: app.countryOfResidence,
        homeCountry: app.homeCountry,
        hometown: app.hometown,
        fathersHometown: app.fathersHometown,
        fathersEthnicGroup: app.fathersEthnicGroup,
        mothersHometown: app.mothersHometown,
        mothersEthnicGroup: app.mothersEthnicGroup,
        occupation: app.occupation,
        currentPlaceOfWork: app.currentPlaceOfWork,
        jobTitle: app.jobTitle,
        educationalBackground: app.educationalBackground,
        workExperience: app.workExperience,
        areasOfInterest: app.areasOfInterest,
        nextOfKin: app.nextOfKin,
        role: "member",
        status: "pending_payment",
        accessToken: token,
        accessTokenExpiresAt: expires,
        applicationId: app._id,
      });

      const byName = await adminName(req.user!.sub);
      seedHistory(app);
      app.status = "approved";
      app.reviewedAt = new Date();
      app.reviewedBy = req.user!.sub as unknown as typeof app.reviewedBy;
      app.reviewNotes = notes;
      app.cleanupAt = null;
      app.decisionHistory.push({
        action: "approved",
        at: app.reviewedAt,
        by: new Types.ObjectId(req.user!.sub),
        byName,
        notes,
        correction: correcting,
      });
      await app.save();

      // Send approval email with payment link
      const settings = await getOrCreateSettings();
      const paymentUrl = `${config.publicBaseUrl}/membership/payment/${token}`;
      let emailSent = false;
      let emailError: string | undefined;
      try {
        const tpl = approvalEmail({
          fullName: app.fullName,
          applicantId,
          paymentUrl,
          amount: settings.membershipFee.amount,
          currency: settings.membershipFee.currency,
          expiresAt: expires,
        });
        await sendEmail({
          to: app.email,
          subject: tpl.subject,
          html: tpl.html,
          text: tpl.text,
        });
        emailSent = true;
      } catch (err) {
        emailError = err instanceof Error ? err.message : String(err);
        console.error("[approval-email] failed", err);
      }

      res.json({
        memberId: String(member._id),
        applicantId,
        application: { id: String(app._id), status: app.status },
        emailSent,
        emailError,
        // Surfaced only when email failed — admin can copy-paste this manually
        fallbackPaymentUrl: emailSent ? undefined : paymentUrl,
      });
    } catch (err) {
      next(err);
    }
  }
);

// Admin: reject
applicationsRouter.patch(
  "/:id/reject",
  requireAuth,
  requireAdmin,
  async (req, res, next) => {
    try {
      const { notes, notifyApplicant: notify } = ReviewInput.parse(
        req.body ?? {}
      );
      const app = await ApplicationModel.findById(req.params.id);
      if (!app) throw new HttpError(404, "Application not found");
      if (app.status === "rejected") {
        throw new HttpError(400, "Application already rejected");
      }
      // Rejecting an approved application overturns that decision — and must
      // first cancel the member record and payment link approval created.
      const correcting = app.status === "approved";
      if (correcting) {
        if (!notes) throw new HttpError(400, CORRECTION_REASON_REQUIRED);
        await revokeApproval(app);
      }

      const byName = await adminName(req.user!.sub);
      seedHistory(app);
      app.status = "rejected";
      app.reviewedAt = new Date();
      app.reviewedBy = req.user!.sub as unknown as typeof app.reviewedBy;
      app.reviewNotes = notes;
      app.cleanupAt = null;
      app.decisionHistory.push({
        action: "rejected",
        at: app.reviewedAt,
        by: new Types.ObjectId(req.user!.sub),
        byName,
        notes,
        correction: correcting,
      });
      await app.save();

      // A first-time rejection gets the rejection email; overturning an
      // approval gets the "approval withdrawn, don't pay" correction instead.
      const notice = notify
        ? await notifyApplicant(app, correcting ? "approval_withdrawn" : "rejected")
        : null;
      res.json({
        id: String(app._id),
        status: app.status,
        notified: notice?.sent ?? false,
        notifyError: notice?.error,
      });
    } catch (err) {
      next(err);
    }
  }
);

// Admin: send a decided application back to the review queue — the way to
// correct a decision made in error when the right outcome needs fresh review.
// Undoes an approval's side effects first.
applicationsRouter.patch(
  "/:id/reopen",
  requireAuth,
  requireAdmin,
  async (req, res, next) => {
    try {
      const { notes, notifyApplicant: notify } = ReopenInput.parse(
        req.body ?? {}
      );
      const app = await ApplicationModel.findById(req.params.id);
      if (!app) throw new HttpError(404, "Application not found");
      if (app.status === "pending") {
        throw new HttpError(400, "This application is already awaiting review.");
      }
      const wasApproved = app.status === "approved";
      if (wasApproved) await revokeApproval(app);
      else await assertNoNewerApplication(app);

      const byName = await adminName(req.user!.sub);
      seedHistory(app);
      app.status = "pending";
      app.reviewedAt = undefined;
      app.reviewedBy = undefined;
      app.reviewNotes = "";
      app.decisionHistory.push({
        action: "reopened",
        at: new Date(),
        by: new Types.ObjectId(req.user!.sub),
        byName,
        notes,
        correction: true,
      });
      await app.save();

      const notice =
        wasApproved && notify
          ? await notifyApplicant(app, "back_under_review")
          : null;
      res.json({
        id: String(app._id),
        status: app.status,
        notified: notice?.sent ?? false,
        notifyError: notice?.error,
      });
    } catch (err) {
      next(err);
    }
  }
);

type RawApp = {
  _id: unknown;
  applicantId?: string | null;
  fullName: string;
  email: string;
  emailVerified?: boolean;
  status: string;
  submittedAt?: Date;
  occupation?: string;
  countryOfResidence?: string;
  yearsOfExperience?: number | null;
};

function formatList(app: RawApp) {
  return {
    id: String(app._id),
    applicantId: app.applicantId ?? null,
    fullName: app.fullName,
    email: app.email,
    emailVerified: Boolean(app.emailVerified),
    status: app.status,
    submittedAt: app.submittedAt,
    occupation: app.occupation,
    countryOfResidence: app.countryOfResidence,
    // `null` for applications submitted before the question existed — the
    // admin table shows that as "Not stated", never as "0 years".
    yearsOfExperience: app.yearsOfExperience ?? null,
  };
}
