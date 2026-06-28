import { Router } from "express";
import crypto from "node:crypto";
import { MemberModel } from "../models/Member.js";
import {
  LoginInput,
  SetPasswordInput,
  ForgotPasswordInput,
} from "../utils/validation.js";
import { hashPassword, verifyPassword } from "../utils/password.js";
import { COOKIE_NAME, cookieOptions, signToken } from "../utils/jwt.js";
import { HttpError } from "../middleware/error.js";
import { requireAuth } from "../middleware/auth.js";
import { sendEmail } from "../email/client.js";
import { resetPasswordEmail } from "../email/templates/resetPassword.js";
import { rateLimit, emailKey } from "../middleware/rateLimit.js";
import { config } from "../config.js";

export const authRouter = Router();

const FIFTEEN_MIN = 15 * 60 * 1000;
const ONE_HOUR = 60 * 60 * 1000;

// Login: slow down brute force, per source IP and per targeted account.
const loginIpLimiter = rateLimit({
  windowMs: FIFTEEN_MIN,
  max: 30,
  message: "Too many sign-in attempts. Please wait a few minutes and try again.",
});
const loginEmailLimiter = rateLimit({
  windowMs: FIFTEEN_MIN,
  max: 10,
  keyGenerator: emailKey,
  message:
    "Too many sign-in attempts for this account. Please wait a few minutes and try again.",
});

// Forgot-password: these trigger an email, so keep them tight — per IP, and
// strictly per target email so nobody's inbox can be flooded.
const forgotIpLimiter = rateLimit({
  windowMs: ONE_HOUR,
  max: 10,
  message: "Too many requests. Please try again later.",
});
const forgotEmailLimiter = rateLimit({
  windowMs: ONE_HOUR,
  max: 3,
  keyGenerator: emailKey,
  message:
    "We've already sent a few reset emails to this address. Please check your inbox, including spam, or try again later.",
});

const setPasswordLimiter = rateLimit({ windowMs: FIFTEEN_MIN, max: 20 });

authRouter.post(
  "/login",
  loginIpLimiter,
  loginEmailLimiter,
  async (req, res, next) => {
  try {
    const { email, password } = LoginInput.parse(req.body);
    const member = await MemberModel.findOne({ email });
    if (!member || !member.passwordHash) {
      // Distinguish "we know you but you haven't paid yet" so the UI can help.
      if (member && member.status === "pending_payment") {
        throw new HttpError(
          403,
          "Your membership is awaiting payment. Please check your email for the payment link sent when your application was approved."
        );
      }
      // Paid & active, but they haven't chosen a password via the emailed link.
      if (member && !member.passwordHash) {
        throw new HttpError(
          403,
          "Please set your password first using the link we emailed you after payment, then sign in."
        );
      }
      throw new HttpError(401, "Invalid email or password");
    }
    if (member.status === "pending_payment") {
      throw new HttpError(
        403,
        "Your membership is awaiting payment. Please check your email for the payment link."
      );
    }
    if (member.status !== "active") {
      throw new HttpError(403, "Your account is not active");
    }
    const ok = await verifyPassword(password, member.passwordHash);
    if (!ok) {
      throw new HttpError(401, "Invalid email or password");
    }

    member.lastLoginAt = new Date();
    await member.save();

    const token = signToken({
      sub: String(member._id),
      email: member.email,
      role: member.role,
    });
    res.cookie(COOKIE_NAME, token, cookieOptions());
    res.json({
      id: String(member._id),
      email: member.email,
      role: member.role,
      fullName: member.fullName,
    });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/logout", (_req, res) => {
  res.clearCookie(COOKIE_NAME, { ...cookieOptions(), maxAge: 0 });
  res.json({ ok: true });
});

authRouter.get("/me", requireAuth, async (req, res, next) => {
  try {
    const member = await MemberModel.findById(req.user!.sub).select(
      "fullName email role status"
    );
    if (!member) {
      throw new HttpError(401, "Session not valid");
    }
    res.json({
      id: String(member._id),
      email: member.email,
      role: member.role,
      fullName: member.fullName,
      status: member.status,
    });
  } catch (err) {
    next(err);
  }
});

authRouter.post(
  "/forgot-password",
  forgotIpLimiter,
  forgotEmailLimiter,
  async (req, res, next) => {
  try {
    const { email } = ForgotPasswordInput.parse(req.body);
    const member = await MemberModel.findOne({ email });

    // Only active accounts can sign in, so only they can reset. We always
    // respond the same way regardless of whether the account exists, so this
    // endpoint can't be used to discover which emails are registered.
    if (member && member.status === "active") {
      const token = crypto.randomBytes(32).toString("hex");
      const expires = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours
      member.setPasswordToken = token;
      member.tokenExpiresAt = expires;
      await member.save();

      try {
        const tpl = resetPasswordEmail({
          fullName: member.fullName,
          resetUrl: `${config.publicBaseUrl}/set-password/${token}`,
          expiresAt: expires,
        });
        await sendEmail({
          to: member.email,
          subject: tpl.subject,
          html: tpl.html,
          text: tpl.text,
        });
      } catch (err) {
        console.error("[reset-email] failed", err);
      }
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/set-password", setPasswordLimiter, async (req, res, next) => {
  try {
    const { token, password } = SetPasswordInput.parse(req.body);
    const member = await MemberModel.findOne({ setPasswordToken: token });
    if (!member) throw new HttpError(400, "Invalid or expired link");
    if (
      !member.tokenExpiresAt ||
      member.tokenExpiresAt.getTime() < Date.now()
    ) {
      throw new HttpError(400, "Invalid or expired link");
    }
    member.passwordHash = await hashPassword(password);
    member.setPasswordToken = null;
    member.tokenExpiresAt = null;
    await member.save();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
