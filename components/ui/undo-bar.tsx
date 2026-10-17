"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

/** The line at the foot of the screen after an everyday change, with Undo for five seconds, instead of an "are you sure" before it. */
type Shown = { id: number; message: string; undo?: () => void };
type Show = (message: string, undo?: () => void) => void;

const UndoBarContext = createContext<Show>(() => {});

export function UndoBarProvider({ children }: { children: ReactNode }) {
  const [shown, setShown] = useState<Shown | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const show = useCallback<Show>((message, undo) => {
    window.clearTimeout(timer.current);
    const id = Date.now();
    setShown({ id, message, undo });
    timer.current = window.setTimeout(
      () => setShown((current) => (current?.id === id ? null : current)),
      undo ? 5000 : 2600,
    );
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <UndoBarContext.Provider value={show}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(1.25rem+env(safe-area-inset-bottom))] z-50 flex justify-center px-4"
      >
        {shown ? (
          <div
            key={shown.id}
            className="bg-foreground text-background shadow-float animate-pop-in pointer-events-auto flex max-w-full items-center gap-4 rounded-xl py-2.5 pr-3 pl-4 text-sm"
          >
            <span>{shown.message}</span>
            {shown.undo ? (
              <button
                type="button"
                onClick={() => {
                  shown.undo?.();
                  setShown(null);
                }}
                className="focus-visible:ring-background/40 shrink-0 rounded-md px-1 font-semibold underline underline-offset-4 focus-visible:ring-2 focus-visible:outline-none"
              >
                Undo
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </UndoBarContext.Provider>
  );
}

export function useUndoBar(): Show {
  return useContext(UndoBarContext);
}
