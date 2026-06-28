import nodemailer, { type Transporter } from "nodemailer";
import { config } from "../config.js";

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (!config.smtpUser || !config.smtpPass) {
    throw new Error(
      "SMTP_USER / SMTP_PASS are not set — cannot send email. Add your Zoho " +
        "account and an app-specific password to .env."
    );
  }
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      // 465 = implicit TLS (SSL); 587 = STARTTLS.
      secure: config.smtpPort === 465,
      auth: { user: config.smtpUser, pass: config.smtpPass },
    });
  }
  return transporter;
}

export type EmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export async function sendEmail(input: EmailInput): Promise<void> {
  const t = getTransporter();
  const override = config.testEmailOverride.trim();
  const to = override || input.to;
  // If we're overriding, tag the subject so we know who it was really for.
  const subject =
    override && override.toLowerCase() !== input.to.toLowerCase()
      ? `[to: ${input.to}] ${input.subject}`
      : input.subject;

  try {
    await t.sendMail({
      from: config.emailFrom,
      to,
      subject,
      html: input.html,
      text: input.text,
    });
  } catch (err) {
    console.error("[email] send failed", err);
    const message = err instanceof Error ? err.message : "unknown";
    throw new Error(`Email send failed: ${message}`);
  }
}
