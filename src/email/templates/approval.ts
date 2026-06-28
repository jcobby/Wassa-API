import { config } from "../../config.js";

type Args = {
  fullName: string;
  paymentUrl: string;
  amount: number;
  currency: string;
  expiresAt: Date;
};

export function approvalEmail({
  fullName,
  paymentUrl,
  amount,
  currency,
  expiresAt,
}: Args) {
  const amountFormatted = `${currency} ${amount.toFixed(2)}`;
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
                <h1 style="margin:8px 0 0;font-size:24px;font-weight:600;">Application approved</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 40px;">
                <p style="margin:0 0 16px;font-size:16px;line-height:1.6;">Dear ${escape(fullName)},</p>
                <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3a4a40;">
                  Your application to join the Wassa Professionals Network has been approved by the Executive Council. To complete your membership, please pay the annual membership fee of <strong>${amountFormatted}</strong>.
                </p>
                <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#3a4a40;">
                  Payment is accepted via MTN MoMo, Vodafone Cash, AirtelTigo Money, debit/credit card, and bank transfer. After successful payment, your member account will be created and your login credentials will be displayed and emailed to you.
                </p>
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:0 0 24px;">
                  <tr>
                    <td align="center">
                      <a href="${paymentUrl}" style="display:inline-block;background:#c8a04c;color:#0d2818;font-weight:600;font-size:15px;padding:14px 32px;border-radius:999px;text-decoration:none;">Complete Payment</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 8px;font-size:13px;color:#6a7a70;">
                  Or copy this link into your browser:
                </p>
                <p style="margin:0 0 24px;font-size:12px;color:#3a4a40;word-break:break-all;">
                  ${paymentUrl}
                </p>
                <p style="margin:0;font-size:13px;color:#6a7a70;">
                  This payment link is valid until <strong>${expiry}</strong>. If you don't complete payment by then, contact the General Secretary.
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
Application Approved

Dear ${fullName},

Your application has been approved by the Executive Council. To complete your membership, please pay the annual fee of ${amountFormatted}.

Payment is accepted via MTN MoMo, Vodafone Cash, AirtelTigo Money, debit/credit card, and bank transfer.

Complete payment here:
${paymentUrl}

This link is valid until ${expiry}.

After successful payment, your member account will be created and your login credentials emailed to you.

— The Wassa Professionals Network`;

  return {
    subject: "Your WPN application has been approved — complete payment",
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

// Keep config import used (avoid TS unused warning if needed later)
void config;
