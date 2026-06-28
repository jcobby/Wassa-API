import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  mongoUri: required("MONGO_URI"),
  jwtSecret: required("JWT_SECRET"),
  frontendOrigin: required("FRONTEND_ORIGIN"),
  cookieDomain: process.env.COOKIE_DOMAIN || undefined,
  nodeEnv: process.env.NODE_ENV ?? "development",
  isProd: process.env.NODE_ENV === "production",

  publicBaseUrl:
    process.env.PUBLIC_BASE_URL ?? process.env.FRONTEND_ORIGIN ?? "http://localhost:3000",

  // Address all transactional email is sent "from". Must be your Zoho account
  // or one of its verified aliases (e.g. admin@wassaprosnetwork.org).
  emailFrom: process.env.EMAIL_FROM ?? "WPN <admin@wassaprosnetwork.org>",

  // SMTP (Zoho Mail) — how outgoing email is actually sent. Hosted Zoho
  // (custom-domain) accounts use smtppro.zoho.com; free/personal use smtp.zoho.com.
  smtpHost: process.env.SMTP_HOST ?? "smtppro.zoho.com",
  smtpPort: Number(process.env.SMTP_PORT ?? 465),
  smtpUser: process.env.SMTP_USER ?? "",
  // Generate an app-specific password in Zoho (Settings → Security → App
  // Passwords) — your normal login password won't work for SMTP with 2FA on.
  smtpPass: process.env.SMTP_PASS ?? "",

  // Dev-only: if set, route ALL outgoing email to this address regardless of
  // the real recipient. Handy while testing so you don't email real applicants.
  // Leave blank in production.
  testEmailOverride: process.env.TEST_EMAIL_OVERRIDE ?? "",

  paystackSecretKey: process.env.PAYSTACK_SECRET_KEY ?? "",
  paystackPublicKey: process.env.PAYSTACK_PUBLIC_KEY ?? "",
};

// Safety guard: TEST_EMAIL_OVERRIDE redirects *every* outgoing email (approval
// links, set-password links) to a single inbox. Harmless in dev, catastrophic
// in production — refuse to boot rather than silently mis-deliver members' mail.
if (config.isProd && config.testEmailOverride.trim()) {
  throw new Error(
    "TEST_EMAIL_OVERRIDE is set while NODE_ENV=production. This would route every " +
      "member's email to one inbox. Unset it before deploying."
  );
}

