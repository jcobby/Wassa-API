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
  paidAt: Date;
  method: string | null;
  reference: string;
  duesUrl: string;
};

// A member's receipt for quarterly dues — one email per payment, listing every
// quarter it covered (a "pay all remaining" checkout covers several).
export function duesReceiptEmail({
  fullName,
  applicantId,
  quarters,
  total,
  currency,
  paidAt,
  method,
  reference,
  duesUrl,
}: Args) {
  const money = `${currency} ${total.toFixed(2)}`;
  const date = paidAt.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "Africa/Accra",
  });
  const covered = quarters.map(
    (q) => `Q${q.quarter} ${q.year} (${QUARTER_MONTHS[q.quarter - 1]})`
  );

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
                <h1 style="margin:8px 0 0;font-size:24px;font-weight:600;">Dues payment received</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 40px;">
                <p style="margin:0 0 16px;font-size:16px;line-height:1.6;">Dear ${escape(fullName)},</p>
                <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3a4a40;">
                  Thank you &mdash; we have received your quarterly dues. Your membership stays in good standing for the ${quarters.length === 1 ? "quarter" : "quarters"} below.
                </p>

                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:24px 0;background:#f6f4ee;border-radius:12px;">
                  <tr>
                    <td style="padding:20px 24px 12px;">
                      <div style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#6a7a70;">Amount paid</div>
                      <div style="margin-top:4px;font-size:26px;font-weight:600;color:#0d2818;">${escape(money)}</div>
                    </td>
                  </tr>
                  ${row("Covers", covered.map(escape).join("<br />"))}
                  ${row("Date", escape(date))}
                  ${method ? row("Method", escape(method)) : ""}
                  ${applicantId ? row("WPN ID", escape(applicantId), true) : ""}
                  ${row("Receipt reference", escape(reference), true)}
                </table>

                <p style="margin:0 0 16px;font-size:13px;color:#6a7a70;">
                  Keep this email as your receipt. You can see every quarter you've paid at <a href="${duesUrl}" style="color:#0d2818;">your dues page</a>. For any question about this payment, reply to this email quoting the reference above.
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
Dues payment received

Dear ${fullName},

Thank you — we have received your quarterly dues.

Amount paid: ${money}
Covers: ${covered.join(", ")}
Date: ${date}
${method ? `Method: ${method}\n` : ""}${applicantId ? `WPN ID: ${applicantId}\n` : ""}Receipt reference: ${reference}

Keep this email as your receipt. See every quarter you've paid at:
${duesUrl}

— The Wassa Professionals Network`;

  return {
    subject: `Receipt — your ${money} WPN dues payment`,
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
