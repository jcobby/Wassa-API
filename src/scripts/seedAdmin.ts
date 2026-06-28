import "dotenv/config";
import mongoose from "mongoose";
import { config } from "../config.js";
import { connectDB } from "../db.js";
import { MemberModel } from "../models/Member.js";
import { hashPassword } from "../utils/password.js";

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const fullName = process.env.ADMIN_FULL_NAME ?? "WPN Administrator";

  if (!email || !password) {
    throw new Error(
      "Set ADMIN_EMAIL and ADMIN_PASSWORD in .env before running seed:admin"
    );
  }

  await connectDB();

  const existing = await MemberModel.findOne({ email: email.toLowerCase() });
  if (existing) {
    existing.role = "admin";
    existing.status = "active";
    existing.passwordHash = await hashPassword(password);
    existing.setPasswordToken = null;
    existing.tokenExpiresAt = null;
    await existing.save();
    console.log(`[seed] Updated existing admin: ${email}`);
  } else {
    await MemberModel.create({
      fullName,
      title: "Mr",
      gender: "Prefer not to say",
      dateOfBirth: "01 January",
      mobileNumbers: "—",
      email: email.toLowerCase(),
      postalAddress: "—",
      cityOfResidence: "—",
      countryOfResidence: "Ghana",
      homeCountry: "Ghana",
      hometown: "—",
      fathersHometown: "—",
      occupation: "Administrator",
      currentPlaceOfWork: "WPN",
      jobTitle: "Administrator",
      workExperience: "—",
      nextOfKin: { fullName: "—", relationship: "—", contact: "—" },
      role: "admin",
      status: "active",
      passwordHash: await hashPassword(password),
    });
    console.log(`[seed] Created admin: ${email}`);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("[seed] failed:", err);
  process.exit(1);
});

void config; // ensure config loads & env validates
