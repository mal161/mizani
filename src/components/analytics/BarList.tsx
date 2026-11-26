export interface BarItem {
  label: string;
  value: number | null;
  /** Short text after the value (e.g. a badge). */
  note?: string;
}

/**
 * Horizontal bars for one measure, scaled to the largest value. Labels and values are text (never colour alone);
 * a missing value shows "—" with no bar. Each row carries a title for hover.
 */
export function BarList({ items, unit, label, format }: { items: BarItem[]; unit: string; label: string; format: (v: number) => string }) {
  const max = Math.max(0, ...items.map((i) => i.value ?? 0));
  return (
    <ul role="img" aria-label={label} className="flex flex-col gap-2">
      {items.map((i) => {
        const shown = i.value === null ? "—" : `${format(i.value)} ${unit}`.trim();
        const pct = i.value && max > 0 ? Math.max(2, (i.value / max) * 100) : 0;
        return (
          <li key={i.label} title={`${i.label}: ${shown}`} className="grid grid-cols-[minmax(8rem,12rem)_1fr] items-center gap-3 text-sm">
            <span className="truncate text-slate-700">{i.label}</span>
            <span className="flex items-center gap-2">
              <span className="h-3 flex-1 rounded-sm bg-slate-100">
                <span className="block h-3 rounded-r bg-emerald-800" style={{ width: `${pct}%` }} />
              </span>
              <span className="w-24 shrink-0 tabular-nums text-slate-800">{shown}</span>
              {i.note && <span className="rounded bg-amber-100 px-1.5 text-xs font-medium text-amber-900">{i.note}</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
