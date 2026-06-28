import { z } from "zod";

const trimmed = (min = 1) => z.string().trim().min(min);

export const ApplicationInput = z.object({
  // Section A
  fullName: trimmed(2),
  title: z.enum(["Mr", "Mrs", "Dr", "Professor", "Other"]),
  titleOther: z.string().trim().optional(),

  // Section B
  gender: z.enum(["Male", "Female", "Other", "Prefer not to say"]),
  dateOfBirth: trimmed(3), // e.g. "12/06" — day/month only per the Google Form
  mobileNumbers: trimmed(5),
  email: z.string().trim().toLowerCase().email(),
  postalAddress: trimmed(),
  cityOfResidence: trimmed(),
  countryOfResidence: trimmed(),

  // Section C
  homeCountry: trimmed(),
  hometown: trimmed(),
  fathersHometown: trimmed(),
  fathersEthnicGroup: z.string().trim().optional().default(""),
  mothersHometown: z.string().trim().optional().default(""),
  mothersEthnicGroup: z.string().trim().optional().default(""),

  // Section D
  occupation: trimmed(),
  currentPlaceOfWork: trimmed(),
  jobTitle: trimmed(),
  educationalBackground: z.array(z.string().trim()).min(1),
  workExperience: trimmed(),
  areasOfInterest: z.array(z.string().trim()).min(1),

  // Section E
  nextOfKin: z.object({
    fullName: trimmed(2),
    relationship: trimmed(),
    contact: trimmed(5),
  }),
});

export type ApplicationInput = z.infer<typeof ApplicationInput>;

export const LoginInput = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

export const SetPasswordInput = z.object({
  token: z.string().min(10),
  password: z.string().min(8),
});

export const ContactInput = z.object({
  firstName: trimmed(),
  lastName: z.string().trim().optional().default(""),
  email: z.string().trim().toLowerCase().email(),
  message: trimmed(5),
});

export const ReviewInput = z.object({
  notes: z.string().trim().optional().default(""),
});

export const RecordPaymentInput = z.object({
  memberId: z.string().min(1),
  year: z.number().int().min(2020).max(2100),
  amount: z.number().nonnegative(),
  method: z.string().trim().optional().default(""),
  reference: z.string().trim().optional().default(""),
  notes: z.string().trim().optional().default(""),
});

export const UpdateMembershipFeeInput = z.object({
  amount: z.number().positive().max(1_000_000),
  currency: z.string().trim().length(3).toUpperCase().optional(),
});

export const InitializePaymentInput = z.object({
  accessToken: z.string().min(10),
});

export const ChangePasswordInput = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});
