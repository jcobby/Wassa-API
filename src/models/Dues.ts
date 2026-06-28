import { Schema, model, type InferSchemaType, type Types } from "mongoose";

const DuesSchema = new Schema(
  {
    memberId: {
      type: Schema.Types.ObjectId,
      ref: "Member",
      required: true,
      index: true,
    },
    year: { type: Number, required: true, index: true },
    amountDue: { type: Number, default: 0 },
    amountPaid: { type: Number, default: 0 },
    paid: { type: Boolean, default: false, index: true },
    paidAt: { type: Date, default: null },
    recordedBy: { type: Schema.Types.ObjectId, ref: "Member" },
    method: { type: String, default: "" },
    reference: { type: String, default: "" },
    notes: { type: String, default: "" },
  },
  { timestamps: true }
);

DuesSchema.index({ memberId: 1, year: 1 }, { unique: true });

export type Dues = InferSchemaType<typeof DuesSchema> & {
  _id: Types.ObjectId;
};

export const DuesModel = model("Dues", DuesSchema);
