import crypto from "node:crypto";

// Unambiguous alphabet — no 0/O/1/I/L — so a code is easy to read aloud, print
// on a card, and type without confusion. 31 chars ^ 6 ≈ 887M combinations.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

// A single WPN identity code, e.g. "WPN-7K3M9Q". Issued when someone applies
// and kept for life (carried onto their Member record when approved).
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
