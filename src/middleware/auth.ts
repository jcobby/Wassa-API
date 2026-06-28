import type { RequestHandler } from "express";
import { COOKIE_NAME, verifyToken, type JwtPayload } from "../utils/jwt.js";
import { HttpError } from "./error.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) {
    next(new HttpError(401, "Not authenticated"));
    return;
  }
  try {
    req.user = verifyToken(token);
    next();
  } catch {
    next(new HttpError(401, "Invalid or expired session"));
  }
};
