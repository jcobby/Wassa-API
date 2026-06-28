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

const SettingsSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, default: "global" },
    membershipFee: {
      type: MembershipFeeSchema,
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
