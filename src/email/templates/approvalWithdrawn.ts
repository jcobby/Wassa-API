import { logoTag } from "../shared.js";

type Args = {
  fullName: string;
  // Where the application stands after the correction.
  outcome: "rejected" | "under_review";
};

// Sent when an approval is overturned. The applicant already holds an email
// with a membership ID and a payment link, so silence would leave them trying
// to pay through a link that no longer works.
export function approvalWithdrawnEmail({ fullName, outcome }: Args) {
  const lead =
    outcome === "under_review"
      ? "That email was sent before the Executive Council had completed its review, and we apologise for the confusion. Your application is back under review."
      : "Unfortunately that email was sent in error, and we apologise for the confusion. Your application has not been approved at this time.";
  const close =
    outcome === "under_review"
      ? "We will contact you again as soon as a decision has been made."
      : "If you have any questions, reply to this email and the Secretariat will be glad to help.";

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
                <h1 style="margin:8px 0 0;font-size:24px;font-weight:600;">A correction to your application</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 40px;">
                <p style="margin:0 0 16px;font-size:16px;line-height:1.6;">Dear ${escape(fullName)},</p>
                <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3a4a40;">
                  We recently emailed you to say that your application to join the Wassa Professionals Network had been approved. ${lead}
                </p>
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:0 0 16px;background:#fbf3df;border-radius:12px;border:1px solid #ecd9a8;">
                  <tr>
                    <td style="padding:16px 20px;font-size:14px;line-height:1.6;color:#5a4410;">
                      <strong>Please do not make any payment.</strong> The payment link in our earlier email has been cancelled, and the membership ID it gave you is not active.
                    </td>
                  </tr>
                </table>
                <p style="margin:0;font-size:15px;line-height:1.6;color:#3a4a40;">${close}</p>
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
A correction to your application

Dear ${fullName},

We recently emailed you to say that your application to join the Wassa Professionals Network had been approved. ${lead}

PLEASE DO NOT MAKE ANY PAYMENT. The payment link in our earlier email has been cancelled, and the membership ID it gave you is not active.

${close}

— The Wassa Professionals Network`;

  return {
    subject: "A correction to your WPN application",
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
