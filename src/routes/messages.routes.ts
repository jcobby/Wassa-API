import { Router } from "express";
import { Types } from "mongoose";
import { ContactMessageModel } from "../models/ContactMessage.js";
import { MemberModel } from "../models/Member.js";
import { ContactInput, ContactReplyInput } from "../utils/validation.js";
import { requireAuth } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { HttpError } from "../middleware/error.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { sendEmail } from "../email/client.js";
import { contactReplyEmail } from "../email/templates/contactReply.js";

export const messagesRouter = Router();

const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message:
    "Too many messages sent from this network. Please try again later.",
});
const replyLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30 });

const DEFAULT_REPLY_SUBJECT =
  "Re: Your message to the Wassa Professionals Network";

type RawReply = {
  subject: string;
  body: string;
  sentAt?: Date | null;
  sentByName?: string | null;
};

function formatReply(r: RawReply) {
  return {
    subject: r.subject,
    body: r.body,
    sentAt: r.sentAt ?? null,
    sentByName: r.sentByName ?? "",
  };
}

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
        replies: (m.replies ?? []).map(formatReply),
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

// Admin: reply to the sender by email, straight from the console. The reply is
// recorded on the message only once it has actually been sent, so the thread
// never shows a reply the sender didn't receive.
messagesRouter.post(
  "/:id/reply",
  replyLimiter,
  requireAuth,
  requireAdmin,
  async (req, res, next) => {
    try {
      const { subject, message } = ContactReplyInput.parse(req.body);
      if (!Types.ObjectId.isValid(req.params.id)) {
        throw new HttpError(404, "Message not found");
      }
      const msg = await ContactMessageModel.findById(req.params.id);
      if (!msg) throw new HttpError(404, "Message not found");

      const admin = await MemberModel.findById(req.user!.sub)
        .select("fullName")
        .lean();
      const tpl = contactReplyEmail({
        firstName: msg.firstName,
        subject: subject || DEFAULT_REPLY_SUBJECT,
        body: message,
        originalMessage: msg.message,
        originalSentAt: msg.submittedAt ?? msg.createdAt,
      });
      try {
        await sendEmail({
          to: msg.email,
          subject: tpl.subject,
          html: tpl.html,
          text: tpl.text,
        });
      } catch (err) {
        console.error("[contact-reply] failed", err);
        throw new HttpError(
          502,
          "The reply couldn't be sent, so nothing was recorded. Please try again shortly."
        );
      }

      msg.replies.push({
        subject: tpl.subject,
        body: message,
        sentAt: new Date(),
        sentBy: new Types.ObjectId(req.user!.sub),
        sentByName: admin?.fullName ?? "",
      });
      // Replying implies it's been read.
      if (!msg.readAt) {
        msg.readAt = new Date();
        msg.readBy = new Types.ObjectId(req.user!.sub);
      }
      await msg.save();

      res.status(201).json({
        id: String(msg._id),
        readAt: msg.readAt,
        replies: msg.replies.map(formatReply),
      });
    } catch (err) {
      next(err);
    }
  }
);
