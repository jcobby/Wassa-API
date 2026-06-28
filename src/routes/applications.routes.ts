import { Router } from "express";
import crypto from "node:crypto";
import { ApplicationModel } from "../models/Application.js";
import { MemberModel } from "../models/Member.js";
import {
  ApplicationInput,
  ReviewInput,
  VerifyEmailInput,
} from "../utils/validation.js";
import { requireAuth } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { HttpError } from "../middleware/error.js";
import { getOrCreateSettings } from "../models/Settings.js";
import { sendEmail } from "../email/client.js";
import { approvalEmail } from "../email/templates/approval.js";
import { verifyEmailTemplate } from "../email/templates/verifyEmail.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { config } from "../config.js";

export const applicationsRouter = Router();

// Submitting sends a confirmation email and writes a record — cap per network.
const submitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message:
    "Too many applications submitted from this network. Please try again later.",
});
const verifyLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30 });
const adminResendLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });

// Never-confirmed applications are auto-deleted this long after they're created
// (or after a confirmation link is re-sent). Cleared the instant they confirm.
const UNCONFIRMED_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

// Public: submit a new application
applicationsRouter.post("/", submitLimiter, async (req, res, next) => {
  try {
    const input = ApplicationInput.parse(req.body);
    const verifyToken = crypto.randomBytes(32).toString("hex");
    const verifyTokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
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

      const verifyToken = crypto.randomBytes(32).toString("hex");
      const verifyTokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      app.verifyToken = verifyToken;
      app.verifyTokenExpiresAt = verifyTokenExpiresAt;
      // A fresh link supersedes any old one; require them to confirm again and
      // restart the auto-cleanup clock so a resent-but-ignored app still purges.
      app.emailVerified = false;
      app.cleanupAt = new Date(Date.now() + UNCONFIRMED_TTL_MS);
      await app.save();

      const tpl = verifyEmailTemplate({
        fullName: app.fullName,
        verifyUrl: `${config.publicBaseUrl}/membership/verify/${verifyToken}`,
        expiresAt: verifyTokenExpiresAt,
      });
      await sendEmail({
        to: app.email,
        subject: tpl.subject,
        html: tpl.html,
        text: tpl.text,
      });

      res.json({ ok: true, email: app.email });
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
      res.json(app);
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

      const member = await MemberModel.create({
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

      app.status = "approved";
      app.reviewedAt = new Date();
      app.reviewedBy = req.user!.sub as unknown as typeof app.reviewedBy;
      app.reviewNotes = notes;
      app.cleanupAt = null;
      await app.save();

      // Send approval email with payment link
      const settings = await getOrCreateSettings();
      const paymentUrl = `${config.publicBaseUrl}/membership/payment/${token}`;
      let emailSent = false;
      let emailError: string | undefined;
      try {
        const tpl = approvalEmail({
          fullName: app.fullName,
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
      const { notes } = ReviewInput.parse(req.body ?? {});
      const app = await ApplicationModel.findById(req.params.id);
      if (!app) throw new HttpError(404, "Application not found");
      if (app.status === "rejected") {
        throw new HttpError(400, "Application already rejected");
      }
      app.status = "rejected";
      app.reviewedAt = new Date();
      app.reviewedBy = req.user!.sub as unknown as typeof app.reviewedBy;
      app.reviewNotes = notes;
      app.cleanupAt = null;
      await app.save();
      res.json({ id: String(app._id), status: app.status });
    } catch (err) {
      next(err);
    }
  }
);

type RawApp = {
  _id: unknown;
  fullName: string;
  email: string;
  emailVerified?: boolean;
  status: string;
  submittedAt?: Date;
  occupation?: string;
  countryOfResidence?: string;
};

function formatList(app: RawApp) {
  return {
    id: String(app._id),
    fullName: app.fullName,
    email: app.email,
    emailVerified: Boolean(app.emailVerified),
    status: app.status,
    submittedAt: app.submittedAt,
    occupation: app.occupation,
    countryOfResidence: app.countryOfResidence,
  };
}
