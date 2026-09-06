import { Router } from "express";
import { getOrCreateSettings, SettingsModel } from "../models/Settings.js";
import {
  UpdateMembershipFeeInput,
  DisableQuarterInput,
  UpdateContributionSettingsInput,
} from "../utils/validation.js";
import { requireAuth } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";

export const settingsRouter = Router();

// Public: payment page needs to read the current fee
settingsRouter.get("/membership-fee", async (_req, res, next) => {
  try {
    const s = await getOrCreateSettings();
    res.json({
      amount: s.membershipFee.amount,
      currency: s.membershipFee.currency,
    });
  } catch (err) {
    next(err);
  }
});

// Admin: full settings doc
settingsRouter.get("/", requireAuth, requireAdmin, async (_req, res, next) => {
  try {
    const s = await getOrCreateSettings();
    res.json(s);
  } catch (err) {
    next(err);
  }
});

// Admin: update fee
settingsRouter.patch(
  "/membership-fee",
  requireAuth,
  requireAdmin,
  async (req, res, next) => {
    try {
      const input = UpdateMembershipFeeInput.parse(req.body);
      const s = await getOrCreateSettings();
      s.membershipFee.amount = input.amount;
      if (input.currency) s.membershipFee.currency = input.currency;
      s.updatedBy = req.user!.sub as unknown as typeof s.updatedBy;
      await s.save();
      res.json({
        amount: s.membershipFee.amount,
        currency: s.membershipFee.currency,
      });
    } catch (err) {
      next(err);
    }
  }
);

// Admin: update quarterly dues amount
settingsRouter.patch(
  "/quarterly-dues",
  requireAuth,
  requireAdmin,
  async (req, res, next) => {
    try {
      const input = UpdateMembershipFeeInput.parse(req.body);
      const s = await getOrCreateSettings();
      s.quarterlyDues.amount = input.amount;
      if (input.currency) s.quarterlyDues.currency = input.currency;
      s.updatedBy = req.user!.sub as unknown as typeof s.updatedBy;
      await s.save();
      res.json({
        amount: s.quarterlyDues.amount,
        currency: s.quarterlyDues.currency,
      });
    } catch (err) {
      next(err);
    }
  }
);

// Admin: enable/disable dues collection for a whole quarter (global waiver).
settingsRouter.post(
  "/dues-quarter",
  requireAuth,
  requireAdmin,
  async (req, res, next) => {
    try {
      const { year, quarter, disabled } = DisableQuarterInput.parse(req.body);
      const s = await getOrCreateSettings();
      const idx = s.disabledDuesQuarters.findIndex(
        (d) => d.year === year && d.quarter === quarter
      );
      if (disabled && idx < 0) {
        s.disabledDuesQuarters.push({ year, quarter });
      } else if (!disabled && idx >= 0) {
        s.disabledDuesQuarters.splice(idx, 1);
      }
      s.updatedBy = req.user!.sub as unknown as typeof s.updatedBy;
      await s.save();
      res.json({ disabledDuesQuarters: s.disabledDuesQuarters });
    } catch (err) {
      next(err);
    }
  }
);

// Admin: configure public voluntary giving — open/closed, currency, the floor,
// the suggested chips, and the causes a gift can be earmarked for.
settingsRouter.patch(
  "/contributions",
  requireAuth,
  requireAdmin,
  async (req, res, next) => {
    try {
      const input = UpdateContributionSettingsInput.parse(req.body);
      const s = await getOrCreateSettings();
      const c = s.contributions;
      if (input.enabled !== undefined) c.enabled = input.enabled;
      if (input.currency) c.currency = input.currency;
      if (input.minAmount !== undefined) c.minAmount = input.minAmount;
      if (input.suggestedAmounts) {
        // Sorted and de-duplicated so the give page's chips read sensibly
        // whatever order they were typed in.
        c.suggestedAmounts = [...new Set(input.suggestedAmounts)].sort(
          (a, b) => a - b
        );
      }
      if (input.causes) c.causes = [...new Set(input.causes)];
      s.updatedBy = req.user!.sub as unknown as typeof s.updatedBy;
      await s.save();
      res.json(s.contributions);
    } catch (err) {
      next(err);
    }
  }
);

// Ensure the model is registered eagerly (used by other modules)
void SettingsModel;
