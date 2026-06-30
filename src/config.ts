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
  // Trailing slash stripped so a value like "https://site.org/" still matches
  // the browser's slash-less Origin header in CORS.
  frontendOrigin: required("FRONTEND_ORIGIN").replace(/\/$/, ""),
  cookieDomain: process.env.COOKIE_DOMAIN || undefined,
  nodeEnv: process.env.NODE_ENV ?? "development",
  isProd: process.env.NODE_ENV === "production",

  publicBaseUrl: (
    process.env.PUBLIC_BASE_URL ??
    process.env.FRONTEND_ORIGIN ??
    "http://localhost:3000"
  ).replace(/\/$/, ""),

  // Address all transactional email is sent "from". Must be a verified sender
  // on your ZeptoMail domain (e.g. admin@wassaprosnetwork.org).
  emailFrom: process.env.EMAIL_FROM ?? "WPN <admin@wassaprosnetwork.org>",

  // ZeptoMail (Zoho's transactional email API) — sends over HTTPS, because many
  // cloud hosts (Render included) block outbound SMTP. Token comes from a
  // ZeptoMail "Mail Agent"; URL is region-specific (.com US / .eu EU / .in IN).
  zeptoToken: process.env.ZEPTOMAIL_TOKEN ?? "",
  zeptoUrl: (process.env.ZEPTOMAIL_URL ?? "https://api.zeptomail.com").replace(
    /\/$/,
    ""
  ),

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

