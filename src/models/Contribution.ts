import { Schema, model, type InferSchemaType, type Types } from "mongoose";

// A voluntary contribution (donation) toward WPN's work. Unlike Payment, this
// is NOT tied to a member — anyone may give, member or not — so `memberId` is
// optional and the donor's own details are stored on the record itself.
const ContributionSchema = new Schema(
  {
    donorName: { type: String, required: true, trim: true },
    donorEmail: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    donorPhone: { type: String, default: "", trim: true },
    // Keeps the donor's name off any public acknowledgement. The Secretariat
    // still sees it — receipts and reconciliation need a real name.
    anonymous: { type: Boolean, default: false },
    amount: { type: Number, required: true }, // major units (e.g. 250.00 GHS)
    currency: { type: String, required: true, default: "GHS" },
    // What the donor earmarked it for. Free text so admins can retire or add
    // causes in Settings without a migration.
    cause: { type: String, default: "", trim: true },
    message: { type: String, default: "", trim: true },
    // Set when a signed-in member gives, so giving can be traced to their record.
    memberId: {
      type: Schema.Types.ObjectId,
      ref: "Member",
      default: null,
      index: true,
    },
    reference: { type: String, required: true, unique: true, index: true },
    status: {
      type: String,
      enum: ["initialized", "success", "failed", "abandoned"],
      default: "initialized",
      index: true,
    },
    paystackData: { type: Schema.Types.Mixed, default: null },
    completedAt: { type: Date, default: null },
    // Guards against sending a second receipt when both the webhook and the
    // success page fulfil the same contribution.
    receiptSentAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export type Contribution = InferSchemaType<typeof ContributionSchema> & {
  _id: Types.ObjectId;
};

export const ContributionModel = model("Contribution", ContributionSchema);
