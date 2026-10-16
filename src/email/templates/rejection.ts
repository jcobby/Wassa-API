import { logoTag } from "../shared.js";

type Args = { fullName: string };

// Sent when the Executive Council declines an application. The reviewer's notes
// stay internal — this only tells the applicant the outcome and where to turn.
export function rejectionEmail({ fullName }: Args) {
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
                ${logoTag}
                <div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#c8a04c;">Wassa Professionals Network</div>
                <h1 style="margin:8px 0 0;font-size:24px;font-weight:600;">About your application</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 40px;">
                <p style="margin:0 0 16px;font-size:16px;line-height:1.6;">Dear ${escape(fullName)},</p>
                <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3a4a40;">
                  Thank you for your interest in the Wassa Professionals Network and for the time you took to apply.
                </p>
                <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3a4a40;">
                  The Executive Council has carefully reviewed your application and is unable to approve it at this time.
                </p>
                <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3a4a40;">
                  If your circumstances change &mdash; for example, a new professional qualification &mdash; you are welcome to apply again. If you believe the decision should be reconsidered, you may appeal to the General Assembly.
                </p>
                <p style="margin:0;font-size:15px;line-height:1.6;color:#3a4a40;">
                  If you have any questions, simply reply to this email and the Secretariat will be glad to help.
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
About your application

Dear ${fullName},

Thank you for your interest in the Wassa Professionals Network and for the time you took to apply.

The Executive Council has carefully reviewed your application and is unable to approve it at this time.

If your circumstances change — for example, a new professional qualification — you are welcome to apply again. If you believe the decision should be reconsidered, you may appeal to the General Assembly.

If you have any questions, simply reply to this email and the Secretariat will be glad to help.

— The Wassa Professionals Network`;

  return {
    subject: "Your WPN membership application",
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
