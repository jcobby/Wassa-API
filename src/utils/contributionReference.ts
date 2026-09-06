import crypto from "node:crypto";
import { ContributionModel } from "../models/Contribution.js";

// Same unambiguous alphabet as WPN identity codes — no 0/O/1/I/L — so a donor
// can read their receipt number down the phone or type it into an email
// without it being misheard. 31 ^ 6 ≈ 887M combinations.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

// Prefix on every contribution reference. The Paystack webhook routes on it to
// tell a gift apart from a membership/dues payment, so it must stay distinct
// from the `wpn`/`wpndues` prefixes those flows use.
export const CONTRIBUTION_REF_PREFIX = "WPNG";

// The original format, e.g. "wpngive_mtpy0zo8_77c3fa166697". Gifts banked
// before the reference was shortened still carry it, and their receipts are
// already in donors' inboxes — so they must keep verifying and routing.
const LEGACY_PREFIX = "wpngive_";

// A donor-facing receipt reference, e.g. "WPNG-7K3M9Q". Doubles as the Paystack
// transaction reference — one identifier the donor, the Secretariat, and the
// gateway all quote, rather than a short one and a long one to reconcile.
// Paystack permits alphanumerics plus - . = in a reference.
export function generateContributionReference(): string {
  const bytes = crypto.randomBytes(6);
  let s = "";
  for (let i = 0; i < 6; i++) s += ALPHABET[bytes[i] % ALPHABET.length];
  return `${CONTRIBUTION_REF_PREFIX}-${s}`;
}

// A reference not already taken. The unique index on Contribution.reference is
// the real backstop; this just avoids losing a donor's transaction to a retry.
export async function nextContributionReference(): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const reference = generateContributionReference();
    if (!(await ContributionModel.exists({ reference }))) return reference;
  }
  throw new Error("Could not generate a unique contribution reference in 8 tries");
}

// Does this reference belong to the contributions ledger? Accepts both the
// current short form and the legacy long one.
export function isContributionReference(reference: string): boolean {
  return (
    reference.startsWith(`${CONTRIBUTION_REF_PREFIX}-`) ||
    reference.startsWith(LEGACY_PREFIX)
  );
}
