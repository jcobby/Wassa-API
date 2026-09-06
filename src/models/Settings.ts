import { Schema, model, type InferSchemaType, type Types } from "mongoose";

// A sub-schema (like NextOfKin) so InferSchemaType treats membershipFee as an
// always-present object rather than possibly-undefined — callers read
// `membershipFee.amount` directly without null checks.
const MembershipFeeSchema = new Schema(
  {
    amount: { type: Number, required: true, default: 200 },
    currency: { type: String, required: true, default: "GHS" },
  },
  { _id: false }
);

// A quarter for which dues collection is turned off for the whole membership —
// nobody owes or can pay it (a global waiver). Admin-controlled.
const DisabledQuarterSchema = new Schema(
  {
    year: { type: Number, required: true },
    quarter: { type: Number, required: true },
  },
  { _id: false }
);

// Voluntary contributions (donations). Open to anyone — member or not — so the
// only real constraint is a floor that keeps Paystack from rejecting dust
// amounts. Everything else here is presentation for the give page.
const ContributionSettingsSchema = new Schema(
  {
    enabled: { type: Boolean, required: true, default: true },
    currency: { type: String, required: true, default: "GHS" },
    // A floor, not a price. Donors type whatever they wish above it.
    minAmount: { type: Number, required: true, default: 1 },
    // One-tap chips on the give page — a convenience, never a limit.
    suggestedAmounts: {
      type: [Number],
      default: () => [50, 100, 200, 500, 1000],
    },
    // Designations a donor can earmark their gift for. The first entry is the
    // default selection.
    causes: {
      type: [String],
      default: () => [
        "Where it's needed most",
        "Education Fund",
        "Health & Wellbeing",
        "Youth & Mentorship",
        "Community Projects",
      ],
    },
  },
  { _id: false }
);

const SettingsSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, default: "global" },
    membershipFee: {
      type: MembershipFeeSchema,
      required: true,
      default: () => ({}),
    },
    // Recurring dues charged every calendar quarter.
    quarterlyDues: {
      type: MembershipFeeSchema,
      required: true,
      default: () => ({ amount: 300, currency: "GHS" }),
    },
    // Quarters where dues collection is disabled for everyone.
    disabledDuesQuarters: { type: [DisabledQuarterSchema], default: [] },
    // Public, any-amount giving. Separate from fees and dues.
    contributions: {
      type: ContributionSettingsSchema,
      required: true,
      default: () => ({}),
    },
    updatedBy: { type: Schema.Types.ObjectId, ref: "Member" },
  },
  { timestamps: true }
);

export type Settings = InferSchemaType<typeof SettingsSchema> & {
  _id: Types.ObjectId;
};

export const SettingsModel = model("Settings", SettingsSchema);

export async function getOrCreateSettings(): Promise<
  InstanceType<typeof SettingsModel>
> {
  let s = await SettingsModel.findOne({ key: "global" });
  if (!s) s = await SettingsModel.create({ key: "global" });
  return s;
}
