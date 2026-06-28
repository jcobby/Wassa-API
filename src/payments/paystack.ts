import crypto from "node:crypto";
import { config } from "../config.js";

const PAYSTACK_BASE = "https://api.paystack.co";

function authHeaders(): Record<string, string> {
  if (!config.paystackSecretKey) {
    throw new Error(
      "PAYSTACK_SECRET_KEY is not set — cannot call Paystack. Add it to .env."
    );
  }
  return {
    Authorization: `Bearer ${config.paystackSecretKey}`,
    "Content-Type": "application/json",
  };
}

export type InitializeArgs = {
  email: string;
  amount: number; // in major units (e.g. GHS); converted to subunits below
  currency: string; // "GHS"
  reference: string;
  callbackUrl: string;
  metadata?: Record<string, unknown>;
};

export type InitializeResponse = {
  authorization_url: string;
  access_code: string;
  reference: string;
};

export async function initializeTransaction(
  args: InitializeArgs
): Promise<InitializeResponse> {
  const res = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      email: args.email,
      amount: Math.round(args.amount * 100), // pesewas
      currency: args.currency,
      reference: args.reference,
      callback_url: args.callbackUrl,
      metadata: args.metadata,
    }),
  });
  const json = (await res.json()) as {
    status: boolean;
    message: string;
    data?: InitializeResponse;
  };
  if (!res.ok || !json.status || !json.data) {
    throw new Error(`Paystack initialize failed: ${json.message ?? res.status}`);
  }
  return json.data;
}

export type VerifyResponse = {
  status: "success" | "failed" | "abandoned" | "pending" | string;
  reference: string;
  amount: number; // in subunits
  currency: string;
  paid_at?: string;
  customer?: { email?: string };
  metadata?: Record<string, unknown>;
  gateway_response?: string;
  channel?: string;
};

export async function verifyTransaction(
  reference: string
): Promise<VerifyResponse> {
  const res = await fetch(
    `${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(reference)}`,
    {
      method: "GET",
      headers: authHeaders(),
    }
  );
  const json = (await res.json()) as {
    status: boolean;
    message: string;
    data?: VerifyResponse;
  };
  if (!res.ok || !json.status || !json.data) {
    throw new Error(`Paystack verify failed: ${json.message ?? res.status}`);
  }
  return json.data;
}

/**
 * Verifies the `x-paystack-signature` header on incoming webhooks.
 * The signature is HMAC-SHA512 of the raw request body using the secret key.
 */
export function verifyWebhookSignature(
  rawBody: Buffer | string,
  signature: string | undefined
): boolean {
  if (!signature || !config.paystackSecretKey) return false;
  const computed = crypto
    .createHmac("sha512", config.paystackSecretKey)
    .update(typeof rawBody === "string" ? rawBody : rawBody.toString("utf8"))
    .digest("hex");
  return crypto.timingSafeEqual(
    Buffer.from(computed, "hex"),
    Buffer.from(signature, "hex")
  );
}

export function newReference(prefix = "wpn"): string {
  const ts = Date.now().toString(36);
  const rnd = crypto.randomBytes(6).toString("hex");
  return `${prefix}_${ts}_${rnd}`;
}
