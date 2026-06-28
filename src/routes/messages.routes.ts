import { Router } from "express";
import { ContactMessageModel } from "../models/ContactMessage.js";
import { ContactInput } from "../utils/validation.js";
import { requireAuth } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { HttpError } from "../middleware/error.js";
import { rateLimit } from "../middleware/rateLimit.js";

export const messagesRouter = Router();

const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message:
    "Too many messages sent from this network. Please try again later.",
});

// Public: submit contact message
messagesRouter.post("/", contactLimiter, async (req, res, next) => {
  try {
    const input = ContactInput.parse(req.body);
    const msg = await ContactMessageModel.create(input);
    res.status(201).json({ id: String(msg._id) });
  } catch (err) {
    next(err);
  }
});

// Admin: list
messagesRouter.get("/", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const status = (req.query.status as string) || "all";
    const filter: Record<string, unknown> = {};
    if (status === "unread") filter.readAt = null;
    if (status === "read") filter.readAt = { $ne: null };
    const list = await ContactMessageModel.find(filter)
      .sort({ submittedAt: -1 })
      .limit(200)
      .lean();
    res.json(
      list.map((m) => ({
        id: String(m._id),
        firstName: m.firstName,
        lastName: m.lastName,
        email: m.email,
        message: m.message,
        submittedAt: m.submittedAt,
        readAt: m.readAt,
      }))
    );
  } catch (err) {
    next(err);
  }
});

// Admin: stats
messagesRouter.get(
  "/stats",
  requireAuth,
  requireAdmin,
  async (_req, res, next) => {
    try {
      const [unread, total] = await Promise.all([
        ContactMessageModel.countDocuments({ readAt: null }),
        ContactMessageModel.countDocuments({}),
      ]);
      res.json({ unread, total });
    } catch (err) {
      next(err);
    }
  }
);

// Admin: mark as read
messagesRouter.patch(
  "/:id/read",
  requireAuth,
  requireAdmin,
  async (req, res, next) => {
    try {
      const msg = await ContactMessageModel.findById(req.params.id);
      if (!msg) throw new HttpError(404, "Message not found");
      if (!msg.readAt) {
        msg.readAt = new Date();
        msg.readBy = req.user!.sub as unknown as typeof msg.readBy;
        await msg.save();
      }
      res.json({ id: String(msg._id), readAt: msg.readAt });
    } catch (err) {
      next(err);
    }
  }
);
