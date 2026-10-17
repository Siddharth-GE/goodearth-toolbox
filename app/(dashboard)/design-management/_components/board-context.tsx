"use client";

import { UndoBarProvider } from "@/components/ui/undo-bar";
import type { BoardStage } from "@/lib/design-management/board";
import type { Person, VillaRef } from "@/lib/design-management/board-queries";
import { createContext, useContext, type ReactNode } from "react";

/**
 * What every card, menu and composer on a design board screen shares —
 * today, the team, the villas, the board's stages — handed down once
 * rather than repeated on every card (Client Relations' BoardProvider,
 * its own copy), with the shared Undo bar under it.
 */
export type DesignBoard = {
  today: string;
  team: Person[];
  villas: VillaRef[];
  stages: BoardStage[];
  /** Open actions per person, for the owner menu. */
  openByOwner: Record<string, number>;
  meId: string;
  /** An admin: closes any action. */
  isManager: boolean;
};

const DesignBoardContext = createContext<DesignBoard | null>(null);

export function DesignBoardProvider({ children, ...board }: DesignBoard & { children: ReactNode }) {
  return (
    <DesignBoardContext.Provider value={board}>
      <UndoBarProvider>{children}</UndoBarProvider>
    </DesignBoardContext.Provider>
  );
}

export function useDesignBoard(): DesignBoard {
  const board = useContext(DesignBoardContext);
  if (!board) throw new Error("A design board card needs a DesignBoardProvider above it.");
  return board;
}
