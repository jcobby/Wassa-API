import { Router } from "express";
import crypto from "node:crypto";
import { MemberModel } from "../models/Member.js";
import { getOrCreateSettings } from "../models/Settings.js";
import { memberDuesStatus } from "../utils/dues.js";
import { DuesWaiverInput } from "../utils/validation.js";
import { requireAuth } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { HttpError } from "../middleware/error.js";
import { sendEmail } from "../email/client.js";
import { approvalEmail } from "../email/templates/approval.js";
import { welcomeEmail } from "../email/templates/welcome.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { config } from "../config.js";

const TOKEN_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

export const membersRouter = Router();

const resendLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });

// Auth: current user's own profile
membersRouter.get("/me", requireAuth, async (req, res, next) => {
  try {
    const m = await MemberModel.findById(req.user!.sub).select(
      "-passwordHash -setPasswordToken -tokenExpiresAt"
    );
    if (!m) throw new HttpError(404, "Member not found");
    res.json(m);
  } catch (err) {
    next(err);
  }
});

// Admin: list with search & status filter
membersRouter.get("/", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const status = (req.query.status as string) || undefined;
    const search = (req.query.search as string)?.trim();
    const filter: Record<string, unknown> = {};
    if (status && ["active", "suspended", "terminated"].includes(status)) {
      filter.status = status;
    }
    if (search) {
      const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [{ fullName: rx }, { email: rx }];
    }
    const members = await MemberModel.find(filter)
      .select(
        "applicantId fullName email role status joinedAt occupation countryOfResidence"
      )
      .sort({ joinedAt: -1 })
      .limit(500)
      .lean();
    res.json(
      members.map((m) => ({
        id: String(m._id),
        applicantId: m.applicantId ?? null,
        fullName: m.fullName,
        email: m.email,
        role: m.role,
        status: m.status,
        joinedAt: m.joinedAt,
        occupation: m.occupation,
        countryOfResidence: m.countryOfResidence,
      }))
    );
  } catch (err) {
    next(err);
  }
});

// Admin: stats
membersRouter.get(
  "/stats",
  requireAuth,
  requireAdmin,
  async (_req, res, next) => {
    try {
      const [active, suspended, terminated, total] = await Promise.all([
        MemberModel.countDocuments({ status: "active" }),
        MemberModel.countDocuments({ status: "suspended" }),
        MemberModel.countDocuments({ status: "terminated" }),
        MemberModel.countDocuments({}),
      ]);
      res.json({ active, suspended, terminated, total });
    } catch (err) {
      next(err);
    }
  }
);

// Admin: detail
membersRouter.get(
  "/:id",
  requireAuth,
  requireAdmin,
  async (req, res, next) => {
    try {
      const m = await MemberModel.findById(req.params.id).select(
        "-setPasswordToken -tokenExpiresAt"
      );
      if (!m) throw new HttpError(404, "Member not found");
      // Expose whether a password is set (so the admin UI can offer a resend)
      // without ever leaking the hash itself.
      const obj = m.toObject() as Record<string, unknown>;
      const hasPassword = Boolean(obj.passwordHash);
      delete obj.passwordHash;
      res.json({ ...obj, hasPassword });
    } catch (err) {
      next(err);
    }
  }
);

// Admin: a member's quarterly dues status (paid / waived / due per quarter)
membersRouter.get(
  "/:id/dues",
  requireAuth,
  requireAdmin,
  async (req, res, next) => {
    try {
      const exists = await MemberModel.exists({ _id: req.params.id });
      if (!exists) throw new HttpError(404, "Member not found");
      res.json(await memberDuesStatus(req.params.id, new Date().getFullYear()));
    } catch (err) {
      next(err);
    }
  }
);

// Admin: waive (or un-waive) a member's dues for a specific quarter
membersRouter.post(
  "/:id/dues-waiver",
  requireAuth,
  requireAdmin,
  async (req, res, next) => {
    try {
      const { year, quarter, waived } = DuesWaiverInput.parse(req.body);
      const member = await MemberModel.findById(req.params.id);
      if (!member) throw new HttpError(404, "Member not found");

      const has = member.duesWaivers.some(
        (w) => w.year === year && w.quarter === quarter
      );
      if (waived && !has) {
        member.duesWaivers.push({ year, quarter });
        await member.save();
      } else if (!waived && has) {
        const idx = member.duesWaivers.findIndex(
          (w) => w.year === year && w.quarter === quarter
        );
        if (idx >= 0) member.duesWaivers.splice(idx, 1);
        await member.save();
      }
      res.json(await memberDuesStatus(req.params.id, new Date().getFullYear()));
    } catch (err) {
      next(err);
    }
  }
);

// Admin: re-send the onboarding email a member is currently waiting on.
// Picks the right email from the member's state:
//   pending_payment      → approval email with the payment link
//   active, no password  → welcome email with the set-password link
membersRouter.post(
  "/:id/resend-email",
  resendLimiter,
  requireAuth,
  requireAdmin,
  async (req, res, next) => {
    try {
      const m = await MemberModel.findById(req.params.id);
      if (!m) throw new HttpError(404, "Member not found");

      const now = Date.now();

      if (m.status === "pending_payment") {
        let token = m.accessToken ?? "";
        let expires = m.accessTokenExpiresAt ?? null;
        if (!token || !expires || expires.getTime() < now) {
          token = crypto.randomBytes(32).toString("hex");
          expires = new Date(now + TOKEN_TTL_MS);
          m.accessToken = token;
          m.accessTokenExpiresAt = expires;
          await m.save();
        }
        const settings = await getOrCreateSettings();
        const tpl = approvalEmail({
          fullName: m.fullName,
          paymentUrl: `${config.publicBaseUrl}/membership/payment/${token}`,
          amount: settings.membershipFee.amount,
          currency: settings.membershipFee.currency,
          expiresAt: expires,
        });
        await sendEmail({
          to: m.email,
          subject: tpl.subject,
          html: tpl.html,
          text: tpl.text,
        });
        return res.json({ ok: true, kind: "payment", email: m.email });
      }

      if (m.status === "active" && !m.passwordHash) {
        let token = m.setPasswordToken ?? "";
        let expires = m.tokenExpiresAt ?? null;
        if (!token || !expires || expires.getTime() < now) {
          token = crypto.randomBytes(32).toString("hex");
          expires = new Date(now + TOKEN_TTL_MS);
          m.setPasswordToken = token;
          m.tokenExpiresAt = expires;
          await m.save();
        }
        const tpl = welcomeEmail({
          fullName: m.fullName,
          email: m.email,
          setPasswordUrl: `${config.publicBaseUrl}/set-password/${token}`,
          expiresAt: expires,
        });
        await sendEmail({
          to: m.email,
          subject: tpl.subject,
          html: tpl.html,
          text: tpl.text,
        });
        return res.json({ ok: true, kind: "set_password", email: m.email });
      }

      throw new HttpError(
        400,
        "This member has already set their password — there's no onboarding email to resend."
      );
    } catch (err) {
      next(err);
    }
  }
);

// Admin: suspend
membersRouter.patch(
  "/:id/suspend",
  requireAuth,
  requireAdmin,
  async (req, res, next) => {
    try {
      const m = await MemberModel.findById(req.params.id);
      if (!m) throw new HttpError(404, "Member not found");
      if (m.role === "admin") {
        throw new HttpError(400, "Admins cannot be suspended via this endpoint");
      }
      m.status = "suspended";
      await m.save();
      res.json({ id: String(m._id), status: m.status });
    } catch (err) {
      next(err);
    }
  }
);

// Admin: reinstate
membersRouter.patch(
  "/:id/reinstate",
  requireAuth,
  requireAdmin,
  async (req, res, next) => {
    try {
      const m = await MemberModel.findById(req.params.id);
      if (!m) throw new HttpError(404, "Member not found");
      m.status = "active";
      await m.save();
      res.json({ id: String(m._id), status: m.status });
    } catch (err) {
      next(err);
    }
  }
);
