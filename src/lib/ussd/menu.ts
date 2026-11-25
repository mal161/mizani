import en from "../../../messages/en.json";
import sw from "../../../messages/sw.json";
import { parseCaseNumberInput } from "@/lib/cases/case-number";
import type { checkStatus } from "@/lib/cases/status-check";

type Lang = "en" | "sw";

const text = {
  en: {
    askCase: "Enter your case number (e.g. 2026000123):",
    badCase: "That case number is not valid. Please dial again.",
    askPin: "Enter your 6-digit PIN:",
    status: (n: string, s: string) => `Case ${n}\nStatus: ${s}`,
    invalid: "Case number and PIN do not match. Please check and try again.",
    locked: "Too many wrong attempts. Try again in 1 hour.",
  },
  sw: {
    askCase: "Weka nambari ya kesi (k.m. 2026000123):",
    badCase: "Nambari ya kesi si sahihi. Tafadhali piga tena.",
    askPin: "Weka PIN yako ya tarakimu 6:",
    status: (n: string, s: string) => `Kesi ${n}\nHali: ${s}`,
    invalid: "Nambari ya kesi na PIN hazilingani. Tafadhali angalia ujaribu tena.",
    locked: "Majaribio mengi yasiyo sahihi. Jaribu tena baada ya saa 1.",
  },
} as const;

const stageNames = { en: en.stages, sw: sw.stages } as const;

/**
 * Africa's Talking USSD state machine. `input` is the cumulative `text` field ("1*2026000123*123456").
 * Replies start with "CON " (expects more input) or "END " (closes the session).
 */
export async function ussdResponse(input: string, check: typeof checkStatus): Promise<string> {
  const parts = input === "" ? [] : input.split("*");

  if (parts.length === 0) {
    return "CON ACC Mizani\n1. English\n2. Kiswahili";
  }
  const lang: Lang | null = parts[0] === "1" ? "en" : parts[0] === "2" ? "sw" : null;
  if (!lang) return "END Invalid choice / Chaguo si sahihi.";
  const t = text[lang];

  if (parts.length === 1) return `CON ${t.askCase}`;

  const caseNumber = parseCaseNumberInput(parts[1]);
  if (!caseNumber) return `END ${t.badCase}`;
  if (parts.length === 2) return `CON ${t.askPin}`;

  const r = await check(caseNumber, parts[2].trim(), "ussd");
  if (r.ok) return `END ${t.status(caseNumber, stageNames[lang][r.stage])}`;
  return `END ${r.reason === "locked" ? t.locked : t.invalid}`;
}
