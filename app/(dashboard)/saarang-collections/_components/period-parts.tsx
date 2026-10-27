import { chipClassName } from "@/components/ui/choice-chips";
import { Figure, FigureBand, FigureBandCell } from "@/components/ui/figure";
import {
  Table,
  TableBody,
  TableCell,
  TableFoot,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import { formatAmount, formatCount, formatCrore, formatDate } from "@/lib/format";
import { PROJECTS, type Project } from "@/lib/saarang-collections/core";
import {
  PERIOD_FIGURES,
  type PeriodKey,
  type PeriodResult,
} from "@/lib/saarang-collections/period";
import { PROJECT_NAMES } from "@/lib/saarang-collections/shared";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { summaryHref, type Filter } from "./summary-parts";

const STICKY = "bg-surface sticky left-0 z-10";
const CELL = "block px-3 py-3 text-right font-mono tabular-nums";
const SUB = "text-muted mt-1 block text-[11px] font-normal tracking-normal normal-case";

/** Whole project (the meeting sheet) or one period: two views, never mixed on one screen. */
export function ViewSwitch({
  period,
  filter,
  reportDate,
  range,
}: {
  period: boolean;
  filter: Filter;
  reportDate: string | null;
  range: string;
}) {
  const options = [
    {
      on: !period,
      href: summaryHref(filter, null, false),
      label: "Whole project",
      hint: reportDate ? `to ${formatDate(reportDate)}` : "to date",
    },
    {
      on: period,
      href: summaryHref(filter, null, true),
      label: "This period",
      hint: range || "set the dates",
    },
  ];
  return (
    <div role="group" aria-label="What the summary counts" className="flex flex-wrap gap-1.5">
      {options.map((option) => (
        <Link
          key={option.label}
          href={option.href}
          aria-current={option.on ? "true" : undefined}
          className={chipClassName(option.on)}
        >
          {option.label} <span className="font-normal opacity-75">· {option.hint}</span>
        </Link>
      ))}
    </div>
  );
}

/** The projects' sum, or null when any of them is unknown: a total of Plot alone never passes for both. */
const total = (
  periods: Record<Project, PeriodResult>,
  k: PeriodKey,
  projects: readonly Project[],
) => {
  const values = projects.map((p) => periods[p].values[k]);
  return values.some((v) => v === null) ? null : values.reduce<number>((a, b) => a + (b ?? 0), 0);
};

/** "Villa's report is not uploaded", for a figure some of the projects cannot give. */
const missingNote = (
  periods: Record<Project, PeriodResult>,
  k: PeriodKey,
  projects: readonly Project[],
) => {
  const missing = projects.filter((p) => periods[p].values[k] === null);
  if (missing.length === 0) return null;
  return `${missing.map((p) => PROJECT_NAMES[p]).join(" and ")}: report not uploaded`;
};

export function PeriodTiles({
  periods,
  filter,
}: {
  periods: Record<Project, PeriodResult>;
  filter: Filter;
}) {
  const projects: readonly Project[] = filter === "all" ? PROJECTS : [filter];
  const owing = projects
    .map((p) => periods[p].unitsOwing)
    .filter((n): n is number => n !== null)
    .reduce((a, b) => a + b, 0);
  const unused = total(periods, "L", projects);
  const scheduled = total(periods, "S", projects);
  const tiles = [
    {
      label: "Collected in the period",
      value: total(periods, "F", projects),
      tone: "good" as const,
      hint: missingNote(periods, "F", projects) ?? `${formatCrore(unused)} of it not yet applied`,
    },
    {
      label: "Invoiced in the period",
      value: total(periods, "P", projects),
      hint: missingNote(periods, "P", projects) ?? `of ${formatCrore(scheduled)} due in it`,
    },
    {
      label: "Unpaid, due in the period",
      value: total(periods, "M", projects),
      tone: "warn" as const,
      hint:
        missingNote(periods, "M", projects) ??
        `${formatCount(owing)} ${owing === 1 ? "unit" : "units"} owing`,
    },
  ];
  return (
    // Three figures: three columns, or the band shows an empty fourth.
    <FigureBand className="sm:grid-cols-3 lg:grid-cols-3">
      {tiles.map((tile) => (
        <FigureBandCell key={tile.label}>
          <Figure
            size="lg"
            label={tile.label}
            value={formatCrore(tile.value)}
            tone={tile.value ? tile.tone : undefined}
            hint={tile.hint}
          />
        </FigureBandCell>
      ))}
    </FigureBand>
  );
}

export function PeriodTable({
  periods,
  filter,
  cell,
}: {
  periods: Record<Project, PeriodResult>;
  filter: Filter;
  cell: string | null;
}) {
  return (
    <Table>
      <TableHead>
        <tr>
          <TableHeaderCell className={cn(STICKY, "min-w-36")}>Project</TableHeaderCell>
          {PERIOD_FIGURES.map((f) => (
            <TableHeaderCell
              key={f.k}
              className="min-w-36 px-3 text-right align-bottom whitespace-normal"
            >
              {f.label}
              <span className={SUB}>{f.hint}</span>
            </TableHeaderCell>
          ))}
        </tr>
      </TableHead>
      <TableBody>
        {PROJECTS.map((p) => (
          <TableRow key={p}>
            <TableCell className={cn(STICKY, "font-medium whitespace-nowrap")}>
              {PROJECT_NAMES[p]}
            </TableCell>
            {PERIOD_FIGURES.map((f) => {
              const value = periods[p].values[f.k];
              if (value === null) {
                return (
                  <TableCell key={f.k} className="p-0">
                    <span
                      className={cn(CELL, "text-muted")}
                      title="Its Zoho report is not uploaded"
                    >
                      —
                    </span>
                  </TableCell>
                );
              }
              const on = cell === `${p}.${f.k}`;
              return (
                <TableCell key={f.k} className="p-0">
                  <Link
                    href={summaryHref(filter, on ? null : `${p}.${f.k}`, true)}
                    aria-current={on ? "true" : undefined}
                    title="Show the rows behind this number"
                    className={cn(
                      CELL,
                      on ? "bg-foreground text-background" : "hover:bg-foreground/[0.05]",
                    )}
                  >
                    {formatAmount(value)}
                  </Link>
                </TableCell>
              );
            })}
          </TableRow>
        ))}
      </TableBody>
      <TableFoot>
        <TableRow>
          <TableCell className={cn(STICKY, "font-semibold")}>Total</TableCell>
          {PERIOD_FIGURES.map((f) => {
            const sum = total(periods, f.k, PROJECTS);
            return (
              <TableCell
                key={f.k}
                title={missingNote(periods, f.k, PROJECTS) ?? undefined}
                className="px-3 text-right font-mono font-semibold tabular-nums"
              >
                {sum === null ? "—" : formatAmount(sum)}
              </TableCell>
            );
          })}
        </TableRow>
      </TableFoot>
    </Table>
  );
}
