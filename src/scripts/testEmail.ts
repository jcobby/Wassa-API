import "dotenv/config";
import { config } from "../config.js";
import { sendEmail } from "../email/client.js";

// Quick way to confirm Zoho SMTP works without going through the whole app.
//   npm run test:email                 → sends to the override (or SMTP user)
//   npm run test:email -- you@mail.com → sends to a specific address
async function main() {
  const target = process.argv[2] || config.testEmailOverride || config.smtpUser;
  if (!target) {
    throw new Error(
      "No recipient. Pass one, e.g. `npm run test:email -- you@example.com`."
    );
  }

  const override = config.testEmailOverride.trim();
  console.log(
    `[test-email] SMTP: ${config.smtpUser}@${config.smtpHost}:${config.smtpPort}`
  );
  console.log(`[test-email] From: ${config.emailFrom}`);
  console.log(
    `[test-email] To:   ${target}` +
      (override && override.toLowerCase() !== target.toLowerCase()
        ? `  (override is on → actually delivered to ${override})`
        : "")
  );

  await sendEmail({
    to: target,
    subject: "WPN test email",
    text: "If you can read this, Zoho SMTP is working. — WPN",
    html: `<div style="font-family:system-ui,sans-serif">
      <h2 style="color:#0d2818">Zoho SMTP is working ✅</h2>
      <p>This is a test message from your WPN API. You can ignore it.</p>
    </div>`,
  });

  console.log("[test-email] Sent successfully ✓");
}

main().catch((err) => {
  console.error(
    "[test-email] FAILED:",
    err instanceof Error ? err.message : err
  );
  process.exit(1);
});
