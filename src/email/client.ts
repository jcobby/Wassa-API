import { Resend } from "resend";
import { config } from "../config.js";

let resend: Resend | null = null;

function client(): Resend {
  if (!config.resendApiKey) {
    throw new Error(
      "RESEND_API_KEY is not set — cannot send email. Add it to .env."
    );
  }
  if (!resend) resend = new Resend(config.resendApiKey);
  return resend;
}

export type EmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export async function sendEmail(input: EmailInput): Promise<void> {
  const c = client();
  const override = config.testEmailOverride.trim();
  const to = override || input.to;
  // If we're overriding, tag the subject so we know who it was really for.
  const subject =
    override && override.toLowerCase() !== input.to.toLowerCase()
      ? `[to: ${input.to}] ${input.subject}`
      : input.subject;

  const { error } = await c.emails.send({
    from: config.emailFrom,
    to,
    subject,
    html: input.html,
    text: input.text,
  });
  if (error) {
    console.error("[email] send failed", error);
    throw new Error(`Email send failed: ${error.message ?? "unknown"}`);
  }
}
