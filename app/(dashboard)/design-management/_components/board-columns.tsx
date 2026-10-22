import type { BoardStage } from "@/lib/design-management/board";
import type { VillaCard } from "@/lib/design-management/board-queries";

import { SectionHead } from "./board-parts";
import { LotCard } from "./lot-card";

/** One column per board stage, each wide enough for a card; a wide screen scrolls the board sideways rather than squeeze eight stages. On a phone they stack. */
export function BoardColumns({
  stages,
  cards,
  today,
}: {
  stages: BoardStage[];
  cards: VillaCard[];
  today: string;
}) {
  return (
    <div className="space-y-2 lg:grid lg:auto-cols-[minmax(14rem,1fr)] lg:grid-flow-col lg:gap-3 lg:space-y-0 lg:overflow-x-auto lg:pb-2">
      {stages.map((stage, index) => {
        const here = cards.filter((card) => card.place.index === index);
        return (
          <section
            key={stage.id}
            aria-label={stage.name}
            className="lg:bg-foreground/[0.025] min-w-0 lg:rounded-2xl lg:p-2"
          >
            <SectionHead title={stage.name} count={here.length} />
            {here.length === 0 ? (
              <p className="text-muted px-0.5 pb-2 text-xs">No villa here.</p>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(15.5rem,1fr))] gap-3 lg:flex lg:flex-col lg:gap-2">
                {here.map((card) => (
                  <LotCard key={card.unitId} card={card} today={today} />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
