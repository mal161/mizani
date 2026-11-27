/**
 * A water surface behind a story illustration, as if the document had just been set down on it: soft raised crests
 * (light) and troughs (shade) travelling outward and dying away towards the edge. Pure CSS (globals.css
 * `.ripple-water`), decorative only. `offset` shifts each row's phase so neighbouring ripples are not in step.
 * Reduced motion: the same surface, still.
 */
export function Ripple({ offset = 0 }: { offset?: number }) {
  return (
    <div
      data-ripple
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10 flex items-center justify-center"
    >
      <div
        className="ripple-water aspect-square w-[min(165%,48rem)]"
        style={{ animationDelay: `${-offset * 1.7}s` }}
      />
    </div>
  );
}
