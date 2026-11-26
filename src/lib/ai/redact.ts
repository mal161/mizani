/**
 * Removes personal data from free text before it is sent to any AI provider.
 * Pure and deterministic; the original text never leaves the server.
 */

export type RedactionKind = "phone" | "email" | "national_id" | "kra_pin" | "passport" | "party_name";

export interface KnownParty {
  name: string;
  placeholder: string;
}

export interface Redacted {
  text: string;
  counts: Record<RedactionKind, number>;
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// +254 / 254 / 0, then 7xx or 1xx, then 6 digits, with optional spaces or dashes between groups.
const PHONE = /(?<![\d+])(?:\+?254|0)[\s-]?[17]\d{2}[\s-]?\d{3}[\s-]?\d{3}(?!\d)/g;
const KRA_PIN = /\b[AP]\d{9}[A-Z]\b/gi;
const PASSPORT = /(passport[^\n]{0,20}?)\b([A-Z]{1,2}\d{6,8})\b/gi;
// Standalone 7–8 digit numbers, except money amounts written with KES/Ksh/Sh.
const NATIONAL_ID = /(?<!(?:KES|KSH|Ksh|Sh|shs?)\.?\s?)(?<![\d,.])\b\d{7,8}\b(?![\d,])/g;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function redact(text: string, parties: KnownParty[]): Redacted {
  const counts: Record<RedactionKind, number> = {
    phone: 0,
    email: 0,
    national_id: 0,
    kra_pin: 0,
    passport: 0,
    party_name: 0,
  };
  if (!text) return { text: "", counts };

  const count = (kind: RedactionKind, placeholder: string) => () => {
    counts[kind]++;
    return placeholder;
  };

  let out = text.replace(EMAIL, count("email", "[EMAIL]"));
  out = out.replace(PHONE, count("phone", "[PHONE]"));
  out = out.replace(KRA_PIN, count("kra_pin", "[KRA_PIN]"));
  out = out.replace(PASSPORT, (_m, lead: string) => {
    counts.passport++;
    return `${lead}[PASSPORT]`;
  });
  out = out.replace(NATIONAL_ID, count("national_id", "[ID_NUMBER]"));

  // Party names: full names first, then each part of at least 3 letters; longest first; whole words only.
  const terms: { term: string; placeholder: string }[] = [];
  for (const p of parties) {
    const name = p.name.trim().replace(/\s+/g, " ");
    if (!name) continue;
    terms.push({ term: name, placeholder: p.placeholder });
    for (const part of name.split(" ")) {
      if (part.replace(/[^\p{L}]/gu, "").length >= 3) terms.push({ term: part, placeholder: p.placeholder });
    }
  }
  terms.sort((a, b) => b.term.length - a.term.length);
  for (const { term, placeholder } of terms) {
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(term)}(?![\\p{L}\\p{N}])`, "giu");
    out = out.replace(re, count("party_name", placeholder));
  }
  // "[X] [X]" (a first and last name replaced separately) reads as one person.
  out = out.replace(/(\[[A-Z_]+\])(?:\s+\1)+/g, "$1");
  return { text: out, counts };
}
