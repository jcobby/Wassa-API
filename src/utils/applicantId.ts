import crypto from "node:crypto";
import { ApplicationModel } from "../models/Application.js";
import { MemberModel } from "../models/Member.js";

// Unambiguous alphabet — no 0/O/1/I/L — so a code is easy to read aloud, print
// on a card, and type without confusion. 31 chars ^ 6 ≈ 887M combinations.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

// A single WPN identity code, e.g. "WPN-7K3M9Q". Issued when the Executive
// Council approves an application, then kept for life (copied onto the Member
// record and never reissued).
export function generateApplicantCode(): string {
  const bytes = crypto.randomBytes(6);
  let s = "";
  for (let i = 0; i < 6; i++) s += ALPHABET[bytes[i] % ALPHABET.length];
  return `WPN-${s}`;
}

// Generate a code that isn't already taken. `exists` should return true if the
// candidate collides with any existing applicant/member code.
export async function uniqueApplicantCode(
  exists: (code: string) => Promise<boolean>
): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = generateApplicantCode();
    if (!(await exists(code))) return code;
  }
  throw new Error("Could not generate a unique applicant code after 8 tries");
}

// A WPN identity code not already used by any application or member. Shared by
// the approval flow (which mints the code) and the resend-email flow (which
// backfills legacy members admitted before codes existed).
export async function nextApplicantId(): Promise<string> {
  return uniqueApplicantCode(async (code) => {
    const [a, m] = await Promise.all([
      ApplicationModel.exists({ applicantId: code }),
      MemberModel.exists({ applicantId: code }),
    ]);
    return Boolean(a || m);
  });
}
