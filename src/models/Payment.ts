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
    paystackData: { type: Schema.Types.Mixed, default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export type Payment = InferSchemaType<typeof PaymentSchema> & {
  _id: Types.ObjectId;
};

export const PaymentModel = model("Payment", PaymentSchema);
