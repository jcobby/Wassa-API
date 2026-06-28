import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { config } from "./config.js";
import { connectDB } from "./db.js";
import { errorHandler, notFound } from "./middleware/error.js";
import { applicationsRouter } from "./routes/applications.routes.js";
import { authRouter } from "./routes/auth.routes.js";
import { membersRouter } from "./routes/members.routes.js";
import { messagesRouter } from "./routes/messages.routes.js";
import { duesRouter } from "./routes/dues.routes.js";
import { settingsRouter } from "./routes/settings.routes.js";
import { paymentsRouter, paystackWebhook } from "./routes/payments.routes.js";

async function main(): Promise<void> {
  await connectDB();

  const app = express();

  // Trust one reverse-proxy hop so req.ip reflects the real client (needed for
  // rate limiting). Adjust the number if you sit behind more proxies. Safe for
  // cookies here since their secure/sameSite flags derive from NODE_ENV, not req.
  app.set("trust proxy", 1);

  app.use(
    cors({
      origin: config.frontendOrigin,
      credentials: true,
    })
  );

  // Paystack webhook needs the RAW body to verify the HMAC signature.
  // Mount BEFORE express.json() so the body isn't parsed.
  app.post(
    "/payments/webhook",
    express.raw({ type: "application/json" }),
    paystackWebhook
  );

  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());

  app.get("/health", (_req, res) => {
    res.json({ ok: true, env: config.nodeEnv });
  });

  app.use("/auth", authRouter);
  app.use("/applications", applicationsRouter);
  app.use("/members", membersRouter);
  app.use("/contact", messagesRouter);
  app.use("/messages", messagesRouter);
  app.use("/dues", duesRouter);
  app.use("/settings", settingsRouter);
  app.use("/payments", paymentsRouter);

  app.use(notFound);
  app.use(errorHandler);

  app.listen(config.port, () => {
    console.log(`[api] listening on http://localhost:${config.port}`);
  });
}

main().catch((err) => {
  console.error("[fatal]", err);
  process.exit(1);
});
