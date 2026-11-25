import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client. Bypasses RLS — server-only, never import from client components.
 * Used for audit logging, case-number generation and system tasks.
 */
export function createAdminClient() {
  if (typeof window !== "undefined") {
    throw new Error("createAdminClient must not run in the browser");
  }
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
