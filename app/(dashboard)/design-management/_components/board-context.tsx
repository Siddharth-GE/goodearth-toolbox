"use client";

import { UndoBarProvider } from "@/components/ui/undo-bar";
import type { BoardStage } from "@/lib/design-management/board";
import type { Person, VillaRef } from "@/lib/design-management/board-queries";
import { createContext, useContext, type ReactNode } from "react";

export type DesignBoard = {
  today: string;
  team: Person[];
  villas: VillaRef[];
  stages: BoardStage[];
  openByOwner: Record<string, number>;
  meId: string;
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
