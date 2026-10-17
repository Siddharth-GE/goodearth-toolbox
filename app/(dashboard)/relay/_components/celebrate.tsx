"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

/**
 * Relay's reward moments: a points float on every move, a banner and confetti on finish.
 * DESIGN.md's one-payoff rule is waived here (moving a baton IS the product); it stays in this tool.
 * All of it honours prefers-reduced-motion; the toast still shows.
 */

type Celebration = {
  toast: (message: string) => void;
  flow: (message: string) => void;
  banner: (message: string) => void;
};

const CelebrateContext = createContext<Celebration | null>(null);

export function useCelebrate(): Celebration {
  const ctx = useContext(CelebrateContext);
  // A no-op, not a throw: rendering outside the provider must not crash a page.
  return (
    ctx ?? {
      toast: () => {},
      flow: () => {},
      banner: () => {},
    }
  );
}

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

function confetti(count = 14) {
  if (prefersReducedMotion()) return;
  const colors = ["var(--accent)", "var(--warning)", "var(--info)", "var(--success)"];
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight * 0.55;

  for (let i = 0; i < count; i++) {
    const piece = document.createElement("div");
    piece.className = "pointer-events-none fixed z-[69] size-2 rounded-full";
    piece.style.left = `${cx}px`;
    piece.style.top = `${cy}px`;
    piece.style.background = colors[i % colors.length];
    piece.style.setProperty("--dx", `${Math.random() * 260 - 130}px`);
    piece.style.setProperty("--dy", `${-(Math.random() * 220 + 60)}px`);
    piece.style.setProperty("--rot", `${Math.random() * 540 - 270}deg`);
    piece.style.animation = "relay-confetti 1.1s ease-out forwards";
    document.body.appendChild(piece);
    setTimeout(() => piece.remove(), 1200);
  }
}

export function CelebrateProvider({ children }: { children: ReactNode }) {
  const [toastText, setToastText] = useState<string | null>(null);
  const [flowText, setFlowText] = useState<string | null>(null);
  const [bannerText, setBannerText] = useState<string | null>(null);

  // Keyed remounts so a new celebration restarts the animation.
  const [tick, setTick] = useState(0);

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const after = useCallback((ms: number, fn: () => void) => {
    timers.current.push(setTimeout(fn, ms));
  }, []);
  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  const value: Celebration = {
    toast: useCallback(
      (message) => {
        setTick((t) => t + 1);
        setToastText(message);
        after(2600, () => setToastText(null));
      },
      [after],
    ),
    flow: useCallback(
      (message) => {
        if (prefersReducedMotion()) return;
        setTick((t) => t + 1);
        setFlowText(message);
        confetti(12);
        after(1700, () => setFlowText(null));
      },
      [after],
    ),
    banner: useCallback(
      (message) => {
        if (prefersReducedMotion()) return;
        setTick((t) => t + 1);
        setBannerText(message);
        confetti(26);
        after(1900, () => setBannerText(null));
      },
      [after],
    ),
  };

  return (
    <CelebrateContext.Provider value={value}>
      {children}

      {toastText && (
        <div
          key={`toast-${tick}`}
          role="status"
          className="bg-foreground text-background fixed bottom-6 left-1/2 z-[60] max-w-[92vw] -translate-x-1/2 truncate rounded-full px-5 py-2.5 text-sm font-medium shadow-lg"
        >
          {toastText}
        </div>
      )}

      {flowText && (
        <div
          key={`flow-${tick}`}
          aria-hidden="true"
          className="border-warning/40 bg-warning/10 text-warning fixed bottom-20 left-1/2 z-[61] [animation:relay-float_1.6s_ease-out_forwards] rounded-full border px-4 py-1.5 font-mono text-xs font-semibold"
        >
          {flowText}
        </div>
      )}

      {bannerText && (
        <div
          key={`banner-${tick}`}
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-[70] flex items-center justify-center"
        >
          {/* Plain ease-out: the overshoot is already in the keyframes, and springy easing double-bounces. */}
          <div className="bg-surface-raised text-foreground [animation:relay-banner_1.9s_cubic-bezier(.22,1,.36,1)_forwards] rounded-3xl px-10 py-6 text-3xl font-extrabold tracking-tight shadow-2xl md:text-4xl">
            {bannerText}
          </div>
        </div>
      )}
    </CelebrateContext.Provider>
  );
}
