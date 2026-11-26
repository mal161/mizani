/**
 * Removes personal data from free text before it is sent to any AI provider.
 * Pure and deterministic; the original text never leaves the server.
 *
 * Limits (documented for the DPIA): only the parties' names and identifiers on file are removed by name;
 * other people mentioned in free text (witnesses, relatives) are not detected.
 */

export type RedactionKind = "phone" | "email" | "national_id" | "kra_pin" | "passport" | "party_name";

export interface KnownParty {
  name: string;
  placeholder: string;
}

/** Identifiers already on file (profile phone, roll phone/email), matched in any layout. */
export interface KnownIdentifiers {
  phones?: string[];
  emails?: string[];
}

export interface Redacted {
  text: string;
  counts: Record<RedactionKind, number>;
}

const APOS = "['’‘`ʼ]";
const MONEY_BEFORE = "(?<!(?:KES|KSHS?|SHS?)\\.?\\s?)";

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// "jane [at] gmail [dot] com", "jo(at)mail.co.ke"
const EMAIL_OBFUSCATED = /[\w.+-]+\s*[[(]\s*at\s*[\])]\s*[\w-]+(?:\s*(?:\.|[[(]\s*dot\s*[\])])\s*[\w-]+)+/gi;
// +254 / 254 / 0, then 7xx or 1xx, then 6 digits; single spaces, dashes, dots or brackets between digits.
const PHONE = /(?<![\d+])\(?(?:\+?254|0)[\s\-.]?[17]\d{2}\)?(?:[\s\-.]?\d){6}(?!\d)/g;
// Bare 9-digit mobile number written without the leading 0 (e.g. 712345678).
const BARE_PHONE = new RegExp(`${MONEY_BEFORE}(?<![\\d,.+])\\b[17]\\d{8}\\b(?![,.]?\\d)`, "gi");
const KRA_PIN = /\b[AP]\d{9}[A-Z]\b/gi;
const PASSPORT = /(passport[^\n]{0,20}?)\b([A-Z]{1,2}\d{6,8})\b/gi;
// "ID12345678", "ID No. 1234 5678", "id number: 2345-6789"
const ID_WITH_LABEL = /\b(I\.?D\.?(?:\s*(?:No\.?|number|#))?\s*[:#]?\s*)(\d(?:[\s-]?\d){6,7})(?!\d)/gi;
// Standalone 7–8 digit numbers, except money (KES/Ksh/Shs) and digit groups like 1,250,000.
const NATIONAL_ID = new RegExp(`${MONEY_BEFORE}(?<!\\d[,.])(?<![\\dA-Za-z])\\d{7,8}(?![,.]\\d)(?![\\dA-Za-z])`, "gi");

// Words that may appear in a name or firm name but must not be treated as a name on their own.
const STOP = new Set([
  "and", "the", "of", "na", "ya", "wa", "la", "mr", "mrs", "ms", "dr", "prof", "hon", "adv",
  "advocate", "advocates", "associates", "assoc", "company", "co", "llp", "ltd", "law", "chambers",
  "partners", "firm", "wakili", "bin", "binti", "kampuni",
]);

// Firm words a name phrase may legitimately end with ("Kamau and Associates").
const FIRM_SUFFIX = new Set(["advocates", "associates", "assoc", "company", "co", "llp", "ltd", "law", "chambers", "partners", "firm"]);

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Lower-case, drop apostrophes, treat hyphens as spaces, strip other punctuation. */
function normaliseName(s: string): string {
  return s
    .replace(new RegExp(APOS, "g"), "")
    .replace(/[-–—]/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Regex for a normalised term that tolerates apostrophes between letters and hyphens/spaces between words. */
function nameRegex(term: string): RegExp {
  const body = [...term]
    .map((ch) => (ch === " " ? "[\\s\\-–—]+" : `${escapeRegExp(ch)}${APOS}?`))
    .join("");
  return new RegExp(`(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`, "giu");
}

/** Digits of a phone on file → regex matching it with any separators and an optional 0/254 prefix. */
function knownPhoneRegex(phone: string): RegExp | null {
  const nine = phone.replace(/\D/g, "").slice(-9);
  if (nine.length !== 9) return null;
  const sep = "[\\s\\-.()]*";
  return new RegExp(`(?<!\\d)\\(?(?:\\+?2${sep}5${sep}4|0)?${sep}${[...nine].join(sep)}(?!\\d)`, "g");
}

function nameTerms(parties: KnownParty[]): { term: string; placeholder: string }[] {
  const terms: { term: string; placeholder: string }[] = [];
  for (const p of parties) {
    const words = normaliseName(p.name).split(" ").filter(Boolean);
    if (!words.length) continue;
    // Full name, then the name with trailing stop/firm words dropped one by one
    // ("Kamau and Associates Advocates" → "Kamau and Associates" → "Kamau"). A phrase may end in a firm word,
    // never in a plain word like "and", and must contain at least one real name word.
    const hasName = (ws: string[]) => ws.some((w) => !STOP.has(w.toLowerCase()));
    for (let end = words.length; end > 0; end--) {
      if (end < words.length && !STOP.has(words[end].toLowerCase())) break;
      const phrase = words.slice(0, end);
      const last = phrase[phrase.length - 1].toLowerCase();
      if (hasName(phrase) && (!STOP.has(last) || FIRM_SUFFIX.has(last))) {
        terms.push({ term: phrase.join(" "), placeholder: p.placeholder });
      }
    }
    for (const w of words) {
      if (w.length >= 3 && !STOP.has(w.toLowerCase())) terms.push({ term: w, placeholder: p.placeholder });
    }
  }
  return terms.sort((a, b) => b.term.length - a.term.length);
}

export function redact(text: string, parties: KnownParty[], known: KnownIdentifiers = {}): Redacted {
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

  let out = text;
  for (const e of known.emails ?? []) {
    if (e.trim()) out = out.replace(new RegExp(escapeRegExp(e.trim()), "gi"), count("email", "[EMAIL]"));
  }
  out = out.replace(EMAIL, count("email", "[EMAIL]"));
  out = out.replace(EMAIL_OBFUSCATED, count("email", "[EMAIL]"));
  for (const p of known.phones ?? []) {
    const re = knownPhoneRegex(p);
    if (re) out = out.replace(re, count("phone", "[PHONE]"));
  }
  out = out.replace(PHONE, count("phone", "[PHONE]"));
  out = out.replace(BARE_PHONE, count("phone", "[PHONE]"));
  out = out.replace(KRA_PIN, count("kra_pin", "[KRA_PIN]"));
  out = out.replace(PASSPORT, (_m, lead: string) => {
    counts.passport++;
    return `${lead}[PASSPORT]`;
  });
  out = out.replace(ID_WITH_LABEL, (_m, lead: string) => {
    counts.national_id++;
    return `${lead}[ID_NUMBER]`;
  });
  out = out.replace(NATIONAL_ID, count("national_id", "[ID_NUMBER]"));

  for (const { term, placeholder } of nameTerms(parties)) {
    out = out.replace(nameRegex(term), count("party_name", placeholder));
  }
  // "[X] [X]" (a first and last name replaced separately) reads as one person.
  out = out.replace(/(\[[A-Z_]+\])(?:[\s\-–—]+\1)+/g, "$1");
  return { text: out, counts };
}
