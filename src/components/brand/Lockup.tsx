import { LogoMark } from "./Logo";

/** A thin vertical Kenyan tricolour (black, red, green with white gaps), as in public-service mastheads. */
export function FlagRule({ className = "h-10" }: { className?: string }) {
  return (
    <span aria-hidden className={`flex w-[3px] shrink-0 flex-col gap-px ${className}`}>
      <span className="flex-1 rounded-t-sm bg-flag-black" />
      <span className="flex-1 bg-flag-red" />
      <span className="flex-1 rounded-b-sm bg-flag-green" />
    </span>
  );
}

/**
 * The signature masthead lockup: scales mark, "Mizani" with a descriptor, the tricolour rule, the Commission's name.
 * `tone="light"` on the navy band. `compact` drops the Commission name (phones, app bands).
 */
export function Lockup({
  tone = "dark",
  descriptor,
  org,
  compact = false,
}: {
  tone?: "dark" | "light";
  descriptor: string;
  org?: string;
  compact?: boolean;
}) {
  const light = tone === "light";
  return (
    <span className="flex items-center gap-3">
      <LogoMark tone={tone} className={compact ? "h-8 w-auto" : "h-10 w-auto"} />
      <span className="flex flex-col leading-tight">
        <span className={`text-xl font-bold ${light ? "text-white" : "text-primary"}`}>Mizani</span>
        <span className={`text-xs ${light ? "text-slate-300" : "text-slate-600"}`}>{descriptor}</span>
      </span>
      {org && !compact && (
        <>
          <FlagRule className="ml-1 hidden h-10 sm:flex" />
          <span className={`hidden max-w-[14rem] text-sm leading-tight font-medium sm:block ${light ? "text-white" : "text-slate-900"}`}>{org}</span>
        </>
      )}
    </span>
  );
}
