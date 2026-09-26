import type { SearchOption } from "@/components/ui/search-select";
import { formatMoney } from "@/lib/format";

/**
 * What a recipe can hold — a mix or a material from the items master —
 * as SearchSelect options. The value keeps the "mix:<id>" /
 * "material:<id>" shape the recipe actions have always parsed. Mixes come
 * first: there are a handful of them and they are what a work usually
 * consumes.
 */
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

/** The unit of whatever is chosen, for the "how many X per Y" hint. */
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
