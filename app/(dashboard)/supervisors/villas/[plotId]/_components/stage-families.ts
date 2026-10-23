import type { StageView } from "@/lib/supervisors/programme-queries";

export type StageFamily = {
  name: string;
  stages: StageView[];
  done: number;
  /** A stage in it is being worked or waiting. */
  inHand: boolean;
};

/** The villa's stages by work category (Foundation, Superstructure…), in the works list's order of categories. */
export function stageFamilies(stages: StageView[]): StageFamily[] {
  const byName = new Map<string, { rank: number; stages: StageView[] }>();
  for (const stage of stages) {
    const family = byName.get(stage.categoryName);
    if (family) family.stages.push(stage);
    else
      byName.set(stage.categoryName, { rank: Math.floor(stage.order / 10_000), stages: [stage] });
  }
  return [...byName.entries()]
    .sort(([, a], [, b]) => a.rank - b.rank)
    .map(([name, family]) => ({
      name,
      stages: family.stages,
      done: family.stages.filter((stage) => stage.status === "done").length,
      inHand: family.stages.some(
        (stage) => stage.status === "working" || stage.status === "waiting",
      ),
    }));
}
