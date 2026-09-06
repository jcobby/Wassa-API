import { Router } from "express";
import { ContributionModel } from "../models/Contribution.js";
import { getOrCreateSettings } from "../models/Settings.js";
import { InitializeContributionInput } from "../utils/validation.js";
import { requireAuth } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { HttpError } from "../middleware/error.js";
import { COOKIE_NAME, verifyToken } from "../utils/jwt.js";
import {
  initializeTransaction,
  verifyTransaction,
  type VerifyResponse,
} from "../payments/paystack.js";
import { nextContributionReference } from "../utils/contributionReference.js";
import { sendEmail } from "../email/client.js";
import { contributionReceiptEmail } from "../email/templates/contributionReceipt.js";
import { config } from "../config.js";

export const contributionsRouter = Router();

// Giving is open to the whole internet, so cap how fast one network can start
// transactions. Generous enough that a family giving from one office wifi is
// never blocked.
const giveLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message:
    "Too many contribution attempts from this network. Please try again shortly.",
});

// Public: what the give page needs to render — is giving open, the floor, the
// suggested chips, and the causes a gift can be earmarked for.
contributionsRouter.get("/options", async (_req, res, next) => {
  try {
    const s = await getOrCreateSettings();
    const c = s.contributions;
    res.json({
      enabled: c.enabled,
      currency: c.currency,
      minAmount: c.minAmount,
      suggestedAmounts: c.suggestedAmounts ?? [],
      causes: c.causes ?? [],
    });
  } catch (err) {
    next(err);
  }
});

// Public: start a Paystack transaction for a voluntary contribution of ANY
// amount at or above the configured floor. No account, no membership.
contributionsRouter.post("/initialize", giveLimiter, async (req, res, next) => {
  try {
    const input = InitializeContributionInput.parse(req.body);
    const settings = await getOrCreateSettings();
    const cfg = settings.contributions;

    if (!cfg.enabled) {
      throw new HttpError(
        403,
        "Online giving is currently closed. Please contact the Secretariat."
      );
    }

    // Paystack charges in subunits, so anything that rounds to zero pesewas
    // would be rejected downstream with a far less helpful message.
    const subunits = Math.round(input.amount * 100);
    if (subunits < Math.round(cfg.minAmount * 100)) {
      throw new HttpError(
        400,
        `The smallest contribution we can accept online is ${cfg.currency} ${cfg.minAmount.toFixed(2)}.`
      );
    }
    // Store the exact amount Paystack will charge, so the receipt and the
    // admin ledger can never disagree with the gateway over rounding.
    const amount = subunits / 100;

    // If the donor happens to be signed in, tie the gift to their member
    // record. Never required — a failed/absent cookie just means an
    // unattributed gift.
    let memberId: string | null = null;
    const token = req.cookies?.[COOKIE_NAME];
    if (token) {
      try {
        memberId = verifyToken(token).sub;
      } catch {
        memberId = null;
      }
    }

    const reference = await nextContributionReference();
    const cause = input.cause || cfg.causes?.[0] || "";
    // Paystack appends ?reference=…&trxref=… itself — don't include it here.
    const callbackUrl = `${config.publicBaseUrl}/contribute/success`;

    const paystackData = await initializeTransaction({
      email: input.donorEmail,
      amount,
      currency: cfg.currency,
      reference,
      callbackUrl,
      metadata: {
        purpose: "voluntary_contribution",
        donorName: input.donorName,
        cause,
        anonymous: input.anonymous,
        memberId,
      },
    });

    await ContributionModel.create({
      donorName: input.donorName,
      donorEmail: input.donorEmail,
      donorPhone: input.donorPhone,
      anonymous: input.anonymous,
      amount,
      currency: cfg.currency,
      cause,
      message: input.message,
      memberId,
      reference,
      status: "initialized",
    });

    res.json({
      reference: paystackData.reference,
      authorizationUrl: paystackData.authorization_url,
      accessCode: paystackData.access_code,
      amount,
      currency: cfg.currency,
    });
  } catch (err) {
    next(err);
  }
});

// Public: confirm a contribution. Used by the thank-you page, and as the
// primary path in local dev where no webhook reaches us.
contributionsRouter.get("/verify/:reference", async (req, res, next) => {
  try {
    const result = await fulfillContribution(req.params.reference);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Admin: ledger of contributions.
contributionsRouter.get("/", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const status = (req.query.status as string) || undefined;
    const filter: Record<string, unknown> = {};
    if (
      status &&
      ["initialized", "success", "failed", "abandoned"].includes(status)
    ) {
      filter.status = status;
    }
    const list = await ContributionModel.find(filter)
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();
    res.json(
      list.map((c) => ({
        id: String(c._id),
        donorName: c.donorName,
        donorEmail: c.donorEmail,
        donorPhone: c.donorPhone,
        anonymous: c.anonymous,
        amount: c.amount,
        currency: c.currency,
        cause: c.cause,
        message: c.message,
        memberId: c.memberId ? String(c.memberId) : null,
        reference: c.reference,
        status: c.status,
        createdAt: c.createdAt,
        completedAt: c.completedAt,
      }))
    );
  } catch (err) {
    next(err);
  }
});

// Admin: headline totals for the dashboard.
contributionsRouter.get(
  "/stats",
  requireAuth,
  requireAdmin,
  async (_req, res, next) => {
    try {
      const startOfYear = new Date(new Date().getFullYear(), 0, 1);
      const [totals, thisYear, donorCount, pending] = await Promise.all([
        ContributionModel.aggregate<{ _id: null; total: number; count: number }>([
          { $match: { status: "success" } },
          { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } },
        ]),
        ContributionModel.aggregate<{ _id: null; total: number }>([
          { $match: { status: "success", completedAt: { $gte: startOfYear } } },
          { $group: { _id: null, total: { $sum: "$amount" } } },
        ]),
        ContributionModel.distinct("donorEmail", { status: "success" }),
        ContributionModel.countDocuments({ status: "initialized" }),
      ]);
      res.json({
        totalRaised: totals[0]?.total ?? 0,
        totalGifts: totals[0]?.count ?? 0,
        raisedThisYear: thisYear[0]?.total ?? 0,
        donors: donorCount.length,
        pending,
      });
    } catch (err) {
      next(err);
    }
  }
);

// -----------------------------------------------------------------------
// Fulfillment — idempotent. Called by the verify endpoint and the webhook.
// Marks the gift paid and emails the donor a receipt exactly once.
// -----------------------------------------------------------------------

export type FulfillContributionResult = {
  status: "success" | "failed" | "pending";
  amount?: number;
  currency?: string;
  donorName?: string;
  donorEmail?: string;
  cause?: string;
  reference?: string;
  alreadyFulfilled?: boolean;
  // Absent for a gift answered from our own already-reconciled record.
  paystack?: VerifyResponse;
};

export async function fulfillContribution(
  reference: string
): Promise<FulfillContributionResult> {
  const gift = await ContributionModel.findOne({ reference });
  if (!gift) throw new HttpError(404, "Contribution not found");

  // Already banked and reconciled — answer from our own record. Re-asking
  // Paystack tells us nothing new and adds a failure mode: a gateway blip, a
  // rotated key, or a transaction aged out of the account would otherwise turn
  // a confirmed donor's thank-you page into an error.
  if (gift.status === "success") {
    return {
      status: "success",
      amount: gift.amount,
      currency: gift.currency,
      donorName: gift.donorName,
      donorEmail: gift.donorEmail,
      cause: gift.cause,
      reference: gift.reference,
      alreadyFulfilled: true,
    };
  }

  // Not yet banked — Paystack is the source of truth, never the caller.
  let verify: VerifyResponse;
  try {
    verify = await verifyTransaction(reference);
  } catch (err) {
    console.error("[contribution-verify] gateway error", reference, err);
    throw new HttpError(
      502,
      "We couldn't reach the payment gateway to confirm this contribution. " +
        "If you were charged, your gift is safe — refresh in a moment, or " +
        "contact the Secretariat quoting your reference."
    );
  }

  if (verify.status !== "success") {
    gift.status = verify.status === "failed" ? "failed" : "initialized";
    gift.paystackData = verify;
    await gift.save();
    return {
      status: verify.status === "failed" ? "failed" : "pending",
      paystack: verify,
    };
  }

  const paidAt = verify.paid_at ? new Date(verify.paid_at) : new Date();
  gift.status = "success";
  gift.completedAt = paidAt;
  gift.paystackData = verify;
  await gift.save();

  // Send the receipt once. Claiming it before sending means a crash mid-send
  // loses a receipt rather than sending a duplicate on the next call.
  if (!gift.receiptSentAt) {
    gift.receiptSentAt = new Date();
    await gift.save();
    try {
      const tpl = contributionReceiptEmail({
        donorName: gift.donorName,
        amount: gift.amount,
        currency: gift.currency,
        cause: gift.cause,
        reference: gift.reference,
        paidAt,
      });
      await sendEmail({
        to: gift.donorEmail,
        subject: tpl.subject,
        html: tpl.html,
        text: tpl.text,
      });
    } catch (err) {
      console.error("[contribution-receipt] failed", err);
      // Don't throw — the gift is banked either way, and the thank-you page
      // shows the reference on screen.
    }
  }

  return {
    status: "success",
    amount: gift.amount,
    currency: gift.currency,
    donorName: gift.donorName,
    donorEmail: gift.donorEmail,
    cause: gift.cause,
    reference: gift.reference,
    paystack: verify,
  };
}
