import { Router } from "express";
import { Types } from "mongoose";
import { DuesModel } from "../models/Dues.js";
import { MemberModel } from "../models/Member.js";
import { PaymentModel } from "../models/Payment.js";
import { getOrCreateSettings } from "../models/Settings.js";
import { RecordQuarterInput } from "../utils/validation.js";
import { requireAuth } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { HttpError } from "../middleware/error.js";
import { duesOverview, memberDuesStatus } from "../utils/dues.js";
import { sendDuesReceipt } from "../utils/duesReceipt.js";
import { newReference } from "../payments/paystack.js";

export const duesRouter = Router();

// Dues are quarterly and live on Payment rows (one per quarter). The yearly
// Dues records below are kept only as history from before quarterly dues.

// Auth: own yearly records from before quarterly dues (history only)
duesRouter.get("/me", requireAuth, async (req, res, next) => {
  try {
    const list = await DuesModel.find({ memberId: req.user!.sub })
      .sort({ year: -1 })
      .lean();
    res.json(list.map(format));
  } catch (err) {
    next(err);
  }
});

function yearParam(raw: unknown): number {
  const year = Number(raw) || new Date().getFullYear();
  if (!Number.isInteger(year) || year < 2020 || year > 2100) {
    throw new HttpError(400, "Invalid year");
  }
  return year;
}

// Admin: every active member's quarters for a year — paid, waived, turned off,
// due or upcoming — by the same rule as the member's own dues page.
// ?view=owing keeps only members with an overdue quarter.
duesRouter.get("/", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const overview = await duesOverview(yearParam(req.query.year));
    const search = (req.query.search as string | undefined)?.trim().toLowerCase();
    let rows = overview.rows;
    if (req.query.view === "owing") rows = rows.filter((r) => r.owed > 0);
    if (search) {
      rows = rows.filter((r) =>
        [r.fullName, r.email, r.applicantId ?? ""].some((v) =>
          v.toLowerCase().includes(search)
        )
      );
    }
    res.json({ ...overview, rows });
  } catch (err) {
    next(err);
  }
});

// Admin: the year's headline figures — members owing, quarters owed, money
// collected. Feeds the dashboard's arrears card.
duesRouter.get("/stats", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const o = await duesOverview(yearParam(req.query.year));
    res.json({
      year: o.year,
      currentQuarter: o.currentQuarter,
      currency: o.currency,
      ...o.summary,
    });
  } catch (err) {
    next(err);
  }
});

// Admin: record one quarter paid outside Paystack (cash, bank transfer, …).
// It becomes an ordinary successful dues payment, so the quarter shows as paid
// everywhere — the member's dues page included — and can't be paid twice.
duesRouter.post("/quarters", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const input = RecordQuarterInput.parse(req.body);
    if (!Types.ObjectId.isValid(input.memberId)) {
      throw new HttpError(400, "Invalid member");
    }
    if (input.year > new Date().getFullYear() + 1) {
      throw new HttpError(400, "Dues can be recorded up to the end of next year.");
    }
    const member = await MemberModel.findById(input.memberId).select("status role");
    if (!member) throw new HttpError(404, "Member not found");
    if (
      member.role !== "member" ||
      (member.status !== "active" && member.status !== "suspended")
    ) {
      throw new HttpError(
        400,
        "Dues can only be recorded for active or suspended members."
      );
    }

    const status = await memberDuesStatus(input.memberId, input.year);
    const q = status.quarters.find((x) => x.quarter === input.quarter)!;
    if (q.paid) throw new HttpError(409, "This quarter is already paid.");
    if (q.waived) {
      throw new HttpError(
        409,
        "This quarter is waived for this member. Un-waive it first if they're paying it."
      );
    }
    if (q.disabled) {
      throw new HttpError(409, "Dues collection is turned off for this quarter.");
    }

    const settings = await getOrCreateSettings();
    const payment = await PaymentModel.create({
      memberId: member._id,
      reference: newReference("wpncash"),
      amount: input.amount,
      currency: settings.quarterlyDues.currency,
      status: "success",
      purpose: "dues_renewal",
      year: input.year,
      quarter: input.quarter,
      completedAt: input.paidAt ?? new Date(),
      recordedBy: new Types.ObjectId(req.user!.sub),
      method: input.method,
      externalReference: input.reference,
      notes: input.notes,
    });

    // The payment is recorded either way; the admin is told if the receipt
    // didn't go.
    let receiptSent = false;
    let receiptError: string | undefined;
    if (input.sendReceipt) {
      try {
        receiptSent = await sendDuesReceipt([payment._id]);
      } catch (err) {
        console.error("[dues-receipt] failed", payment.reference, err);
        receiptError = err instanceof Error ? err.message : String(err);
      }
    }

    res.status(201).json({
      paymentId: String(payment._id),
      receiptSent,
      receiptError,
      dues: await memberDuesStatus(input.memberId, input.year, {
        withLedger: true,
      }),
    });
  } catch (err) {
    next(err);
  }
});

// Admin: undo a quarter recorded by hand in error. Paystack payments can't be
// removed here — that money was actually collected by the gateway.
duesRouter.delete(
  "/quarters/:paymentId",
  requireAuth,
  requireAdmin,
  async (req, res, next) => {
    try {
      if (!Types.ObjectId.isValid(req.params.paymentId)) {
        throw new HttpError(404, "Payment not found");
      }
      const p = await PaymentModel.findById(req.params.paymentId);
      if (!p || p.purpose !== "dues_renewal") {
        throw new HttpError(404, "Payment not found");
      }
      if (!p.recordedBy) {
        throw new HttpError(
          400,
          "Only payments recorded by hand can be removed. Paystack payments stay as collected."
        );
      }
      await p.deleteOne();
      res.json({
        dues: await memberDuesStatus(String(p.memberId), p.year, {
          withLedger: true,
        }),
      });
    } catch (err) {
      next(err);
    }
  }
);

type RawDues = {
  _id: unknown;
  memberId: unknown;
  year: number;
  amountPaid?: number;
  paid?: boolean;
  paidAt?: Date | null;
  method?: string;
  reference?: string;
  notes?: string;
};

function format(d: RawDues) {
  return {
    id: String(d._id),
    memberId: String(d.memberId),
    year: d.year,
    amountPaid: d.amountPaid ?? 0,
    paid: d.paid ?? false,
    paidAt: d.paidAt ?? null,
    method: d.method ?? "",
    reference: d.reference ?? "",
    notes: d.notes ?? "",
  };
}
