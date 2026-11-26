export type PeriodKey = "30d" | "90d" | "365d" | "custom";

export interface Period {
  key: PeriodKey;
  /** Inclusive start (Nairobi midnight). */
  from: Date;
  /** Exclusive end (Nairobi midnight after toDay). */
  to: Date;
  /** Inclusive Nairobi days, YYYY-MM-DD, for display and date inputs. */
  fromDay: string;
  toDay: string;
}

const DAY = 86_400_000;
const EAT = 3 * 3600_000;
const PRESETS: Record<Exclude<PeriodKey, "custom">, number> = { "30d": 30, "90d": 90, "365d": 365 };
const MAX_SPAN = 3 * 366 * DAY;

const nairobiDay = (d: Date) => new Date(d.getTime() + EAT).toISOString().slice(0, 10);
const nairobiMidnight = (day: string) => new Date(`${day}T00:00:00+03:00`);

function isDay(s: string | undefined): s is string {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Reads the dashboard's period from query parameters; anything invalid falls back to the last 90 days. */
export function parsePeriod(q: { period?: string; from?: string; to?: string }, now: Date = new Date()): Period {
  if (q.period === "custom" && isDay(q.from) && isDay(q.to)) {
    const from = nairobiMidnight(q.from);
    const to = new Date(nairobiMidnight(q.to).getTime() + DAY);
    if (from < to && to.getTime() - from.getTime() <= MAX_SPAN) return { key: "custom", from, to, fromDay: q.from, toDay: q.to };
  }
  // Own keys only: "toString" or "__proto__" must not be read off the object prototype.
  const key = q.period && Object.hasOwn(PRESETS, q.period) ? (q.period as Exclude<PeriodKey, "custom">) : "90d";
  const toDay = nairobiDay(now);
  const to = new Date(nairobiMidnight(toDay).getTime() + DAY);
  const from = new Date(to.getTime() - PRESETS[key] * DAY);
  return { key, from, to, fromDay: nairobiDay(from), toDay };
}

export function periodQuery(p: Period): string {
  return p.key === "custom" ? `period=custom&from=${p.fromDay}&to=${p.toDay}` : `period=${p.key}`;
}
