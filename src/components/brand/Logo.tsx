/**
 * The Mizani logo: level scales (impartiality) with the Advocate and the Complainant on either pan.
 * Brand colours: navy #1B2A4A (swapped to #E8ECF4 on dark backgrounds) and orange #E07A1F.
 */
type Tone = "dark" | "light";
const ink = (tone: Tone) => (tone === "light" ? "#E8ECF4" : "#1B2A4A");
const ORANGE = "#E07A1F";

function Scales({ tone, weight = 1 }: { tone: Tone; weight?: number }) {
  const navy = ink(tone);
  const w = (n: number) => n * weight;
  return (
    <>
      <g fill="none" strokeLinecap="round">
        <line x1="340" y1="60" x2="340" y2="230" stroke={navy} strokeWidth={w(6)} />
        <line x1="190" y1="85" x2="490" y2="85" stroke={navy} strokeWidth={w(6)} />
        <line x1="190" y1="85" x2="150" y2="160" stroke={ORANGE} strokeWidth={w(2.5)} />
        <line x1="190" y1="85" x2="230" y2="160" stroke={ORANGE} strokeWidth={w(2.5)} />
        <line x1="490" y1="85" x2="450" y2="160" stroke={ORANGE} strokeWidth={w(2.5)} />
        <line x1="490" y1="85" x2="530" y2="160" stroke={ORANGE} strokeWidth={w(2.5)} />
        <path d="M140 160 Q190 195 240 160" stroke={ORANGE} strokeWidth={w(5)} />
        <path d="M440 160 Q490 195 540 160" stroke={ORANGE} strokeWidth={w(5)} />
        <line x1="295" y1="230" x2="385" y2="230" stroke={navy} strokeWidth={w(6)} />
      </g>
      <circle cx="340" cy="56" r={w(8)} fill={ORANGE} />
    </>
  );
}

/** Full logo with pan labels, name and tagline: home page, sign-in pages, letters. */
export function Logo({
  tone = "dark",
  className,
  labels,
  textScale = 1,
}: {
  tone?: Tone;
  className?: string;
  labels: { advocate: string; complainant: string; tagline: string };
  /** Optical sizing: enlarge the words (not the scales) when the logo renders small, e.g. 1.6 at ~300px wide. */
  textScale?: number;
}) {
  const navy = ink(tone);
  const k = textScale;
  const nameY = 285 + (k - 1) * 10;
  const tagY = 315 + (k - 1) * 30;
  return (
    <svg viewBox={`0 0 680 ${Math.ceil(tagY + 15)}`} role="img" aria-label={`Mizani — ${labels.tagline}`} className={className}>
      <Scales tone={tone} />
      <text x="190" y="215" textAnchor="middle" fontSize={16 * k} fontWeight="500" fill={navy}>
        {labels.advocate}
      </text>
      <text x="490" y="215" textAnchor="middle" fontSize={16 * k} fontWeight="500" fill={navy}>
        {labels.complainant}
      </text>
      <text x="340" y={nameY} textAnchor="middle" fontSize={34 * k} fontWeight="500" fill={navy}>
        Mizani
      </text>
      <text x="340" y={tagY} textAnchor="middle" fontSize={13 * k} fill={tone === "light" ? "#BCC4D3" : "#5E6A82"}>
        {labels.tagline}
      </text>
    </svg>
  );
}

/** Scales only: headers, favicon, small badges (strokes 2.2x so they hold up at 32-40px). */
export function LogoMark({ tone = "dark", className }: { tone?: Tone; className?: string }) {
  return (
    <svg viewBox="120 30 440 215" aria-hidden className={className}>
      <Scales tone={tone} weight={2.2} />
    </svg>
  );
}
