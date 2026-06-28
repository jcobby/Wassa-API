import type { Request, RequestHandler } from "express";

// A small in-memory fixed-window rate limiter. No external dependency and
// plenty for a single-instance deployment. If WPN ever runs multiple API
// instances, swap the Map for a shared store (e.g. Redis) so limits are global.

type Options = {
  windowMs: number;
  max: number;
  message?: string;
  // Key requests by something other than the client IP (e.g. the target email).
  // If it returns an empty string the request is not counted — validation
  // further down the chain will reject it.
  keyGenerator?: (req: Request) => string;
};

type Bucket = { count: number; resetAt: number };

function clientIp(req: Request): string {
  // Accurate when `app.set("trust proxy", …)` is configured (see index.ts).
  return req.ip || req.socket.remoteAddress || "unknown";
}

// Keys a limiter by the normalized email in the request body — used to protect
// a specific inbox/account regardless of which IP the requests come from.
export function emailKey(req: Request): string {
  const email = (req.body as { email?: unknown } | undefined)?.email;
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

export function rateLimit({
  windowMs,
  max,
  message,
  keyGenerator,
}: Options): RequestHandler {
  const hits = new Map<string, Bucket>();

  // Drop expired buckets periodically so the map can't grow without bound.
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of hits) {
      if (bucket.resetAt <= now) hits.delete(key);
    }
  }, windowMs);
  // Don't keep the process alive just for cleanup.
  (sweep as { unref?: () => void }).unref?.();

  return (req, res, next) => {
    const key = keyGenerator ? keyGenerator(req) : clientIp(req);
    if (!key) return next();

    const now = Date.now();
    let bucket = hits.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      hits.set(key, bucket);
    }
    bucket.count += 1;

    if (bucket.count > max) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.set("Retry-After", String(retryAfter));
      res.status(429).json({
        error:
          message ??
          "Too many requests. Please slow down and try again shortly.",
      });
      return;
    }
    next();
  };
}
