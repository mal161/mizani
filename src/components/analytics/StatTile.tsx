/** A headline number with its label and an optional supporting line. */
export function StatTile({ label, value, sub, testId }: { label: string; value: string; sub?: string; testId?: string }) {
  return (
    <div data-testid={testId} className="flex flex-col gap-1 rounded-lg border bg-white p-4">
      <span className="text-sm text-slate-600">{label}</span>
      <span className="text-2xl font-medium tabular-nums text-slate-900">{value}</span>
      {sub && <span className="text-xs text-slate-500">{sub}</span>}
    </div>
  );
}
