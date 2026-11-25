/**
 * Creates a staff, admin or commissioner account with a one-time temporary password.
 * Usage: npx tsx scripts/create-staff.ts <email> <staff|admin|commissioner> <office> "<Full Name>"
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (read from .env.local).
 * The person sets up their authenticator app at first sign-in.
 */
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

try {
  process.loadEnvFile(".env.local");
} catch {
  /* rely on environment */
}

const [email, role, office, fullName] = process.argv.slice(2);
if (!email || !["staff", "admin", "commissioner"].includes(role ?? "") || !office || !fullName) {
  console.error('Usage: npx tsx scripts/create-staff.ts <email> <staff|admin|commissioner> <office> "<Full Name>"');
  process.exit(1);
}

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
const tempPassword = randomBytes(12).toString("base64url");
const { data, error } = await admin.auth.admin.createUser({ email, password: tempPassword, email_confirm: true });
if (error || !data.user) {
  console.error("Could not create user:", error?.message);
  process.exit(1);
}
const { error: pErr } = await admin
  .from("profiles")
  .insert({ id: data.user.id, role, office, full_name: fullName });
if (pErr) {
  await admin.auth.admin.deleteUser(data.user.id);
  console.error("Could not create profile:", pErr.message);
  process.exit(1);
}
console.log(`Created ${role} ${email} (${office}). Temporary password (shown once): ${tempPassword}`);
