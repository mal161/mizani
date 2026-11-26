const PATH = ["received", "screening", "advocate_notified", "investigation", "hearing", "decision", "closed"] as const;

/**
 * Where the case is, from filing to closure. Conciliation is optional, so it appears only when the case is in it.
 * Past stages are filled, the current one is ringed and named, later ones stay quiet. Horizontal from the sm
 * breakpoint unless `vertical`. Pure markup: labels come in from the caller (admin-renamed stages included).
 */
export function StageTrack({
  current,
  label,
  nowLabel,
  title,
  vertical = false,
}: {
  /** null = overview of the whole process (no current step). */
  current: string | null;
  label: (stage: string) => string;
  nowLabel: string;
  title: string;
  vertical?: boolean;
}) {
  const overview = current === null;
  const path: string[] = current === "conciliation" ? [...PATH.slice(0, 4), "conciliation", ...PATH.slice(4)] : [...PATH];
  const at = overview ? path.length : Math.max(0, path.indexOf(current ?? ""));
  const row = !vertical;
  return (
    <ol className={`grid ${row ? "gap-y-3 sm:grid-flow-col sm:auto-cols-fr" : "gap-y-3"}`} aria-label={title}>
      {path.map((s, i) => {
        const state = i < at ? "done" : i === at ? "now" : "next";
        const line = overview || i < at ? "bg-primary" : "bg-slate-200";
        return (
          <li
            key={s}
            aria-current={state === "now" ? "step" : undefined}
            className={`relative flex items-center gap-3 ${row ? "sm:flex-col sm:items-start sm:gap-2" : ""}`}
          >
            {i < path.length - 1 &&
              (row ? (
                <>
                  {/* stacked on phones: vertical line; side by side from sm: horizontal line */}
                  <span aria-hidden className={`absolute top-4 left-2 h-[calc(100%-4px)] w-px sm:hidden ${line}`} />
                  <span aria-hidden className={`absolute top-2 left-4 hidden h-px w-[calc(100%-8px)] sm:block ${line}`} />
                </>
              ) : (
                <span aria-hidden className={`absolute top-4 left-2 h-[calc(100%-4px)] w-px ${line}`} />
              ))}
            <span
              aria-hidden
              className={`relative z-10 inline-block h-4 w-4 shrink-0 rounded-full border-2 ${
                state === "done"
                  ? "border-primary bg-primary"
                  : state === "now"
                    ? "border-accent bg-white ring-4 ring-accent-soft"
                    : "border-slate-300 bg-white"
              }`}
            />
            <span className={`text-sm leading-5 ${state === "now" ? "font-medium text-slate-900" : state === "done" ? (overview ? "text-slate-900" : "text-slate-600") : "text-slate-500"}`}>
              {label(s)}
              {state === "now" && <span className={`ml-2 text-xs text-accent-ink ${row ? "sm:ml-0 sm:block" : ""}`}>{nowLabel}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
