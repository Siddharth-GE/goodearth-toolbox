"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

/**
 * Pusher's reward moments: a points float on every move, a full-screen
 * banner and confetti when a trail is finished.
 *
 * DESIGN.md allows one payoff per flow and warns against motion added
 * "to make it feel nice". Pusher is the stated exception: moving a baton
 * IS the product, and the reward for moving it is how the tool gets
 * adopted at all. It stays confined to this tool.
 *
 * Everything here checks prefers-reduced-motion. The toast still appears
 * for someone who has asked for stillness — they should learn the push
 * worked, they just should not be shown fireworks about it.
 */

type Celebration = {
  /** A short line, always shown. */
  toast: (message: string) => void;
  /** "+10 FLOW · ON TIME" — floats up from the bottom. */
  flow: (message: string) => void;
  /** The big one, for finishing a trail. */
  banner: (message: string) => void;
};

const CelebrateContext = createContext<Celebration | null>(null);

export function useCelebrate(): Celebration {
  const ctx = useContext(CelebrateContext);
  // A no-op rather than a throw: a component that celebrates should not
  // be able to crash a page by being rendered outside the provider.
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
    piece.style.animation = "pusher-confetti 1.1s ease-out forwards";
    document.body.appendChild(piece);
    setTimeout(() => piece.remove(), 1200);
  }
}

export function CelebrateProvider({ children }: { children: ReactNode }) {
  const [toastText, setToastText] = useState<string | null>(null);
  const [flowText, setFlowText] = useState<string | null>(null);
  const [bannerText, setBannerText] = useState<string | null>(null);

  // Keyed remounts so a second celebration restarts the animation
  // instead of being swallowed by the first one still running.
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
          className="border-warning/40 bg-warning/10 text-warning fixed bottom-20 left-1/2 z-[61] [animation:pusher-float_1.6s_ease-out_forwards] rounded-full border px-4 py-1.5 font-mono text-xs font-semibold"
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
          {/* Smooth ease-out, not a back/overshoot curve: the overshoot
              is already in the keyframes (0.88 -> 1.03 -> 1.0), and a
              springy easing on top of it double-bounces. */}
          <div className="bg-surface-raised text-foreground [animation:pusher-banner_1.9s_cubic-bezier(.22,1,.36,1)_forwards] rounded-3xl px-10 py-6 text-3xl font-extrabold tracking-tight shadow-2xl md:text-4xl">
            {bannerText}
          </div>
        </div>
      )}
    </CelebrateContext.Provider>
  );
}
