import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseWorkflowConfig, type WorkflowConfig } from "./workflow-config";

const KEYS = ["sla_days", "conciliation_enabled", "stage_labels", "categories", "advocate_response_days", "ai_enabled"];

async function load(): Promise<WorkflowConfig> {
  const { data, error } = await createAdminClient().from("settings").select("key,value").in("key", KEYS);
  if (error) throw new Error(`load settings: ${error.message}`);
  return parseWorkflowConfig(data ?? []);
}

/** Workflow settings, read once per request (React cache); outside a request it simply loads. */
export const loadWorkflowConfig = cache(load);
