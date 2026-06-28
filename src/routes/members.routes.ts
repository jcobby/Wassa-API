import { Router } from "express";
import { MemberModel } from "../models/Member.js";
import { requireAuth } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { HttpError } from "../middleware/error.js";

export const membersRouter = Router();

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
        "fullName email role status joinedAt occupation countryOfResidence"
      )
      .sort({ joinedAt: -1 })
      .limit(500)
      .lean();
    res.json(
      members.map((m) => ({
        id: String(m._id),
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
        "-passwordHash -setPasswordToken -tokenExpiresAt"
      );
      if (!m) throw new HttpError(404, "Member not found");
      res.json(m);
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
