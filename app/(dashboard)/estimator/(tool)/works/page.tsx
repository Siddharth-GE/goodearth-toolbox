import { EmptyState } from "@/components/ui/empty-state";
import { Figure, FigureBand, FigureBandCell } from "@/components/ui/figure";
import { LinkButton } from "@/components/ui/button";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { rateBuildUp, type MaterialDef, type MixDef } from "@/lib/estimator/calc";
import { getRecipeBook } from "@/lib/estimator/estimate-queries";
import { filterRateBook, RATE_BOOK_SHOWS, rateBookParams } from "@/lib/estimator/rate-book-list";
import { countLinesByWork, listWorkStatus } from "@/lib/estimator/works-queries";
import { formatCount } from "@/lib/format";
import { Hammer } from "lucide-react";
import { RateBookList, type RateBookRow } from "./_components/rate-book-list";

/** The rate book: what one unit of every work costs at Masters' prices. Every villa estimate starts from it.
 * The list worth working through first is "used but not priced". */
export default async function RateBookPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = rateBookParams(await searchParams);
  const [works, book, lineCounts] = await Promise.all([
    listWorkStatus(),
    getRecipeBook(),
    countLinesByWork(),
  ]);

  const mixesById = new Map<string, MixDef>(book.mixes.map((mix) => [mix.id, mix]));
  const materialsById = new Map<string, MaterialDef>(
    book.materials.map((material) => [material.id, material]),
  );
  const recipeByWork = new Map(book.recipes.map((recipe) => [recipe.workItemId, recipe]));

  const rows: RateBookRow[] = works
    .filter((work) => work.isActive)
    .map((work) => ({
      workItemId: work.workItemId,
      code: work.code,
      name: work.name,
      groupName: work.groupName,
      category: `${work.categoryCode} — ${work.categoryName}`,
      categoryCode: work.categoryCode,
      uom: work.uom,
      labourRate: work.labourRate,
      componentCount: work.componentCount,
      rate: rateBuildUp(recipeByWork.get(work.workItemId), mixesById, materialsById)?.rate ?? null,
      lineCount: lineCounts.get(work.workItemId) ?? 0,
      componentNames: (recipeByWork.get(work.workItemId)?.components ?? []).map((component) =>
        component.mixId
          ? (mixesById.get(component.mixId)?.name ?? "")
          : (materialsById.get(component.materialId ?? "")?.name ?? ""),
      ),
    }));
  const categories = [...new Map(rows.map((row) => [row.categoryCode, row.category]))].sort(
    ([a], [b]) => a.localeCompare(b),
  );

  const priced = rows.filter((row) => row.rate !== null);
  const todo = rows.filter((row) => row.lineCount > 0 && row.rate === null);
  const shown = filterRateBook(rows, params);

  return (
    <div className="space-y-4">
      <div className="max-w-2xl">
        <p className="text-muted text-[11px] font-medium tracking-[0.14em] uppercase">Rate book</p>
        <p className="text-muted mt-1 text-sm">
          What one unit of each work costs — what it is measured in, the labour rate, and the
          materials it uses at Masters&apos; prices. Every villa starts from these, and any villa
          can have its own figure for a work. The works themselves are listed in Masters.
        </p>
      </div>

      <FigureBand className="sm:grid-cols-3 lg:grid-cols-3">
        <FigureBandCell>
          <Figure label="Works" value={formatCount(rows.length)} hint="in Masters" size="lg" />
        </FigureBandCell>
        <FigureBandCell>
          <Figure
            label="Priced"
            value={formatCount(priced.length)}
            hint="labour and every material"
            size="lg"
          />
        </FigureBandCell>
        <FigureBandCell>
          <Figure
            label="Used but not priced"
            value={formatCount(todo.length)}
            hint="an estimate needs these"
            tone={todo.length > 0 ? "warn" : undefined}
            size="lg"
          />
        </FigureBandCell>
      </FigureBand>

      <div className="flex flex-wrap items-end justify-between gap-2">
        <ListToolbar
          action="/estimator/works"
          values={params}
          search={{ placeholder: "Work, code or material — lintel, cement" }}
          filters={[
            {
              param: "category",
              label: "Category",
              allLabel: "All categories",
              options: categories.map(([value, label]) => ({ value, label })),
            },
            {
              param: "show",
              label: "Show",
              allLabel: "Every work",
              options: Object.entries(RATE_BOOK_SHOWS).map(([value, label]) => ({
                value,
                label: value === "todo" ? `${label} (${formatCount(todo.length)})` : label,
              })),
            },
          ]}
        />
        <LinkButton href="/estimator/works/sketchup-setup" variant="ghost" plain>
          Download setup for SketchUp
        </LinkButton>
      </div>

      {shown.length > 0 && shown.length < rows.length && (
        <p className="text-muted text-sm">
          {formatCount(shown.length)} of {formatCount(rows.length)} works
        </p>
      )}

      {shown.length === 0 ? (
        <EmptyState
          icon={Hammer}
          title={
            rows.length === 0
              ? "No works yet"
              : params.show === "todo"
                ? "Nothing waiting"
                : "Nothing matches"
          }
          description={
            rows.length === 0
              ? "Works come from the Masters list. Add them there first."
              : params.show === "todo" && !params.q && !params.category
                ? "Every work an estimate uses has a rate."
                : "Try another search or filter."
          }
        />
      ) : (
        <RateBookList rows={shown} />
      )}
    </div>
  );
}
