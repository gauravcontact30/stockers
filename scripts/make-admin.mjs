// Promotes an existing account to admin, by email.
//
//   node scripts/make-admin.mjs you@example.com
//
// Why this exists: admin is granted at sign-up from the ADMIN_EMAILS environment variable, which
// is no help for an account that already exists — and the /admin page is admin-only, so without a
// first admin there is no way in through the UI. This is the one-off that breaks that circle.
//
// Setting ADMIN_EMAILS as well is still worth doing, so the role survives if the account is ever
// recreated:
//
//   ADMIN_EMAILS=you@example.com
//
// The script also backfills the fields that accounts created before trials, roles and email
// verification existed are missing, so an old record reads the same as a new one.

import { promises as fs } from "node:fs";
import path from "node:path";

const email = process.argv[2]?.trim().toLowerCase();

if (!email) {
  console.error("Usage: node scripts/make-admin.mjs <email>");
  process.exit(1);
}

const filePath = path.join(process.cwd(), "app", "data", "users.json");

let users;
try {
  users = JSON.parse(await fs.readFile(filePath, "utf8"));
} catch (error) {
  console.error(`Could not read ${filePath}: ${error.message}`);
  process.exit(1);
}

const user = users.find((entry) => entry.email?.toLowerCase() === email);

if (!user) {
  console.error(`No account found for ${email}.`);
  console.error(`Known accounts: ${users.map((entry) => entry.email).join(", ") || "(none)"}`);
  process.exit(1);
}

user.role = "admin";
// Backfill only what is absent — an existing value is the user's real history and is left alone.
user.trialStartedAt ??= user.createdAt;
user.subscribedUntil ??= null;
user.emailVerifiedAt ??= new Date().toISOString();
user.verificationToken ??= null;

await fs.writeFile(filePath, JSON.stringify(users, null, 2), "utf8");

console.log(`${email} is now an admin. Open /admin (sign out and back in if it is already loaded).`);
