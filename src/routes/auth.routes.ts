import { Router } from "express";
import { MemberModel } from "../models/Member.js";
import { LoginInput, SetPasswordInput } from "../utils/validation.js";
import { hashPassword, verifyPassword } from "../utils/password.js";
import { COOKIE_NAME, cookieOptions, signToken } from "../utils/jwt.js";
import { HttpError } from "../middleware/error.js";
import { requireAuth } from "../middleware/auth.js";

export const authRouter = Router();

authRouter.post("/login", async (req, res, next) => {
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

authRouter.post("/set-password", async (req, res, next) => {
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
