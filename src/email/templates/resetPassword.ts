import { config } from "../../config.js";

type Args = {
  fullName: string;
  resetUrl: string;
  expiresAt: Date;
};

export function resetPasswordEmail({ fullName, resetUrl, expiresAt }: Args) {
  const expiry = expiresAt.toLocaleString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
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
                <h1 style="margin:8px 0 0;font-size:24px;font-weight:600;">Reset your password</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 40px;">
                <p style="margin:0 0 16px;font-size:16px;line-height:1.6;">Dear ${escape(fullName)},</p>
                <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3a4a40;">
                  We received a request to reset the password for your WPN member account. Click the button below to choose a new password.
                </p>
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:0 0 24px;">
                  <tr>
                    <td align="center">
                      <a href="${resetUrl}" style="display:inline-block;background:#c8a04c;color:#0d2818;font-weight:600;font-size:15px;padding:14px 32px;border-radius:999px;text-decoration:none;">Reset Password</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 8px;font-size:13px;color:#6a7a70;">
                  Or copy this link into your browser:
                </p>
                <p style="margin:0 0 24px;font-size:12px;color:#3a4a40;word-break:break-all;">
                  ${resetUrl}
                </p>
                <p style="margin:0;font-size:13px;color:#6a7a70;">
                  This link is valid until <strong>${expiry}</strong>. If you didn't request this, you can safely ignore this email — your password won't change.
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
Reset your password

Dear ${fullName},

We received a request to reset the password for your WPN member account. Choose a new password here:

${resetUrl}

This link is valid until ${expiry}. If you didn't request this, you can safely ignore this email — your password won't change.

— The Wassa Professionals Network`;

  return {
    subject: "Reset your WPN password",
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
