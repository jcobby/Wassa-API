import { Router } from "express";
import { getOrCreateSettings, SettingsModel } from "../models/Settings.js";
import { UpdateMembershipFeeInput } from "../utils/validation.js";
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

// Ensure the model is registered eagerly (used by other modules)
void SettingsModel;
