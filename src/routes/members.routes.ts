import { Router } from "express";
import { MemberModel } from "../models/Member.js";
import { PaymentModel } from "../models/Payment.js";
import { ContributionModel } from "../models/Contribution.js";
import { DuesModel } from "../models/Dues.js";
import { memberDuesStatus } from "../utils/dues.js";
import { DuesWaiverInput } from "../utils/validation.js";
import { requireAuth } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { HttpError } from "../middleware/error.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { sendPaymentLink, sendSetPasswordLink } from "../utils/onboarding.js";
import { sendDuesReminder } from "../utils/duesReminder.js";
import {
  contributionView,
  memberContact,
  paymentView,
} from "../utils/transactions.js";

export const membersRouter = Router();

const resendLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });
// Emails everyone awaiting payment at once — a guard against double clicks (or
// two admins at once) turning into a flood of identical emails. One shared
// bucket, not per IP, and it sits after the admin check so outsiders can't use
// it up.
const bulkResendLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  keyGenerator: () => "bulk-payment-links",
  message:
    "Payment links have already been sent several times this hour. Please wait before sending again.",
});
// Dues reminders go one member at a time, so allow enough to work down a list.
const remindDuesLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: "Too many reminders sent in a short time. Please wait a few minutes.",
});

// Everything a member has paid or given — Paystack payments, dues an admin
// recorded by hand, voluntary contributions, and yearly records from before
// quarterly dues. `paidOnly` keeps just money received, for the member's own
// view; the admin statement can also show unfinished checkouts.
async function loadTransactions(memberId: string, paidOnly: boolean) {
  const m = await MemberModel.findById(memberId)
    .select("fullName email applicantId")
    .lean();
  if (!m) throw new HttpError(404, "Member not found");

  const paid = paidOnly ? { status: "success" } : {};
  const [payments, contributions, dues] = await Promise.all([
    PaymentModel.find({ memberId: m._id, ...paid }).sort({ createdAt: -1 }).lean(),
    // Gifts made while signed out still carry the member's email.
    ContributionModel.find({
      $or: [{ memberId: m._id }, { donorEmail: m.email }],
      ...paid,
    })
      .sort({ createdAt: -1 })
      .lean(),
    DuesModel.find({ memberId: m._id, paid: true }).sort({ year: -1 }).lean(),
  ]);

  // Paystack fulfilment also writes a yearly Dues record carrying the
  // payment's reference. Only the others were entered by hand.
  const paystackRefs = new Set(payments.map((p) => p.reference));
  const manual = dues
    .filter((d) => !d.reference || !paystackRefs.has(d.reference))
    .map((d) => ({
      id: String(d._id),
      year: d.year,
      amount: d.amountPaid ?? 0,
      method: d.method ?? "",
      reference: d.reference ?? "",
      notes: d.notes ?? "",
      paidAt: d.paidAt ?? null,
    }));

  return {
    member: memberContact(m),
    payments: payments.map(paymentView),
    contributions: contributions.map(contributionView),
    manual,
  };
}

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

// Auth: the signed-in member's own payment history, for their dashboard.
// Registered before /:id/... so "me" isn't read as an id.
membersRouter.get("/me/transactions", requireAuth, async (req, res, next) => {
  try {
    res.json(await loadTransactions(req.user!.sub, true));
  } catch (err) {
    next(err);
  }
});

function duesYear(raw: unknown): number {
  const year = Number(raw) || new Date().getFullYear();
  if (!Number.isInteger(year) || year < 2020 || year > 2100) {
    throw new HttpError(400, "Invalid year");
  }
  return year;
}

// Admin: list with search & status filter
membersRouter.get("/", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const status = (req.query.status as string) || undefined;
    const search = (req.query.search as string)?.trim();
    const filter: Record<string, unknown> = {};
    if (
      status &&
      ["active", "suspended", "terminated", "pending_payment"].includes(status)
    ) {
      filter.status = status;
    }
    if (search) {
      const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [{ fullName: rx }, { email: rx }];
    }
    const members = await MemberModel.find(filter)
      .select(
        "applicantId fullName email role status joinedAt occupation countryOfResidence duesReminderSentAt"
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
        duesReminderSentAt: m.duesReminderSentAt ?? null,
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
      const [active, suspended, terminated, pendingPayment, total] =
        await Promise.all([
          MemberModel.countDocuments({ status: "active" }),
          MemberModel.countDocuments({ status: "suspended" }),
          MemberModel.countDocuments({ status: "terminated" }),
          MemberModel.countDocuments({ status: "pending_payment" }),
          MemberModel.countDocuments({}),
        ]);
      res.json({ active, suspended, terminated, pendingPayment, total });
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

// Admin: a member's quarterly dues for a year (default this year), with the
// payment behind each paid quarter so a hand-recorded one can be undone.
membersRouter.get(
  "/:id/dues",
  requireAuth,
  requireAdmin,
  async (req, res, next) => {
    try {
      const exists = await MemberModel.exists({ _id: req.params.id });
      if (!exists) throw new HttpError(404, "Member not found");
      res.json(
        await memberDuesStatus(req.params.id, duesYear(req.query.year), {
          withLedger: true,
        })
      );
    } catch (err) {
      next(err);
    }
  }
);

// Admin: a member's full statement, unfinished checkouts included.
membersRouter.get(
  "/:id/transactions",
  requireAuth,
  requireAdmin,
  async (req, res, next) => {
    try {
      res.json(await loadTransactions(req.params.id, false));
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
      res.json(
        await memberDuesStatus(req.params.id, year, { withLedger: true })
      );
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

      if (m.status === "pending_payment") {
        await sendPaymentLink(m);
        return res.json({ ok: true, kind: "payment", email: m.email });
      }

      if (m.status === "active" && !m.passwordHash) {
        await sendSetPasswordLink(m);
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

// Admin: email one active member a reminder of the dues they owe this year,
// with a link to pay online. Refused if they owe nothing.
membersRouter.post(
  "/:id/remind-dues",
  requireAuth,
  requireAdmin,
  remindDuesLimiter,
  async (req, res, next) => {
    try {
      const m = await MemberModel.findById(req.params.id);
      if (!m) throw new HttpError(404, "Member not found");
      if (m.role !== "member" || m.status !== "active") {
        throw new HttpError(400, "Dues reminders can only be sent to active members.");
      }
      const out = await sendDuesReminder(m);
      res.json({ ok: true, email: m.email, ...out });
    } catch (err) {
      next(err);
    }
  }
);

// Admin: re-send the payment link to everyone who was approved but never paid.
// Each person gets their existing link if it's still valid, or a fresh one.
// One failed email doesn't stop the rest; failures are reported back.
membersRouter.post(
  "/resend-payment-links",
  requireAuth,
  requireAdmin,
  bulkResendLimiter,
  async (_req, res, next) => {
    try {
      const waiting = await MemberModel.find({
        status: "pending_payment",
        role: "member",
      });
      let sent = 0;
      const failed: string[] = [];
      for (const m of waiting) {
        try {
          await sendPaymentLink(m);
          sent += 1;
        } catch (err) {
          console.error("[bulk-payment-link] failed", m.email, err);
          failed.push(m.email);
        }
      }
      res.json({ total: waiting.length, sent, failed });
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
