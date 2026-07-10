import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../db.js";
import { MemberModel } from "../models/Member.js";
import { config } from "../config.js";

// Lists every account with role "admin" so you can spot anyone who shouldn't
// have admin access.  Run: npm run admins
async function main() {
  await connectDB();
  const admins = await MemberModel.find({ role: "admin" })
    .select("fullName email status createdAt")
    .sort({ createdAt: 1 })
    .lean();

  console.log(`\n[admins] ${admins.length} account(s) with role = "admin":\n`);
  for (const a of admins) {
    console.log(
      `  • ${a.email}  —  ${a.fullName || "(no name)"}  [status: ${a.status}]`
    );
  }
  console.log(
    admins.length > 1
      ? "\nIf any of these should NOT be an admin, demote them with:\n" +
          "  npm run set-role -- their@email.com member\n"
      : ""
  );
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("[admins] failed:", err);
  process.exit(1);
});

void config;
