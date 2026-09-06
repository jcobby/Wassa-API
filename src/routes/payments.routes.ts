import { Router, type RequestHandler } from "express";
import express from "express";
import { MemberModel } from "../models/Member.js";
import { PaymentModel } from "../models/Payment.js";
import { DuesModel } from "../models/Dues.js";
import { getOrCreateSettings } from "../models/Settings.js";
import { memberDuesStatus } from "../utils/dues.js";
import {
  InitializePaymentInput,
  InitializeDuesInput,
} from "../utils/validation.js";
import { requireAuth } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { HttpError } from "../middleware/error.js";
import {
  initializeTransaction,
  newReference,
  verifyTransaction,
  verifyWebhookSignature,
  type VerifyResponse,
} from "../payments/paystack.js";
import crypto from "node:crypto";
import { sendEmail } from "../email/client.js";
import { welcomeEmail } from "../email/templates/welcome.js";
import { fulfillContribution } from "./contributions.routes.js";
import { isContributionReference } from "../utils/contributionReference.js";
import { config } from "../config.js";

export const paymentsRouter = Router();

// Public: validate a payment token and return amount/member info for the landing page
paymentsRouter.get("/access/:token", async (req, res, next) => {
  try {
    const member = await MemberModel.findOne({ accessToken: req.params.token });
    if (!member) throw new HttpError(404, "This link is not valid");
    if (
      !member.accessTokenExpiresAt ||
      member.accessTokenExpiresAt.getTime() < Date.now()
    ) {
      throw new HttpError(410, "This link has expired");
    }
    if (member.status === "active") {
      // Already paid & activated
      return res.json({
        memberId: String(member._id),
        applicantId: member.applicantId ?? null,
        fullName: member.fullName,
        email: member.email,
        status: "active",
        fee: null,
      });
    }
    const settings = await getOrCreateSettings();
    res.json({
      memberId: String(member._id),
      applicantId: member.applicantId ?? null,
      fullName: member.fullName,
      email: member.email,
      status: member.status,
      fee: {
        amount: settings.membershipFee.amount,
        currency: settings.membershipFee.currency,
      },
    });
  } catch (err) {
    next(err);
  }
});

// Public: initialize a Paystack transaction
paymentsRouter.post("/initialize", async (req, res, next) => {
  try {
    const { accessToken } = InitializePaymentInput.parse(req.body);
    const member = await MemberModel.findOne({ accessToken });
    if (!member) throw new HttpError(404, "Invalid payment link");
    if (
      !member.accessTokenExpiresAt ||
      member.accessTokenExpiresAt.getTime() < Date.now()
    ) {
      throw new HttpError(410, "Payment link expired");
    }
    if (member.status === "active") {
      throw new HttpError(409, "This membership is already active");
    }

    const settings = await getOrCreateSettings();
    const year = new Date().getFullYear();
    const reference = newReference("wpn");
    // Paystack appends ?reference=…&trxref=… itself — don't include it here
    // or we end up with a duplicate query param.
    const callbackUrl = `${config.publicBaseUrl}/membership/payment/success`;

    const paystackData = await initializeTransaction({
      email: member.email,
      amount: settings.membershipFee.amount,
      currency: settings.membershipFee.currency,
      reference,
      callbackUrl,
      metadata: {
        memberId: String(member._id),
        purpose: "membership_initial",
        year,
      },
    });

    await PaymentModel.create({
      memberId: member._id,
      reference,
      amount: settings.membershipFee.amount,
      currency: settings.membershipFee.currency,
      status: "initialized",
      purpose: "membership_initial",
      year,
    });

    res.json({
      reference: paystackData.reference,
      authorizationUrl: paystackData.authorization_url,
      accessCode: paystackData.access_code,
      publicKey: config.paystackPublicKey,
      amount: settings.membershipFee.amount,
      currency: settings.membershipFee.currency,
      email: member.email,
    });
  } catch (err) {
    next(err);
  }
});

// Auth: the signed-in member's quarterly dues status for the current year.
paymentsRouter.get("/dues/status", requireAuth, async (req, res, next) => {
  try {
    const status = await memberDuesStatus(
      String(req.user!.sub),
      new Date().getFullYear()
    );
    res.json(status);
  } catch (err) {
    next(err);
  }
});

// Auth: start a Paystack payment for one quarter of the signed-in member's dues.
paymentsRouter.post("/dues/initialize", requireAuth, async (req, res, next) => {
  try {
    const { year, quarter } = InitializeDuesInput.parse(req.body);
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentQuarter = Math.floor(now.getMonth() / 3) + 1;
    // Only the current or a past-due quarter of the current year.
    if (year !== currentYear || quarter > currentQuarter) {
      throw new HttpError(
        400,
        "You can only pay dues for the current or a past-due quarter."
      );
    }

    const member = await MemberModel.findById(req.user!.sub);
    if (!member) throw new HttpError(404, "Member not found");
    if (member.status !== "active") {
      throw new HttpError(403, "Your account is not active");
    }

    const isWaived = (member.duesWaivers ?? []).some(
      (w) => w.year === year && w.quarter === quarter
    );
    if (isWaived) throw new HttpError(400, "Dues for this quarter have been waived.");

    const already = await PaymentModel.findOne({
      memberId: member._id,
      purpose: "dues_renewal",
      status: "success",
      year,
      quarter,
    });
    if (already) throw new HttpError(409, "Dues for this quarter are already paid.");

    const settings = await getOrCreateSettings();
    const quarterDisabled = (settings.disabledDuesQuarters ?? []).some(
      (d) => d.year === year && d.quarter === quarter
    );
    if (quarterDisabled) {
      throw new HttpError(
        400,
        "Dues collection for this quarter has been turned off by the association."
      );
    }
    const reference = newReference("wpndues");
    const callbackUrl = `${config.publicBaseUrl}/dashboard/dues`;

    const paystackData = await initializeTransaction({
      email: member.email,
      amount: settings.quarterlyDues.amount,
      currency: settings.quarterlyDues.currency,
      reference,
      callbackUrl,
      metadata: {
        memberId: String(member._id),
        purpose: "dues_renewal",
        year,
        quarter,
      },
    });

    await PaymentModel.create({
      memberId: member._id,
      reference,
      amount: settings.quarterlyDues.amount,
      currency: settings.quarterlyDues.currency,
      status: "initialized",
      purpose: "dues_renewal",
      year,
      quarter,
    });

    res.json({
      authorizationUrl: paystackData.authorization_url,
      reference: paystackData.reference,
    });
  } catch (err) {
    next(err);
  }
});

// Public: verify a payment (used as the fallback by the success page when
// the webhook hasn't fired — and as the primary path in local dev).
paymentsRouter.get("/verify/:reference", async (req, res, next) => {
  try {
    const result = await fulfillPayment(req.params.reference);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Public webhook from Paystack — must receive RAW body to verify signature.
// Mounted with express.raw() in index.ts.
export const paystackWebhook: RequestHandler = async (req, res) => {
  try {
    const signature = req.header("x-paystack-signature");
    const rawBody = req.body as Buffer | string; // raw()
    if (!verifyWebhookSignature(rawBody, signature)) {
      res.status(401).json({ error: "Invalid signature" });
      return;
    }
    const event = JSON.parse(
      typeof rawBody === "string" ? rawBody : rawBody.toString("utf8")
    ) as { event: string; data?: { reference?: string } };

    if (event.event === "charge.success" && event.data?.reference) {
      const reference = event.data.reference;
      try {
        // One Paystack webhook URL serves both flows — the reference prefix
        // says which ledger this transaction belongs to.
        if (isContributionReference(reference)) {
          await fulfillContribution(reference);
        } else {
          await fulfillPayment(reference);
        }
      } catch (err) {
        console.error("[webhook] fulfill failed", err);
      }
    }
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[webhook] handler error", err);
    res.status(200).json({ ok: false }); // 200 so Paystack doesn't retry forever
  }
};

// Admin: list payments
paymentsRouter.get("/", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const status = (req.query.status as string) || undefined;
    const filter: Record<string, unknown> = {};
    if (
      status &&
      ["initialized", "success", "failed", "abandoned"].includes(status)
    ) {
      filter.status = status;
    }
    const list = await PaymentModel.find(filter)
      .sort({ createdAt: -1 })
      .limit(200)
      .populate<{
        memberId: { _id: unknown; fullName: string; email: string };
      }>("memberId", "fullName email")
      .lean();
    res.json(
      list.map((p) => ({
        id: String(p._id),
        member: p.memberId
          ? {
              id: String(p.memberId._id),
              fullName: p.memberId.fullName,
              email: p.memberId.email,
            }
          : null,
        reference: p.reference,
        amount: p.amount,
        currency: p.currency,
        status: p.status,
        purpose: p.purpose,
        year: p.year,
        createdAt: p.createdAt,
        completedAt: p.completedAt,
      }))
    );
  } catch (err) {
    next(err);
  }
});

// Admin: stats
paymentsRouter.get(
  "/stats",
  requireAuth,
  requireAdmin,
  async (_req, res, next) => {
    try {
      const [initialized, success, failed] = await Promise.all([
        PaymentModel.countDocuments({ status: "initialized" }),
        PaymentModel.countDocuments({ status: "success" }),
        PaymentModel.countDocuments({ status: "failed" }),
      ]);
      res.json({ initialized, success, failed });
    } catch (err) {
      next(err);
    }
  }
);

// -----------------------------------------------------------------------
// Core fulfillment — idempotent. Called by both the verify endpoint and
// the webhook. Generates credentials, marks Dues paid, sends welcome email.
// -----------------------------------------------------------------------

type FulfillResult = {
  status: "success" | "failed" | "pending";
  memberId?: string;
  email?: string;
  applicantId?: string | null;
  // One-time token to set a password — only returned the FIRST time we fulfill,
  // never on re-checks. The member also receives it by email.
  setPasswordToken?: string;
  alreadyFulfilled?: boolean;
  paystack: VerifyResponse;
};

async function fulfillPayment(reference: string): Promise<FulfillResult> {
  const payment = await PaymentModel.findOne({ reference });
  if (!payment) throw new HttpError(404, "Payment not found");

  // Always verify with Paystack as source of truth
  const verify = await verifyTransaction(reference);

  if (payment.status === "success") {
    // Idempotent. If the webhook fulfilled this payment first, the member may
    // still not have set a password — surface their existing (unexpired) token
    // so the success page can show the "Set your password" button regardless of
    // which path ran fulfillment first.
    const member = await MemberModel.findById(payment.memberId).select(
      "email applicantId setPasswordToken passwordHash tokenExpiresAt"
    );
    let pendingToken: string | undefined;
    if (
      member &&
      !member.passwordHash &&
      member.setPasswordToken &&
      member.tokenExpiresAt &&
      member.tokenExpiresAt.getTime() > Date.now()
    ) {
      pendingToken = member.setPasswordToken;
    }
    return {
      status: "success",
      memberId: String(payment.memberId),
      email: member?.email,
      applicantId: member?.applicantId ?? null,
      setPasswordToken: pendingToken,
      alreadyFulfilled: true,
      paystack: verify,
    };
  }

  if (verify.status !== "success") {
    payment.status = verify.status === "failed" ? "failed" : "initialized";
    payment.paystackData = verify;
    await payment.save();
    return {
      status: verify.status === "failed" ? "failed" : "pending",
      paystack: verify,
    };
  }

  // Mark success
  payment.status = "success";
  payment.completedAt = new Date();
  payment.paystackData = verify;
  await payment.save();

  // The annual Dues record is only for the initial-membership payment.
  // Quarterly dues are tracked on the Payment record itself (by quarter).
  if (payment.purpose === "membership_initial") {
    await DuesModel.findOneAndUpdate(
      { memberId: payment.memberId, year: payment.year },
      {
        $set: {
          amountPaid: payment.amount,
          paid: true,
          paidAt: new Date(),
          method: "Paystack",
          reference: payment.reference,
        },
      },
      { upsert: true, new: true }
    );
  }

  // Activate member + generate credentials
  const member = await MemberModel.findById(payment.memberId);
  if (!member) throw new HttpError(404, "Member not found");

  // Activate the member, but never mint a password ourselves. Instead issue a
  // one-time set-password link so no plaintext credential is ever transmitted
  // or stored. The member chooses their own password before first sign-in.
  let setPasswordToken: string | undefined;
  if (member.status !== "active" || !member.passwordHash) {
    setPasswordToken = crypto.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // 14 days
    member.setPasswordToken = setPasswordToken;
    member.tokenExpiresAt = expires;
    member.mustChangePassword = false;
    member.status = "active";
    member.accessToken = null;
    member.accessTokenExpiresAt = null;
    await member.save();

    try {
      const tpl = welcomeEmail({
        fullName: member.fullName,
        email: member.email,
        applicantId: member.applicantId,
        setPasswordUrl: `${config.publicBaseUrl}/set-password/${setPasswordToken}`,
        expiresAt: expires,
      });
      await sendEmail({
        to: member.email,
        subject: tpl.subject,
        html: tpl.html,
        text: tpl.text,
      });
    } catch (err) {
      console.error("[welcome-email] failed", err);
      // Don't throw — the success page still surfaces the set-password link.
    }
  }

  return {
    status: "success",
    memberId: String(member._id),
    email: member.email,
    applicantId: member.applicantId ?? null,
    setPasswordToken,
    paystack: verify,
  };
}

// Avoid unused import warning
void express;
