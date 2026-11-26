/**
 * Monthly totals as columns (one series, one colour). Only the highest and the latest month carry value labels;
 * every column has a hover title and the table under the chart carries all values.
 */
export function MonthlyColumns({ months, label }: { months: { month: string; label: string; value: number }[]; label: string }) {
  const W = 640;
  const H = 180;
  const top = 18;
  const bottom = 22;
  const max = Math.max(1, ...months.map((m) => m.value));
  const slot = W / Math.max(1, months.length);
  const bar = Math.min(36, slot - 6);
  const peak = months.reduce((best, m, i) => (m.value > (months[best]?.value ?? -1) ? i : best), 0);
  const last = months.length - 1;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="h-auto w-full max-w-3xl">
      <line x1={0} x2={W} y1={H - bottom} y2={H - bottom} stroke="#cbd5e1" strokeWidth={1} />
      {months.map((m, i) => {
        const h = ((H - top - bottom) * m.value) / max;
        const x = i * slot + (slot - bar) / 2;
        const y = H - bottom - h;
        return (
          <g key={m.month}>
            <title>{`${m.label}: ${m.value}`}</title>
            {/* Hit target taller and wider than the mark. */}
            <rect x={i * slot} y={top} width={slot} height={H - top - bottom} fill="transparent" />
            {m.value > 0 &&
              (h >= 4 ? (
                <path d={`M${x},${H - bottom} v${-(h - 3)} q0,-3 3,-3 h${bar - 6} q3,0 3,3 v${h - 3} z`} fill="#065f46" />
              ) : (
                <rect x={x} y={y} width={bar} height={h} fill="#065f46" />
              ))}
            {(i === peak || i === last) && m.value > 0 && (
              <text x={x + bar / 2} y={y - 4} textAnchor="middle" fontSize={11} fill="#1e293b">
                {m.value}
              </text>
            )}
            <text x={i * slot + slot / 2} y={H - 6} textAnchor="middle" fontSize={10} fill="#64748b">
              {m.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
