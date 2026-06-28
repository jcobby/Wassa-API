import { Schema, model, type InferSchemaType, type Types } from "mongoose";

const ContactMessageSchema = new Schema(
  {
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, trim: true, default: "" },
    email: { type: String, required: true, trim: true, lowercase: true },
    message: { type: String, required: true, trim: true },
    submittedAt: { type: Date, default: () => new Date(), index: true },
    readAt: { type: Date, default: null, index: true },
    readBy: { type: Schema.Types.ObjectId, ref: "Member", default: null },
  },
  { timestamps: true }
);

export type ContactMessage = InferSchemaType<typeof ContactMessageSchema> & {
  _id: Types.ObjectId;
};

export const ContactMessageModel = model("ContactMessage", ContactMessageSchema);
