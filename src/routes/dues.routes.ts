import { Router } from "express";
import { Types } from "mongoose";
import { DuesModel } from "../models/Dues.js";
import { MemberModel } from "../models/Member.js";
import { RecordPaymentInput } from "../utils/validation.js";
import { requireAuth } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { HttpError } from "../middleware/error.js";

export const duesRouter = Router();

// Auth: own payment history
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

// Admin: all members for a year, joined with payment status
duesRouter.get("/", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const year = Number(req.query.year) || new Date().getFullYear();
    const members = await MemberModel.find({ status: "active" })
      .select("fullName email")
      .sort({ fullName: 1 })
      .lean();
    const dues = await DuesModel.find({ year }).lean();
    const byMember = new Map(dues.map((d) => [String(d.memberId), d]));

    const rows = members.map((m) => {
      const d = byMember.get(String(m._id));
      return {
        memberId: String(m._id),
        fullName: m.fullName,
        email: m.email,
        year,
        paid: d?.paid ?? false,
        amountPaid: d?.amountPaid ?? 0,
        paidAt: d?.paidAt ?? null,
        method: d?.method ?? "",
        reference: d?.reference ?? "",
      };
    });
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// Admin: arrears (members with no paid record for the year)
duesRouter.get(
  "/arrears",
  requireAuth,
  requireAdmin,
  async (req, res, next) => {
    try {
      const year = Number(req.query.year) || new Date().getFullYear();
      const paidIds = await DuesModel.find({ year, paid: true }).distinct(
        "memberId"
      );
      const members = await MemberModel.find({
        status: "active",
        _id: { $nin: paidIds },
      })
        .select("fullName email joinedAt")
        .sort({ fullName: 1 })
        .lean();
      res.json(
        members.map((m) => ({
          memberId: String(m._id),
          fullName: m.fullName,
          email: m.email,
          joinedAt: m.joinedAt,
          year,
        }))
      );
    } catch (err) {
      next(err);
    }
  }
);

// Admin: stats for current year
duesRouter.get(
  "/stats",
  requireAuth,
  requireAdmin,
  async (req, res, next) => {
    try {
      const year = Number(req.query.year) || new Date().getFullYear();
      const [paid, totalActive] = await Promise.all([
        DuesModel.countDocuments({ year, paid: true }),
        MemberModel.countDocuments({ status: "active" }),
      ]);
      res.json({ year, paid, arrears: Math.max(0, totalActive - paid) });
    } catch (err) {
      next(err);
    }
  }
);

// Admin: record a payment (upsert on memberId+year)
duesRouter.post(
  "/payments",
  requireAuth,
  requireAdmin,
  async (req, res, next) => {
    try {
      const { memberId, year, amount, method, reference, notes } =
        RecordPaymentInput.parse(req.body);
      if (!Types.ObjectId.isValid(memberId)) {
        throw new HttpError(400, "Invalid memberId");
      }
      const member = await MemberModel.exists({ _id: memberId });
      if (!member) throw new HttpError(404, "Member not found");

      const doc = await DuesModel.findOneAndUpdate(
        { memberId, year },
        {
          $set: {
            amountPaid: amount,
            paid: amount > 0,
            paidAt: amount > 0 ? new Date() : null,
            method,
            reference,
            notes,
            recordedBy: req.user!.sub,
          },
        },
        { upsert: true, new: true }
      );
      res.json(format(doc.toObject()));
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
