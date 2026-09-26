import { EmptyState } from "@/components/ui/empty-state";
import { Figure, FigureBand, FigureBandCell } from "@/components/ui/figure";
import { LinkButton } from "@/components/ui/button";
import { rateBuildUp, type MaterialDef, type MixDef } from "@/lib/estimator/calc";
import { getRecipeBook } from "@/lib/estimator/estimate-queries";
import { countLinesByWork, listWorkStatus } from "@/lib/estimator/works-queries";
import { formatCount } from "@/lib/format";
import { Hammer } from "lucide-react";
import { RateBookList, type RateBookRow } from "./_components/rate-book-list";

/**
 * The rate book: what one unit of every work costs — its unit, labour
 * rate and the materials it uses, priced at Masters' prices. Every villa
 * estimate starts from these; a villa can have its own figures for any
 * of them (tap a rate on the estimate).
 *
 * The first list worth working through is "used but not priced": the
 * works some estimate already uses whose rate is still unknown. The other
 * hundred-odd works can wait until an estimate needs them.
 */
export default async function RateBookPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  const { show } = await searchParams;
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
      uom: work.uom,
      labourRate: work.labourRate,
      componentCount: work.componentCount,
      rate: rateBuildUp(recipeByWork.get(work.workItemId), mixesById, materialsById)?.rate ?? null,
      lineCount: lineCounts.get(work.workItemId) ?? 0,
    }));

  const priced = rows.filter((row) => row.rate !== null);
  const todo = rows.filter((row) => row.lineCount > 0 && row.rate === null);
  const shown = show === "todo" ? todo : show === "priced" ? priced : rows;

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

      <div className="flex flex-wrap gap-2">
        <LinkButton href="/estimator/works" variant={!show ? "primary" : "secondary"}>
          All
        </LinkButton>
        <LinkButton
          href="/estimator/works?show=todo"
          variant={show === "todo" ? "primary" : "secondary"}
        >
          Used but not priced ({formatCount(todo.length)})
        </LinkButton>
        <LinkButton
          href="/estimator/works?show=priced"
          variant={show === "priced" ? "primary" : "secondary"}
        >
          Priced
        </LinkButton>
      </div>

      {shown.length === 0 ? (
        <EmptyState
          icon={Hammer}
          title={show === "todo" ? "Nothing waiting" : "No works yet"}
          description={
            show === "todo"
              ? "Every work an estimate uses has a rate."
              : "Works come from the Masters list. Add them there first."
          }
        />
      ) : (
        <RateBookList rows={shown} />
      )}
    </div>
  );
}
