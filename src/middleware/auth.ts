import type { RequestHandler } from "express";
import { COOKIE_NAME, verifyToken, type JwtPayload } from "../utils/jwt.js";
import { HttpError } from "./error.js";
import { MemberModel } from "../models/Member.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export const requireAuth: RequestHandler = async (req, _res, next) => {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) {
    next(new HttpError(401, "Not authenticated"));
    return;
  }

  let payload: JwtPayload;
  try {
    payload = verifyToken(token);
  } catch {
    next(new HttpError(401, "Invalid or expired session"));
    return;
  }

  try {
    // Re-check the live account on every request so suspension, termination, or
    // a role change takes effect immediately — not only when the 7-day token
    // eventually expires.
    const member = await MemberModel.findById(payload.sub).select("status role");
    if (!member) {
      next(new HttpError(401, "Account no longer exists"));
      return;
    }
    if (member.status !== "active") {
      next(new HttpError(403, "Your account is not active"));
      return;
    }
    // Trust the live role over whatever the token was minted with.
    req.user = { ...payload, role: member.role };
    next();
  } catch (err) {
    next(err);
  }
};
