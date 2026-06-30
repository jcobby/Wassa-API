import { config } from "../config.js";

export type EmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

// Split `WPN <admin@wassaprosnetwork.org>` into name + address.
function parseFrom(raw: string): { address: string; name?: string } {
  const m = raw.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1] || undefined, address: m[2].trim() };
  return { address: raw.trim() };
}

export async function sendEmail(input: EmailInput): Promise<void> {
  if (!config.zeptoToken) {
    throw new Error(
      "ZEPTOMAIL_TOKEN is not set — cannot send email. Add your ZeptoMail " +
        "Mail Agent send token to the environment."
    );
  }

  const override = config.testEmailOverride.trim();
  const to = override || input.to;
  // If we're overriding, tag the subject so we know who it was really for.
  const subject =
    override && override.toLowerCase() !== input.to.toLowerCase()
      ? `[to: ${input.to}] ${input.subject}`
      : input.subject;

  const from = parseFrom(config.emailFrom);
  // ZeptoMail wants `Zoho-enczapikey <token>`; accept either form in the env.
  const auth = config.zeptoToken.toLowerCase().includes("enczapikey")
    ? config.zeptoToken
    : `Zoho-enczapikey ${config.zeptoToken}`;

  let res: Response;
  try {
    res = await fetch(`${config.zeptoUrl}/v1.1/email`, {
      method: "POST",
      headers: {
        Authorization: auth,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        from: { address: from.address, name: from.name },
        to: [{ email_address: { address: to } }],
        subject,
        htmlbody: input.html,
        textbody: input.text,
      }),
    });
  } catch (err) {
    console.error("[email] ZeptoMail request failed", err);
    const message = err instanceof Error ? err.message : "unknown";
    throw new Error(`Email send failed: ${message}`);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("[email] ZeptoMail send failed", res.status, detail);
    throw new Error(`Email send failed (${res.status})`);
  }
}
