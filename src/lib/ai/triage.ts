import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { actorId, type StaffUser } from "@/lib/auth/staff-types";
import { loadWorkflowConfig } from "@/lib/cases/load-workflow";
import { getAiProvider } from "./index";
import { redact, type KnownParty, type RedactionKind } from "./redact";
import type { AiProvider, AiResult } from "./provider";

export type AiKind = "triage" | "case_summary";
export type AiRunStatus = "ok" | "unavailable" | "disabled";

export interface AiOutputRow {
  id: string;
  kind: AiKind;
  provider: string;
  model: string;
  status: "ok" | "unavailable";
  output: Record<string, unknown> | null;
  error: string | null;
  created_at: string;
}

/** The provider to use, or null when AI is switched off (admin setting) or not configured. */
export async function activeProvider(): Promise<AiProvider | null> {
  const cfg = await loadWorkflowConfig();
  if (!cfg.aiEnabled) return null;
  return getAiProvider();
}

/** Names to replace with placeholders: the complainant and the advocate (roll name and name as given). */
export async function caseParties(caseId: string): Promise<{ parties: KnownParty[]; summary: string; description: string }> {
  const admin = createAdminClient();
  const { data: c, error } = await admin
    .from("cases")
    .select("summary,description,advocate_name_given,complainant:profiles!cases_complainant_id_fkey(full_name),advocate:advocates(full_name)")
    .eq("id", caseId)
    .single();
  if (error) throw new Error(`load case for AI: ${error.message}`);
  const complainant = (c.complainant as unknown as { full_name: string | null } | null)?.full_name;
  const advocateRoll = (c.advocate as unknown as { full_name: string } | null)?.full_name;
  const parties: KnownParty[] = [];
  if (complainant) parties.push({ name: complainant, placeholder: "[COMPLAINANT]" });
  for (const n of new Set([advocateRoll, c.advocate_name_given].filter(Boolean) as string[])) {
    parties.push({ name: n, placeholder: "[ADVOCATE]" });
  }
  return { parties, summary: c.summary as string, description: c.description as string };
}

export function addCounts(a: Record<RedactionKind, number>, b: Record<RedactionKind, number>) {
  const out = { ...a };
  for (const k of Object.keys(b) as RedactionKind[]) out[k] = (out[k] ?? 0) + b[k];
  return out;
}

/** Stores the result (never applied to the case itself) and audits the call without any text. */
export async function recordAi<T>(
  caseId: string,
  kind: AiKind,
  provider: AiProvider,
  result: AiResult<T>,
  redactions: Record<RedactionKind, number>,
  actor: StaffUser | null,
): Promise<AiRunStatus> {
  const status = result.ok ? "ok" : "unavailable";
  const { error } = await createAdminClient()
    .from("ai_outputs")
    .insert({
      case_id: caseId,
      kind,
      provider: provider.name,
      model: provider.model,
      status,
      output: result.ok ? result.value : null,
      error: result.ok ? null : result.reason,
      created_by: actor ? actorId(actor) : null,
    });
  if (error) throw new Error(`store AI output: ${error.message}`);
  await logAudit({
    actorId: actor ? actorId(actor) : null,
    channel: actor && actor.id !== "system" ? "web" : "system",
    action: kind === "triage" ? "ai_triage" : "ai_summary",
    entity: "cases",
    entityId: caseId,
    details: { provider: provider.name, model: provider.model, ok: result.ok, reason: result.ok ? null : result.reason, redactions },
  });
  return status;
}

/**
 * Suggests category, priority and a bilingual summary for a case. Only redacted text is sent.
 * The suggestion is stored in ai_outputs for staff to review; the case itself is never changed.
 */
export async function triageCase(caseId: string, actor: StaffUser | null = null): Promise<{ status: AiRunStatus }> {
  const provider = await activeProvider();
  if (!provider) return { status: "disabled" };
  const cfg = await loadWorkflowConfig();
  const { parties, summary, description } = await caseParties(caseId);
  const r = redact(`${summary}\n\n${description}`, parties);

  let result = await provider.triage({ text: r.text, categories: cfg.categories });
  if (result.ok && !cfg.categories.includes(result.value.category)) result = { ok: false, reason: "invalid_output" };
  return { status: await recordAi(caseId, "triage", provider, result, r.counts, actor) };
}

export async function latestAi(caseId: string, kind: AiKind): Promise<AiOutputRow | null> {
  const { data } = await createAdminClient()
    .from("ai_outputs")
    .select("id,kind,provider,model,status,output,error,created_at")
    .eq("case_id", caseId)
    .eq("kind", kind)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as AiOutputRow | null) ?? null;
}
