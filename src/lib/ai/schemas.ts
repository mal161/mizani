import { z } from "zod";

export const triageSchema = z.object({
  category: z.string(),
  priority: z.enum(["low", "normal", "high", "urgent"]),
  urgency_reasons: z.array(z.string().max(200)).max(5),
  summary_en: z.string().max(600),
  summary_sw: z.string().max(600),
  language: z.enum(["en", "sw", "mixed"]),
});
export type Triage = z.infer<typeof triageSchema>;

export const caseSummarySchema = z.object({
  summary_en: z.string().max(2000),
  summary_sw: z.string().max(2000),
  key_dates: z.array(z.object({ date: z.string(), event: z.string() })).max(10),
  open_questions: z.array(z.string()).max(5),
});
export type CaseSummary = z.infer<typeof caseSummarySchema>;
