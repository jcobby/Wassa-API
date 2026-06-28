import type { RequestHandler } from "express";
import { HttpError } from "./error.js";

export const requireAdmin: RequestHandler = (req, _res, next) => {
  if (!req.user) {
    next(new HttpError(401, "Not authenticated"));
    return;
  }
  if (req.user.role !== "admin") {
    next(new HttpError(403, "Admin access required"));
    return;
  }
  next();
};
