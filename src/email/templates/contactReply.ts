import { logoTag } from "../shared.js";

type Args = {
  firstName: string;
  subject: string;
  body: string;
  originalMessage: string;
  originalSentAt: Date;
};

export function contactReplyEmail({
  firstName,
  subject,
  body,
  originalMessage,
  originalSentAt,
}: Args) {
  const sentOn = originalSentAt.toLocaleDateString("en-GB", {
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
                ${logoTag}
                <div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#c8a04c;">Wassa Professionals Network</div>
                <h1 style="margin:8px 0 0;font-size:24px;font-weight:600;">A reply to your message</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 40px;">
                <p style="margin:0 0 16px;font-size:16px;line-height:1.6;">Dear ${escape(firstName)},</p>
                <div style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#3a4a40;">${paragraphs(body)}</div>

                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:24px 0 0;background:#f6f4ee;border-radius:12px;">
                  <tr>
                    <td style="padding:16px 20px;">
                      <div style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#6a7a70;">Your message of ${escape(sentOn)}</div>
                      <div style="margin-top:6px;font-size:13px;line-height:1.6;color:#3a4a40;">${paragraphs(originalMessage)}</div>
                    </td>
                  </tr>
                </table>

                <p style="margin:24px 0 0;font-size:13px;color:#6a7a70;">
                  You can reply directly to this email to continue the conversation.
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

  const quoted = originalMessage
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");

  const text = `WASSA PROFESSIONALS NETWORK
A reply to your message

Dear ${firstName},

${body}

— The Wassa Professionals Network

On ${sentOn} you wrote:
${quoted}`;

  return { subject, html, text };
}

// Escape, then keep the admin's line breaks — they typed a letter, not HTML.
function paragraphs(s: string): string {
  return escape(s).replace(/\r?\n/g, "<br />");
}

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
