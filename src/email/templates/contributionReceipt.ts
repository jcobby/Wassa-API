import { logoTag } from "../shared.js";

type Args = {
  donorName: string;
  amount: number;
  currency: string;
  cause: string;
  reference: string;
  paidAt: Date;
};

export function contributionReceiptEmail({
  donorName,
  amount,
  currency,
  cause,
  reference,
  paidAt,
}: Args) {
  const money = `${currency} ${amount.toFixed(2)}`;
  const date = paidAt.toLocaleDateString("en-GB", {
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
                <h1 style="margin:8px 0 0;font-size:24px;font-weight:600;">Thank you for your gift</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 40px;">
                <p style="margin:0 0 16px;font-size:16px;line-height:1.6;">Dear ${escape(donorName)},</p>
                <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3a4a40;">
                  We have received your voluntary contribution to the Wassa Professionals Network. Gifts like yours fund the work directly &mdash; thank you for standing with Wassa.
                </p>

                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:24px 0;background:#f6f4ee;border-radius:12px;">
                  <tr>
                    <td style="padding:20px 24px 8px;">
                      <div style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#6a7a70;">Amount received</div>
                      <div style="margin-top:4px;font-size:26px;font-weight:600;color:#0d2818;">${escape(money)}</div>
                    </td>
                  </tr>
                  ${
                    cause
                      ? `<tr>
                    <td style="padding:0 24px 8px;">
                      <div style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#6a7a70;">Designated for</div>
                      <div style="margin-top:4px;font-size:15px;color:#0d2818;">${escape(cause)}</div>
                    </td>
                  </tr>`
                      : ""
                  }
                  <tr>
                    <td style="padding:0 24px 8px;">
                      <div style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#6a7a70;">Date</div>
                      <div style="margin-top:4px;font-size:15px;color:#0d2818;">${escape(date)}</div>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:0 24px 20px;">
                      <div style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#6a7a70;">Receipt reference</div>
                      <div style="margin-top:4px;font-size:13px;font-family:'SFMono-Regular',Consolas,Menlo,monospace;color:#0d2818;">${escape(reference)}</div>
                    </td>
                  </tr>
                </table>

                <p style="margin:0;font-size:13px;color:#6a7a70;">
                  Keep this email as your receipt. For any question about this gift, reply to this address quoting the reference above.
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
Thank you for your gift

Dear ${donorName},

We have received your voluntary contribution to the Wassa Professionals Network.

Amount received: ${money}
${cause ? `Designated for: ${cause}\n` : ""}Date: ${date}
Receipt reference: ${reference}

Keep this email as your receipt.

— The Wassa Professionals Network`;

  return {
    subject: `Thank you — your ${money} contribution to WPN`,
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
