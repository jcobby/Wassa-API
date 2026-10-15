import { Schema, model, type InferSchemaType, type Types } from "mongoose";

// An email reply an admin sent from the console. Kept on the message so the
// whole conversation is visible to every admin, not buried in one inbox.
const ContactReplySchema = new Schema(
  {
    subject: { type: String, required: true, trim: true },
    body: { type: String, required: true, trim: true },
    sentAt: { type: Date, default: () => new Date() },
    sentBy: { type: Schema.Types.ObjectId, ref: "Member", default: null },
    // Copied at send time so the thread still reads correctly if that admin's
    // account is later renamed or removed.
    sentByName: { type: String, default: "" },
  },
  { _id: false }
);

const ContactMessageSchema = new Schema(
  {
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, trim: true, default: "" },
    email: { type: String, required: true, trim: true, lowercase: true },
    message: { type: String, required: true, trim: true },
    submittedAt: { type: Date, default: () => new Date(), index: true },
    readAt: { type: Date, default: null, index: true },
    readBy: { type: Schema.Types.ObjectId, ref: "Member", default: null },
    replies: { type: [ContactReplySchema], default: [] },
  },
  { timestamps: true }
);

export type ContactMessage = InferSchemaType<typeof ContactMessageSchema> & {
  _id: Types.ObjectId;
};

export const ContactMessageModel = model("ContactMessage", ContactMessageSchema);
