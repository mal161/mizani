"use server";

import { createServerClient } from "@/lib/supabase/server";

export type AdvocateOption = { id: string; full_name: string; admission_no: string; firm: string | null };

/** Searches the public advocates roll by name or admission number (public columns only). */
export async function searchAdvocates(q: string): Promise<AdvocateOption[]> {
  // Strip characters that carry meaning in PostgREST filter syntax.
  const term = String(q ?? "").trim().replace(/[%_,()"\\.*:]/g, " ").replace(/\s+/g, " ").slice(0, 60);
  if (term.length < 2) return [];
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("advocates")
    .select("id,full_name,admission_no,firm")
    .or(`full_name.ilike.%${term}%,admission_no.ilike.%${term}%`)
    .order("full_name")
    .limit(8);
  return (data ?? []) as AdvocateOption[];
}
