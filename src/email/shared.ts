import { config } from "../config.js";

// Circular WPN logo for email headers. Served from the public site so email
// clients can load it (many block images until the recipient allows them).
export const logoTag = `<img src="${config.publicBaseUrl}/logo.jpeg" alt="WPN" width="52" height="52" style="display:block;border-radius:50%;border:0;outline:none;text-decoration:none;margin-bottom:14px;" />`;

// Whole days from now until `date` (min 1) — so emails can say "valid for N days".
export function daysUntil(date: Date): number {
  return Math.max(1, Math.round((date.getTime() - Date.now()) / 86_400_000));
}
