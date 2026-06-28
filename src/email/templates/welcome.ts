import { config } from "../../config.js";

type Args = {
  fullName: string;
  email: string;
  password: string;
};

export function welcomeEmail({ fullName, email, password }: Args) {
  const loginUrl = `${config.publicBaseUrl}/login`;

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
                <h1 style="margin:8px 0 0;font-size:24px;font-weight:600;">Welcome to WPN</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 40px;">
                <p style="margin:0 0 16px;font-size:16px;line-height:1.6;">Dear ${escape(fullName)},</p>
                <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3a4a40;">
                  Thank you for completing your membership payment. Your member account is now active. Below are your login details &mdash; please keep them safe.
                </p>

                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:24px 0;background:#f6f4ee;border-radius:12px;">
                  <tr>
                    <td style="padding:20px 24px;">
                      <div style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#6a7a70;">Email</div>
                      <div style="margin-top:4px;font-size:15px;font-family:monospace;color:#0d2818;">${escape(email)}</div>
                      <div style="margin-top:16px;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#6a7a70;">Temporary Password</div>
                      <div style="margin-top:4px;font-size:15px;font-family:monospace;color:#0d2818;">${escape(password)}</div>
                    </td>
                  </tr>
                </table>

                <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#3a4a40;">
                  We strongly recommend you change this password after your first sign-in.
                </p>

                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:0 0 24px;">
                  <tr>
                    <td align="center">
                      <a href="${loginUrl}" style="display:inline-block;background:#c8a04c;color:#0d2818;font-weight:600;font-size:15px;padding:14px 32px;border-radius:999px;text-decoration:none;">Sign In</a>
                    </td>
                  </tr>
                </table>
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
Welcome to WPN

Dear ${fullName},

Thank you for completing your membership payment. Your member account is now active.

Login details:
  Email:    ${email}
  Password: ${password}

Sign in: ${loginUrl}

We strongly recommend you change this password after your first sign-in.

— The Wassa Professionals Network`;

  return {
    subject: "Welcome to WPN — your login details",
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
