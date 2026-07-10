import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../db.js";
import { MemberModel } from "../models/Member.js";
import { config } from "../config.js";

// Promote or demote a member by email.
//   npm run set-role -- someone@email.com admin
//   npm run set-role -- someone@email.com member
async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  const role = process.argv[3]?.trim();
  if (!email || (role !== "admin" && role !== "member")) {
    throw new Error(
      "Usage: npm run set-role -- <email> <admin|member>"
    );
  }

  await connectDB();
  const member = await MemberModel.findOne({ email });
  if (!member) throw new Error(`No member found with email: ${email}`);

  const prev = member.role;
  if (prev === role) {
    console.log(`[set-role] ${email} is already "${role}" — no change.`);
  } else {
    member.role = role;
    await member.save();
    console.log(`[set-role] ${email}: ${prev} -> ${role}`);
  }
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("[set-role] failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});

void config;
