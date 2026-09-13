import { Schema, model, type InferSchemaType, type Types } from "mongoose";

const PaymentSchema = new Schema(
  {
    memberId: {
      type: Schema.Types.ObjectId,
      ref: "Member",
      required: true,
      index: true,
    },
    reference: { type: String, required: true, unique: true, index: true },
    amount: { type: Number, required: true }, // major units (e.g. 200.00 GHS)
    currency: { type: String, required: true, default: "GHS" },
    status: {
      type: String,
      enum: ["initialized", "success", "failed", "abandoned"],
      default: "initialized",
      index: true,
    },
    purpose: {
      type: String,
      enum: ["membership_initial", "dues_renewal"],
      required: true,
      index: true,
    },
    year: { type: Number, required: true, index: true },
    // Calendar quarter (1-4) for dues_renewal payments; null for membership_initial.
    quarter: { type: Number, default: null, index: true },
    // Set when several quarters were paid in one "pay all remaining" checkout.
    // Paystack only knows this shared reference; each quarter's row still has
    // its own unique `reference` so per-quarter status checks work unchanged.
    batchReference: { type: String, default: null, index: true },
    paystackData: { type: Schema.Types.Mixed, default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export type Payment = InferSchemaType<typeof PaymentSchema> & {
  _id: Types.ObjectId;
};

export const PaymentModel = model("Payment", PaymentSchema);
