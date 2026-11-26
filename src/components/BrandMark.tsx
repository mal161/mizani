/** Mizani means "balance": a flat balance-scale glyph in the accent, next to the wordmark. */
export function BrandMark({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v18M7 21h10M5 7h14M12 5l-7 2m7-2l7 2" />
      <path d="M5 7l-3 7a3 3 0 0 0 6 0L5 7zM19 7l-3 7a3 3 0 0 0 6 0l-3-7z" />
    </svg>
  );
}
