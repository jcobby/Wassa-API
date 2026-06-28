import jwt from "jsonwebtoken";
import { config } from "../config.js";

export type JwtPayload = {
  sub: string; // member _id
  email: string;
  role: "member" | "admin";
};

const EXPIRES_IN = "7d";

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: EXPIRES_IN });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, config.jwtSecret) as JwtPayload;
}

export const COOKIE_NAME = "wpn_token";

export function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: (config.isProd ? "none" : "lax") as "none" | "lax",
    secure: config.isProd,
    domain: config.cookieDomain,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  };
}
