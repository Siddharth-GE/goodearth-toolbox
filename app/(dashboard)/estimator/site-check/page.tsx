import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Figure, FigureBand, FigureBandCell } from "@/components/ui/figure";
import { getApprovalsFor, getOfficialComparisons } from "@/lib/estimator/estimate-queries";
import {
  getIndentApprovalsFor,
  getIndentsForEstimator,
  type IndentForEstimator,
} from "@/lib/estimator/indent-queries";
import { siteCheckEntries, villaSummaries, type VillaSummary } from "@/lib/estimator/site-check";
import { formatCount, formatDate, formatQuantity } from "@/lib/format";
import { listProjects } from "@/lib/masters/projects";
import { listUnits } from "@/lib/masters/units";
import { ClipboardCheck } from "lucide-react";
import Link from "next/link";
import { IndentLineAnswer } from "./_components/indent-answer";

/**
 * Site check — first the indent lines waiting for an estimator, then
 * every villa with an official estimate as a card counting what needs a
 * look there (founder, 2026-10-16: "a villa wise list you click in and
 * see"). A card opens the villa: its over-runs and unplanned arrivals with
 * Approve on the row, and every material estimated against reached. Each
 * material across all villas is one tap away (`/materials`).
 *
 * Everything is derived fresh from the frozen estimates and the plots'
 * movements, the same arithmetic as each official estimate's own page.
 * Quantities only — no money on this screen.
 */
export default async function SiteCheckPage() {
  const [officials, units, projects, indents] = await Promise.all([
    getOfficialComparisons(),
    listUnits(),
    listProjects(),
    getIndentsForEstimator(),
  ]);

  const entries = siteCheckEntries(officials);
  const officialUnits = new Set(officials.map((official) => official.unitId));
  const officialVillas = units.filter((unit) => officialUnits.has(unit.id));
  const [approvals, indentApprovals] = await Promise.all([
    getApprovalsFor(officials.map((official) => official.unitId)),
    getIndentApprovalsFor(officialVillas),
  ]);

  const unitById = new Map(units.map((unit) => [unit.id, unit]));
  const projectName = new Map(projects.map((project) => [project.id, project.name]));
  const referenceByEstimate = new Map(
    officials.map((official) => [official.estimateId, official.reference]),
  );
  // Approved here, or — since 0113 — at the indent that asked for the
  // material: either way an estimator has looked at it.
  const isApproved = (entry: (typeof entries)[number]) => {
    const key = `${entry.unitId} ${entry.workItemId ?? ""} ${entry.itemId}`;
    return approvals.has(key) || indentApprovals.has(key);
  };
  const villas = villaSummaries(
    officials,
    entries,
    isApproved,
    (unitId) => unitById.get(unitId)?.name ?? "",
  );

  const waiting = villas.reduce((sum, villa) => sum + villa.waiting, 0);
  const villasOver = villas.filter((villa) => villa.over > 0).length;

  // Indents wait for the estimator whether or not any villa has an
  // official estimate yet — a villa without one has nothing to cover it.
  if (officials.length === 0) {
    return (
      <div className="space-y-4">
        <IndentsWaiting indents={indents} />
        <EmptyState
          icon={ClipboardCheck}
          title="No official estimates yet"
          description="Site check lines up what reaches each villa against its official estimate. Submit a villa's estimate and it appears here."
        />
      </div>
    );
  }
  const indentLinesWaiting = indents.reduce(
    (sum, indent) => sum + indent.lines.filter((line) => line.decision === null).length,
    0,
  );

  // Grouped by project, in project-name order, as Design Management's
  // villa cards are.
  const projectOf = (villa: VillaSummary) =>
    projectName.get(unitById.get(villa.unitId)?.project_id ?? "") ?? "No project";
  const groups = [...new Set(villas.map(projectOf))].sort();

  return (
    <div className="space-y-4">
      <div className="max-w-2xl">
        <p className="text-muted text-[11px] font-medium tracking-[0.14em] uppercase">Site check</p>
        <p className="text-muted mt-1 text-sm">
          First, indent lines no estimate covers: the indent waits for your answer. Then each villa
          — open one to see what has reached its site against its official estimate. Going over is
          flagged, never refused: site work never waits. Material the estimate never planned needs
          an estimator&apos;s approval, and keeps its flag either way.
        </p>
      </div>

      <FigureBand>
        <FigureBandCell>
          <Figure
            label="Indent lines"
            value={formatCount(indentLinesWaiting)}
            hint="outside the estimate, waiting for you"
            tone={indentLinesWaiting > 0 ? "warn" : undefined}
            size="lg"
          />
        </FigureBandCell>
        <FigureBandCell>
          <Figure
            label="Villas"
            value={formatCount(officials.length)}
            hint="with an official estimate"
            size="lg"
          />
        </FigureBandCell>
        <FigureBandCell>
          <Figure
            label="Past the estimate"
            value={formatCount(villasOver)}
            hint="villas drawing more than planned"
            tone={villasOver > 0 ? "warn" : undefined}
            size="lg"
          />
        </FigureBandCell>
        <FigureBandCell>
          <Figure
            label="Waiting for approval"
            value={formatCount(waiting)}
            hint="arrived outside the estimate"
            tone={waiting > 0 ? "warn" : undefined}
            size="lg"
          />
        </FigureBandCell>
      </FigureBand>

      <IndentsWaiting indents={indents} />

      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-muted text-[11px] font-medium tracking-[0.14em] uppercase">Villas</p>
          <p className="text-muted mt-1 text-sm">
            The ones waiting for you come first. Open a villa to see every material against its
            estimate.
          </p>
        </div>
        <LinkButton href="/estimator/site-check/materials" variant="secondary" size="sm">
          Every material, all villas
        </LinkButton>
      </div>

      {groups.map((group) => (
        <div key={group} className="space-y-2">
          <p className="text-muted text-[11px] font-medium tracking-[0.14em] uppercase">{group}</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {villas
              .filter((villa) => projectOf(villa) === group)
              .map((villa) => (
                <Link
                  key={villa.estimateId}
                  href={`/estimator/site-check/${villa.unitId}`}
                  className="focus-visible:ring-accent/25 block rounded-2xl focus-visible:ring-4 focus-visible:outline-none"
                >
                  <Card interactive className="flex h-full min-w-0 flex-col gap-3 p-4">
                    <div className="min-w-0">
                      <p className="text-foreground truncate text-sm font-semibold">
                        {unitById.get(villa.unitId)?.name ?? "A villa"}
                      </p>
                      <p className="text-muted truncate font-mono text-xs">
                        {referenceByEstimate.get(villa.estimateId) ?? "official estimate"}
                      </p>
                    </div>
                    <VillaBadges villa={villa} />
                  </Card>
                </Link>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function VillaBadges({ villa }: { villa: VillaSummary }) {
  if (villa.waiting === 0 && villa.over === 0 && villa.approved === 0) {
    return (
      <div>
        <Badge variant="success">Within the estimate</Badge>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {villa.waiting > 0 && (
        <Badge variant="warning">{formatCount(villa.waiting)} waiting for approval</Badge>
      )}
      {villa.over > 0 && (
        <Badge variant="warning">{formatCount(villa.over)} past the estimate</Badge>
      )}
      {villa.approved > 0 && (
        <Badge variant="neutral">{formatCount(villa.approved)} outside, approved</Badge>
      )}
    </div>
  );
}

/**
 * Indent lines outside the estimate (0113) — "the first thing reconciled
 * in the estimate". Each submitted indent with such lines, oldest first;
 * the indent cannot be approved until every one is approved here. To put a
 * material on the estimate properly, open the villa's working estimate and
 * make it official again — the next indent then pulls it from there.
 */
function IndentsWaiting({ indents }: { indents: IndentForEstimator[] }) {
  if (indents.length === 0) return null;
  return (
    <Card className="space-y-3 p-4">
      <div>
        <p className="text-muted text-[11px] font-medium tracking-[0.14em] uppercase">
          Indents waiting for you
        </p>
        <p className="text-muted mt-1 text-sm">
          Lines site asked for that no estimate or budget covers. The indent cannot be approved
          until you approve each one; a refusal sends it back to be changed. To add a material to a
          villa&apos;s estimate, open its estimate.
        </p>
      </div>
      <ul className="divide-border divide-y">
        {indents.map((indent) => (
          <li key={indent.id} className="space-y-2 py-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-foreground text-sm font-medium">
                  {indent.reference}
                  <span className="text-muted font-normal">
                    {" · "}
                    {indent.villa ?? "no villa"}
                    {" · "}
                    {indent.work_label ?? "no work named"}
                  </span>
                </p>
                <p className="text-muted text-xs">
                  {indent.project_name}
                  {indent.submitted_by_name && ` · asked by ${indent.submitted_by_name}`}
                  {indent.submitted_at && ` on ${formatDate(indent.submitted_at)}`}
                </p>
              </div>
              {indent.working_estimate_id && (
                <LinkButton
                  href={`/estimator/estimates/${indent.working_estimate_id}`}
                  variant="ghost"
                  size="sm"
                >
                  Open {indent.villa ?? "the villa"}&apos;s estimate
                </LinkButton>
              )}
            </div>
            <ul className="space-y-2">
              {indent.lines.map((line) => (
                <li
                  key={line.id}
                  className="border-border flex flex-wrap items-start justify-between gap-3 rounded-xl border px-3 py-2"
                >
                  <div className="min-w-0 space-y-0.5">
                    <p className="text-sm">
                      {line.item_name}
                      {line.item_code && <span className="text-muted"> · {line.item_code}</span>}
                      <span className="text-muted">
                        {" — "}
                        {formatQuantity(line.quantity)} {line.uom}
                      </span>
                    </p>
                    <p className="text-foreground text-sm">
                      <span className="text-muted">Why: </span>
                      {line.reason ?? "—"}
                    </p>
                    {line.decision && (
                      <p className="text-xs">
                        <Badge variant={line.decision === "approved" ? "success" : "danger"}>
                          {line.decision === "approved" ? "Approved" : "Refused"}
                        </Badge>
                        <span className="text-muted ml-2">
                          {[line.decided_by_name, line.decided_at && formatDate(line.decided_at)]
                            .filter(Boolean)
                            .join(" · ")}
                          {line.note ? ` — ${line.note}` : ""}
                        </span>
                      </p>
                    )}
                  </div>
                  <IndentLineAnswer
                    lineId={line.id}
                    itemName={line.item_name}
                    reference={indent.reference}
                    decision={line.decision}
                  />
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </Card>
  );
}
