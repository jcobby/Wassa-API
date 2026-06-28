import { Schema, model, type InferSchemaType, type Types } from "mongoose";

const NextOfKinSchema = new Schema(
  {
    fullName: { type: String, required: true, trim: true },
    relationship: { type: String, required: true, trim: true },
    contact: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const MemberSchema = new Schema(
  {
    // Snapshot of approved application
    fullName: { type: String, required: true, trim: true },
    title: { type: String, required: true },
    titleOther: { type: String, default: "" },
    gender: { type: String, required: true },
    dateOfBirth: { type: String, required: true },
    mobileNumbers: { type: String, required: true },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
      index: true,
    },
    postalAddress: { type: String, required: true },
    cityOfResidence: { type: String, required: true },
    countryOfResidence: { type: String, required: true },
    homeCountry: { type: String, required: true },
    hometown: { type: String, required: true },
    fathersHometown: { type: String, required: true },
    fathersEthnicGroup: { type: String, default: "" },
    mothersHometown: { type: String, default: "" },
    mothersEthnicGroup: { type: String, default: "" },
    occupation: { type: String, required: true },
    currentPlaceOfWork: { type: String, required: true },
    jobTitle: { type: String, required: true },
    educationalBackground: { type: [String], default: [] },
    workExperience: { type: String, required: true },
    areasOfInterest: { type: [String], default: [] },
    nextOfKin: { type: NextOfKinSchema, required: true },

    // Auth & lifecycle
    role: {
      type: String,
      enum: ["member", "admin"],
      default: "member",
      index: true,
    },
    status: {
      type: String,
      enum: ["active", "suspended", "terminated", "pending_payment"],
      default: "active",
      index: true,
    },
    passwordHash: { type: String, default: null },
    mustChangePassword: { type: Boolean, default: false },

    // For password reset / forgot-password flows
    setPasswordToken: { type: String, default: null, index: true },
    tokenExpiresAt: { type: Date, default: null },

    // For the post-approval payment activation link
    accessToken: { type: String, default: null, index: true },
    accessTokenExpiresAt: { type: Date, default: null },

    joinedAt: { type: Date, default: () => new Date() },
    lastLoginAt: { type: Date },

    // Provenance
    applicationId: { type: Schema.Types.ObjectId, ref: "Application" },
  },
  { timestamps: true }
);

MemberSchema.index({ fullName: "text" });

export type Member = InferSchemaType<typeof MemberSchema> & {
  _id: Types.ObjectId;
};

export const MemberModel = model("Member", MemberSchema);
