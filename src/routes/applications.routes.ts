import { Router } from "express";
import crypto from "node:crypto";
import { ApplicationModel } from "../models/Application.js";
import { MemberModel } from "../models/Member.js";
import { ApplicationInput, ReviewInput } from "../utils/validation.js";
import { requireAuth } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { HttpError } from "../middleware/error.js";
import { getOrCreateSettings } from "../models/Settings.js";
import { sendEmail } from "../email/client.js";
import { approvalEmail } from "../email/templates/approval.js";
import { config } from "../config.js";

export const applicationsRouter = Router();

// Public: submit a new application
applicationsRouter.post("/", async (req, res, next) => {
  try {
    const input = ApplicationInput.parse(req.body);
    const app = await ApplicationModel.create(input);
    res.status(201).json({
      id: String(app._id),
      status: app.status,
      submittedAt: app.submittedAt,
    });
  } catch (err) {
    next(err);
  }
});

// Admin: list with optional status filter & search
applicationsRouter.get("/", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const status = (req.query.status as string) || undefined;
    const search = (req.query.search as string)?.trim();
    const filter: Record<string, unknown> = {};
    if (status && ["pending", "approved", "rejected"].includes(status)) {
      filter.status = status;
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
      const [pending, approved, rejected] = await Promise.all([
        ApplicationModel.countDocuments({ status: "pending" }),
        ApplicationModel.countDocuments({ status: "approved" }),
        ApplicationModel.countDocuments({ status: "rejected" }),
      ]);
      res.json({ pending, approved, rejected });
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
    status: app.status,
    submittedAt: app.submittedAt,
    occupation: app.occupation,
    countryOfResidence: app.countryOfResidence,
  };
}
