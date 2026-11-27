"use client";

import { useEffect } from "react";

/**
 * Fades `[data-reveal]` blocks in as they scroll into view (styles in globals.css). Progressive enhancement:
 * the server HTML shows everything, and nothing is hidden until this has run. Blocks already on screen are shown
 * at once (no flash); reduced motion and printing show everything. Mount once per page.
 */
export function RevealOnScroll() {
  useEffect(() => {
    const root = document.documentElement;
    const blocks = Array.from(
      document.querySelectorAll<HTMLElement>("[data-reveal]"),
    );
    const showAll = () =>
      blocks.forEach((el) => el.classList.add("is-revealed"));
    if (
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      !("IntersectionObserver" in window)
    ) {
      showAll();
      return;
    }
    // Anything already in view stays visible; only blocks below the fold wait for the reader.
    for (const el of blocks)
      if (el.getBoundingClientRect().top < window.innerHeight)
        el.classList.add("is-revealed");
    root.classList.add("reveal-ready");

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add("is-revealed");
          io.unobserve(e.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.1 },
    );
    blocks
      .filter((el) => !el.classList.contains("is-revealed"))
      .forEach((el) => io.observe(el));
    window.addEventListener("beforeprint", showAll);
    return () => {
      io.disconnect();
      window.removeEventListener("beforeprint", showAll);
      root.classList.remove("reveal-ready");
    };
  }, []);
  return null;
}
