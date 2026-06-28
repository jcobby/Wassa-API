import { Schema, model, type InferSchemaType, type Types } from "mongoose";

const NextOfKinSchema = new Schema(
  {
    fullName: { type: String, required: true, trim: true },
    relationship: { type: String, required: true, trim: true },
    contact: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const ApplicationSchema = new Schema(
  {
    // Section A
    fullName: { type: String, required: true, trim: true },
    title: {
      type: String,
      required: true,
      enum: ["Mr", "Mrs", "Dr", "Professor", "Other"],
    },
    titleOther: { type: String, trim: true, default: "" },

    // Section B
    gender: {
      type: String,
      required: true,
      enum: ["Male", "Female", "Other", "Prefer not to say"],
    },
    dateOfBirth: { type: String, required: true, trim: true },
    mobileNumbers: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    postalAddress: { type: String, required: true, trim: true },
    cityOfResidence: { type: String, required: true, trim: true },
    countryOfResidence: { type: String, required: true, trim: true },

    // Section C
    homeCountry: { type: String, required: true, trim: true },
    hometown: { type: String, required: true, trim: true },
    fathersHometown: { type: String, required: true, trim: true },
    fathersEthnicGroup: { type: String, trim: true, default: "" },
    mothersHometown: { type: String, trim: true, default: "" },
    mothersEthnicGroup: { type: String, trim: true, default: "" },

    // Section D
    occupation: { type: String, required: true, trim: true },
    currentPlaceOfWork: { type: String, required: true, trim: true },
    jobTitle: { type: String, required: true, trim: true },
    educationalBackground: { type: [String], default: [] },
    workExperience: { type: String, required: true, trim: true },
    areasOfInterest: { type: [String], default: [] },

    // Section E
    nextOfKin: { type: NextOfKinSchema, required: true },

    // Email ownership (double opt-in) — proves the applicant controls the
    // address before we ever email them an approval/payment link.
    emailVerified: { type: Boolean, default: false },
    verifyToken: { type: String, default: null, index: true },
    verifyTokenExpiresAt: { type: Date, default: null },
    // Auto-cleanup: a TTL index purges the document once this date passes. Set
    // on creation, then cleared (null) the moment the email is confirmed — so
    // only never-confirmed applications are ever deleted.
    cleanupAt: { type: Date, default: null },

    // Workflow
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },
    submittedAt: { type: Date, default: () => new Date() },
    reviewedAt: { type: Date },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "Member" },
    reviewNotes: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

// TTL index: MongoDB deletes a document once `cleanupAt` is in the past.
// Documents where cleanupAt is null/unset are never touched, so confirmed and
// reviewed applications are kept permanently.
ApplicationSchema.index({ cleanupAt: 1 }, { expireAfterSeconds: 0 });

export type Application = InferSchemaType<typeof ApplicationSchema> & {
  _id: Types.ObjectId;
};

export const ApplicationModel = model("Application", ApplicationSchema);
