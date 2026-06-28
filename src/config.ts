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

  resendApiKey: process.env.RESEND_API_KEY ?? "",
  emailFrom: process.env.EMAIL_FROM ?? "WPN <onboarding@resend.dev>",
  // Dev-only: if set, route ALL outgoing email to this address regardless of
  // the real recipient. Useful while testing on Resend's free tier (which
  // only delivers to your verified signup email). Leave blank in production.
  testEmailOverride: process.env.TEST_EMAIL_OVERRIDE ?? "",

  paystackSecretKey: process.env.PAYSTACK_SECRET_KEY ?? "",
  paystackPublicKey: process.env.PAYSTACK_PUBLIC_KEY ?? "",
};

