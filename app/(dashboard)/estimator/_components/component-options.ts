import type { SearchOption } from "@/components/ui/search-select";
import { formatMoney } from "@/lib/format";

/** A mix or an items-master material as SearchSelect options; values keep the "mix:<id>" / "material:<id>" shape the recipe actions parse. Mixes come first. */
export function componentOptions(
  materials: { id: string; name: string; uom: string; rate?: number | null }[],
  mixes: { id: string; name: string; uom: string }[],
): SearchOption[] {
  return [
    ...mixes.map((mix) => ({
      value: `mix:${mix.id}`,
      label: mix.name,
      hint: `mix · per ${mix.uom}`,
      group: "Mixes",
    })),
    ...materials.map((material) => ({
      value: `material:${material.id}`,
      label: material.name,
      hint:
        material.rate === undefined
          ? material.uom
          : material.rate === null
            ? `${material.uom} · not priced`
            : `${formatMoney(material.rate)} / ${material.uom}`,
      group: "Materials",
    })),
  ];
}

export function chosenUom(
  choice: string,
  materials: { id: string; uom: string }[],
  mixes: { id: string; uom: string }[],
): string | undefined {
  const [kind, refId] = choice.split(":");
  return kind === "material"
    ? materials.find((material) => material.id === refId)?.uom
    : mixes.find((mix) => mix.id === refId)?.uom;
}
