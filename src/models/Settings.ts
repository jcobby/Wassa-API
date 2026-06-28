import { Schema, model, type InferSchemaType, type Types } from "mongoose";

const SettingsSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, default: "global" },
    membershipFee: {
      amount: { type: Number, required: true, default: 200 },
      currency: { type: String, required: true, default: "GHS" },
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
