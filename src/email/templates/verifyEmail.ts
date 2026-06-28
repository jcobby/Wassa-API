import { config } from "../../config.js";

type Args = {
  fullName: string;
  verifyUrl: string;
  expiresAt: Date;
};

export function verifyEmailTemplate({ fullName, verifyUrl, expiresAt }: Args) {
  const expiry = expiresAt.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const html = `
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f6f4ee;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1a3329;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="padding:40px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="560" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e8e3d7;">
            <tr>
              <td style="background:#0d2818;padding:32px 40px;color:#f6f4ee;">
                <div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#c8a04c;">Wassa Professionals Network</div>
                <h1 style="margin:8px 0 0;font-size:24px;font-weight:600;">Confirm your email</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 40px;">
                <p style="margin:0 0 16px;font-size:16px;line-height:1.6;">Dear ${escape(fullName)},</p>
                <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3a4a40;">
                  Thank you for applying to join the Wassa Professionals Network. Please confirm that this email address belongs to you so we can reach you about your application.
                </p>
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:0 0 24px;">
                  <tr>
                    <td align="center">
                      <a href="${verifyUrl}" style="display:inline-block;background:#c8a04c;color:#0d2818;font-weight:600;font-size:15px;padding:14px 32px;border-radius:999px;text-decoration:none;">Confirm Email Address</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 8px;font-size:13px;color:#6a7a70;">
                  Or copy this link into your browser:
                </p>
                <p style="margin:0 0 24px;font-size:12px;color:#3a4a40;word-break:break-all;">
                  ${verifyUrl}
                </p>
                <p style="margin:0;font-size:13px;color:#6a7a70;">
                  This link is valid until <strong>${expiry}</strong>. If you didn't apply to WPN, you can safely ignore this email.
                </p>
              </td>
            </tr>
            <tr>
              <td style="background:#f6f4ee;padding:24px 40px;font-size:12px;color:#6a7a70;border-top:1px solid #e8e3d7;">
                <em>Help a Wassa to Help Wassa.</em>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = `WASSA PROFESSIONALS NETWORK
Confirm your email

Dear ${fullName},

Thank you for applying to join the Wassa Professionals Network. Please confirm that this email address belongs to you:

${verifyUrl}

This link is valid until ${expiry}. If you didn't apply to WPN, you can safely ignore this email.

— The Wassa Professionals Network`;

  return {
    subject: "Confirm your email — WPN application",
    html,
    text,
  };
}

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

void config;
