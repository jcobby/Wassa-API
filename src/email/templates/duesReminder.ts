import { logoTag } from "../shared.js";

const QUARTER_MONTHS = [
  "January – March",
  "April – June",
  "July – September",
  "October – December",
];

type Args = {
  fullName: string;
  applicantId: string | null;
  quarters: { year: number; quarter: number }[];
  total: number;
  currency: string;
  duesUrl: string;
  continueUrl: string;
};

// An admin's reminder to one member: the quarters they owe and a link to pay
// them online from their dues page.
export function duesReminderEmail({
  fullName,
  applicantId,
  quarters,
  total,
  currency,
  duesUrl,
  continueUrl,
}: Args) {
  const money = `${currency} ${total.toFixed(2)}`;
  const owed = quarters.map(
    (q) => `Q${q.quarter} ${q.year} (${QUARTER_MONTHS[q.quarter - 1]})`
  );
  const plural = quarters.length === 1 ? "quarter" : "quarters";

  const row = (label: string, value: string, mono = false) => `
                  <tr>
                    <td style="padding:0 24px 12px;">
                      <div style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#6a7a70;">${label}</div>
                      <div style="margin-top:4px;font-size:15px;color:#0d2818;${mono ? "font-family:'SFMono-Regular',Consolas,Menlo,monospace;letter-spacing:1px;" : ""}">${value}</div>
                    </td>
                  </tr>`;

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
                <h1 style="margin:8px 0 0;font-size:24px;font-weight:600;">Dues reminder</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 40px;">
                <p style="margin:0 0 16px;font-size:16px;line-height:1.6;">Dear ${escape(fullName)},</p>
                <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3a4a40;">
                  This is a friendly reminder that your quarterly membership dues are outstanding for the ${plural} below. Keeping your dues up to date keeps your membership in good standing.
                </p>

                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:24px 0;background:#f6f4ee;border-radius:12px;">
                  <tr>
                    <td style="padding:20px 24px 12px;">
                      <div style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#6a7a70;">Amount due</div>
                      <div style="margin-top:4px;font-size:26px;font-weight:600;color:#0d2818;">${escape(money)}</div>
                    </td>
                  </tr>
                  ${row("Outstanding", owed.map(escape).join("<br />"))}
                  ${applicantId ? row("WPN ID", escape(applicantId), true) : ""}
                </table>

                <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#3a4a40;">
                  Sign in to your member account to pay online by mobile money or card.
                </p>
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:0 0 24px;">
                  <tr>
                    <td align="center">
                      <a href="${duesUrl}" style="display:inline-block;background:#c8a04c;color:#0d2818;font-weight:600;font-size:15px;padding:14px 32px;border-radius:999px;text-decoration:none;">Pay My Dues</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 16px;font-size:13px;line-height:1.6;color:#6a7a70;">
                  Haven't set your account password yet? <a href="${continueUrl}" style="color:#0d2818;">Get your set-password link here</a>, then sign in.
                </p>
                <p style="margin:0;font-size:13px;line-height:1.6;color:#6a7a70;">
                  Already paid in cash or by transfer? Reply to this email with your receipt and we'll update your record.
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
Dues reminder

Dear ${fullName},

This is a friendly reminder that your quarterly membership dues are
outstanding for the ${plural} below.

Amount due: ${money}
Outstanding: ${owed.join(", ")}
${applicantId ? `WPN ID: ${applicantId}\n` : ""}
Sign in to your member account to pay online by mobile money or card:
${duesUrl}

Haven't set your account password yet? Get your set-password link here:
${continueUrl}

Already paid in cash or by transfer? Reply to this email with your receipt
and we'll update your record.

— The Wassa Professionals Network`;

  return {
    subject: `Reminder: ${money} in WPN dues outstanding`,
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
