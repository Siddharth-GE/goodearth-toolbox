"use client";

import type { Person, PlotRef } from "@/lib/client-relations/next-steps-queries";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

/**
 * What every action card and composer on a screen shares — today, the
 * team, the plots — handed down once rather than repeated on every card,
 * and the Undo bar the tracker's flow leans on: tick an action and it
 * goes, with five seconds to take it back (root plan.md, seventh piece).
 *
 * The bar is Client Relations' own. Relay's celebrate.tsx holds the first
 * copy of a toast; a third tool needing one is when it moves to
 * components/ui (DESIGN.md: "build the third copy into a shared component").
 */
export type Board = {
  today: string;
  team: Person[];
  plots: PlotRef[];
  /** Open actions per person, for the owner menu — shown only when `seesAll`. */
  openByOwner: Record<string, number>;
  meId: string;
  /** An admin: closes any action (0121). */
  isManager: boolean;
  /**
   * An admin or a team lead (0122): sees everyone's work. Anyone else sees
   * only their own, so a colleague's count would be a count of what this
   * viewer can see — a wrong number that looks right — and is not shown.
   */
  seesAll: boolean;
};

const BoardContext = createContext<Board | null>(null);

type Toast = { id: number; message: string; undo?: () => void };
type Show = (message: string, undo?: () => void) => void;

const ToastContext = createContext<Show>(() => {});

export function BoardProvider({ children, ...board }: Board & { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const show = useCallback<Show>((message, undo) => {
    window.clearTimeout(timer.current);
    const id = Date.now();
    setToast({ id, message, undo });
    timer.current = window.setTimeout(
      () => setToast((current) => (current?.id === id ? null : current)),
      undo ? 5000 : 2600,
    );
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <BoardContext.Provider value={board}>
      <ToastContext.Provider value={show}>
        {children}
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed inset-x-0 bottom-[calc(1.25rem+env(safe-area-inset-bottom))] z-50 flex justify-center px-4"
        >
          {toast ? (
            <div
              key={toast.id}
              className="bg-foreground text-background shadow-float animate-pop-in pointer-events-auto flex max-w-full items-center gap-4 rounded-xl py-2.5 pr-3 pl-4 text-sm"
            >
              <span>{toast.message}</span>
              {toast.undo ? (
                <button
                  type="button"
                  className="focus-visible:ring-background/40 shrink-0 rounded-md px-1 font-semibold underline underline-offset-4 focus-visible:ring-2 focus-visible:outline-none"
                  onClick={() => {
                    toast.undo?.();
                    setToast(null);
                  }}
                >
                  Undo
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </ToastContext.Provider>
    </BoardContext.Provider>
  );
}

export function useBoard(): Board {
  const board = useContext(BoardContext);
  if (!board) throw new Error("An action card needs a BoardProvider above it.");
  return board;
}

/** Show a line at the foot of the screen, with Undo when one is given. */
export function useToast(): Show {
  return useContext(ToastContext);
}
