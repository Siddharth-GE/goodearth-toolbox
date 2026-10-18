"use client";

import { UndoBarProvider } from "@/components/ui/undo-bar";
import type { Person, PlotRef } from "@/lib/client-relations/next-steps-queries";
import { createContext, useContext, type ReactNode } from "react";

/** What every card and composer on a screen shares, handed down once; the Undo bar rides along. */
export type Board = {
  today: string;
  team: Person[];
  plots: PlotRef[];
  /** Open actions per person, for the owner menu — shown only when `seesAll`. */
  openByOwner: Record<string, number>;
  meId: string;
  isManager: boolean;
  /** An admin or a team lead (0122). Anyone else sees only their own work, so a colleague's count would be wrong and is not shown. */
  seesAll: boolean;
};

const BoardContext = createContext<Board | null>(null);

export function BoardProvider({ children, ...board }: Board & { children: ReactNode }) {
  return (
    <BoardContext.Provider value={board}>
      <UndoBarProvider>{children}</UndoBarProvider>
    </BoardContext.Provider>
  );
}

export function useBoard(): Board {
  const board = useContext(BoardContext);
  if (!board) throw new Error("An action card needs a BoardProvider above it.");
  return board;
}
