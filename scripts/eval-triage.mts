/**
 * Measures AI triage against evals/triage-cases.jsonl (30 synthetic complaints: English, Kiswahili, Sheng/mixed).
 *
 * Usage:
 *   npx tsx scripts/eval-triage.mts --provider fake            # free, deterministic plumbing check
 *   npx tsx scripts/eval-triage.mts --provider claude --yes    # real model: spends money (needs ANTHROPIC_API_KEY)
 *   npx tsx scripts/eval-triage.mts --provider openrouter --yes # any OpenRouter model (AI_API_KEY, AI_MODEL)
 *   npx tsx scripts/eval-triage.mts --provider openai-compatible --yes # self-hosted (AI_BASE_URL, AI_MODEL)
 *   --limit N  only the first N cases
 */
import fs from "node:fs";

try {
  process.loadEnvFile(".env.local");
} catch {
  /* rely on environment */
}

const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const providerName = opt("provider") ?? "fake";
const limit = Number(opt("limit") ?? "0") || undefined;
if (providerName !== "fake" && !args.includes("--yes")) {
  console.error(`Running the eval on ${providerName} sends 30 requests (paid APIs bill for them). Re-run with --yes to confirm.`);
  process.exit(1);
}

process.env.AI_PROVIDER = providerName;
const { getAiProvider } = await import("../src/lib/ai");
const { redact } = await import("../src/lib/ai/redact");
const { DEFAULT_WORKFLOW } = await import("../src/lib/cases/workflow-config");

const maybeProvider = getAiProvider();
if (!maybeProvider) {
  console.error(`Provider "${providerName}" is not configured (see README → AI assistance).`);
  process.exit(1);
}
const provider = maybeProvider;
const rank = { low: 0, normal: 1, high: 2, urgent: 3 } as const;
type Rank = keyof typeof rank;

interface EvalCase {
  id: string;
  lang: string;
  text: string;
  expected_category: string;
  expected_priority_min: Rank;
}

const cases: EvalCase[] = fs
  .readFileSync("evals/triage-cases.jsonl", "utf8")
  .split("\n")
  .filter((l) => l.trim())
  .map((l) => JSON.parse(l))
  .slice(0, limit);

const byLang: Record<string, { n: number; cat: number; pri: number; unavailable: number }> = {};
const misses: string[] = [];
for (const c of cases) {
  const r = await provider.triage({ text: redact(c.text, []).text, categories: DEFAULT_WORKFLOW.categories });
  const s = (byLang[c.lang] ??= { n: 0, cat: 0, pri: 0, unavailable: 0 });
  s.n++;
  if (!r.ok) {
    s.unavailable++;
    misses.push(`${c.id}: unavailable (${r.reason})`);
    continue;
  }
  const catOk = r.value.category === c.expected_category;
  const priOk = rank[r.value.priority] >= rank[c.expected_priority_min];
  if (catOk) s.cat++;
  if (priOk) s.pri++;
  if (!catOk || !priOk) {
    misses.push(`${c.id}: got ${r.value.category}/${r.value.priority}, expected ${c.expected_category}/≥${c.expected_priority_min}`);
  }
}

const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}%` : "-");
console.log(`Provider: ${provider.name} (${provider.model}), ${cases.length} cases\n`);
console.log("language  cases  category  priority≥  unavailable");
let tn = 0, tc = 0, tp = 0, tu = 0;
for (const [lang, s] of Object.entries(byLang)) {
  console.log(`${lang.padEnd(9)} ${String(s.n).padStart(5)}  ${pct(s.cat, s.n).padStart(8)}  ${pct(s.pri, s.n).padStart(9)}  ${String(s.unavailable).padStart(11)}`);
  tn += s.n; tc += s.cat; tp += s.pri; tu += s.unavailable;
}
console.log(`${"all".padEnd(9)} ${String(tn).padStart(5)}  ${pct(tc, tn).padStart(8)}  ${pct(tp, tn).padStart(9)}  ${String(tu).padStart(11)}`);
if (misses.length) console.log(`\nMisses:\n  ${misses.join("\n  ")}`);
