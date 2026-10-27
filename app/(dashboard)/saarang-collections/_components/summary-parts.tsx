import { LinkButton } from "@/components/ui/button";
import { chipClassName } from "@/components/ui/choice-chips";
import { Figure, FigureBand, FigureBandCell } from "@/components/ui/figure";
import { Section } from "@/components/ui/section";
import {
  Table,
  TableBody,
  TableCell,
  TableFoot,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import { formatAmount, formatCount, formatCrore, formatDate, formatMoney } from "@/lib/format";
import {
  PROJECTS,
  type Detail,
  type DetailCell,
  type DetailKey,
  type Project,
} from "@/lib/saarang-collections/core";
import type { Window } from "@/lib/saarang-collections/period";
import { PROJECT_NAMES } from "@/lib/saarang-collections/shared";
import {
  COLUMNS,
  LABEL,
  figureOf,
  meetingColumns,
  mtdRange,
  periodRange,
  reportNeeded,
  totalOf,
  type View,
} from "@/lib/saarang-collections/summary";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { ManualFigure } from "./manual-figure";

export type Filter = "all" | Project;

type Period = { periodFrom: string | null; periodTo: string | null; reportDate: string | null };

const NUMBER = "font-mono tabular-nums text-right";
const CELL = "block px-3 py-3 text-right font-mono tabular-nums";

/** `period`: the period view, with its own dates when known — looking at a period never saves one. */
export function summaryHref(
  filter: Filter,
  cell: string | null,
  period: Window | true | null = null,
): string {
  const query = new URLSearchParams();
  if (period) query.set("view", "period");
  if (period && period !== true) {
    query.set("from", period.from);
    query.set("to", period.to);
  }
  if (filter !== "all") query.set("project", filter);
  if (cell) query.set("cell", cell);
  const qs = query.toString();
  return `/saarang-collections/summary${qs ? `?${qs}` : ""}${cell ? "#breakdown" : ""}`;
}

export function ProjectFilter({
  filter,
  cell,
  period = null,
}: {
  filter: Filter;
  cell: string | null;
  period?: Window | true | null;
}) {
  const options: { value: Filter; label: string }[] = [
    { value: "all", label: "All projects" },
    { value: "plot", label: "Plot" },
    { value: "villa", label: "Villa" },
  ];
  return (
    <div role="group" aria-label="Project" className="flex flex-wrap gap-1.5">
      {options.map((option) => (
        <Link
          key={option.value}
          href={summaryHref(option.value, cell, period)}
          aria-current={filter === option.value ? "true" : undefined}
          className={chipClassName(filter === option.value)}
        >
          {option.label}
        </Link>
      ))}
    </div>
  );
}

export function Tiles({ view, filter, period }: { view: View; filter: Filter; period: Period }) {
  const projects: readonly Project[] = filter === "all" ? PROJECTS : [filter];
  const T = (k: string) => totalOf(view, k, projects);
  const units = projects.reduce<number>((n, p) => n + (view.result[p].values.Munits ?? 0), 0);
  const range = periodRange(period.periodFrom, period.periodTo);
  const typedHint = <span className="tracking-wide uppercase">Entered by hand</span>;

  const tiles: {
    label: string;
    value: number | null;
    tone?: "good" | "warn";
    hint?: React.ReactNode;
  }[] = [
    {
      label: "Total sold value",
      value: T("E"),
      hint: T("O") !== null ? `${formatCount(T("O"))} of ${formatCount(T("N"))} units sold` : "",
    },
    {
      label: "Invoice value",
      value: T("P"),
      hint: T("S") !== null ? `of ${formatCrore(T("S"))} on the schedule` : "",
    },
    {
      label: "Total collection",
      value: T("F"),
      tone: "good",
      hint: T("L") !== null ? `${formatCrore(T("L"))} collected but unused` : "",
    },
    {
      label: "Outstanding",
      value: T("M"),
      tone: T("M") ? "warn" : undefined,
      hint: T("M") !== null ? `${units} ${units === 1 ? "unit" : "units"} with a balance` : "",
    },
    { label: "Last month collection", value: T("H"), hint: range || "Set a collection period" },
    { label: "Next month collection (E)", value: T("J"), hint: typedHint },
    {
      label: "Total expense",
      value: T("G"),
      hint: T("I") !== null ? `${formatCrore(T("I"))} last month` : typedHint,
    },
    {
      label: "Collection MTD",
      value: T("MTD"),
      hint: mtdRange(period.reportDate) || "Upload reports to set the month",
    },
  ];

  return (
    <FigureBand>
      {tiles.map((tile) => (
        <FigureBandCell key={tile.label}>
          <Figure
            size="lg"
            label={tile.label}
            value={formatCrore(tile.value)}
            tone={tile.tone}
            hint={tile.hint || " "}
          />
        </FigureBandCell>
      ))}
    </FigureBand>
  );
}

function Header({ children }: { children: React.ReactNode }) {
  return (
    <TableHeaderCell className="min-w-32 px-3 text-right align-bottom whitespace-normal">
      {children}
    </TableHeaderCell>
  );
}

const SUB = "text-muted mt-1 block text-[11px] font-normal tracking-normal normal-case";
const STICKY = "bg-surface sticky left-0 z-10";

const shown = (v: number | null, count?: boolean) =>
  v === null ? "—" : count ? formatCount(v) : formatAmount(v);

export function SummaryTable({
  view,
  filter,
  cell,
  period,
}: {
  view: View;
  filter: Filter;
  cell: string | null;
  period: Period;
}) {
  const range = periodRange(period.periodFrom, period.periodTo);
  const month = mtdRange(period.reportDate);

  return (
    <Table>
      <TableHead>
        <tr>
          <TableHeaderCell className={cn(STICKY, "min-w-36")}>Project</TableHeaderCell>
          {COLUMNS.map((c) => (
            <Header key={c.k}>
              {c.label}
              {c.k === "H" && range ? <span className={SUB}>{range}</span> : null}
              {c.k === "MTD" && month ? <span className={SUB}>{month}</span> : null}
            </Header>
          ))}
        </tr>
      </TableHead>
      <TableBody>
        {PROJECTS.map((p) => (
          <TableRow key={p}>
            <TableCell className={cn(STICKY, "font-medium whitespace-nowrap")}>
              {PROJECT_NAMES[p]}
            </TableCell>
            {COLUMNS.map((c) => {
              if (c.typed) {
                const value = view.figures[p][c.k] ?? null;
                return (
                  <TableCell key={c.k} className="p-0">
                    <ManualFigure
                      key={`${p}.${c.k}.${value}`}
                      project={p}
                      figure={c.k}
                      value={value}
                      count={c.count}
                      label={`${LABEL[c.k]}, ${PROJECT_NAMES[p]}`}
                    />
                  </TableCell>
                );
              }
              const value = figureOf(view, p, c.k);
              const missing = c.need ? view.result[p].missing.includes(`${p}_${c.need}`) : false;
              if (value === null || !view.result[p].detail[c.k as DetailKey]) {
                return (
                  <TableCell key={c.k} className="p-0">
                    <span
                      className={cn(CELL, "text-muted")}
                      title={
                        missing && c.need
                          ? `Upload the ${reportNeeded(p, c.need)} report`
                          : "Not known yet"
                      }
                    >
                      —
                    </span>
                  </TableCell>
                );
              }
              const on = cell === `${p}.${c.k}`;
              return (
                <TableCell key={c.k} className="p-0">
                  <Link
                    href={summaryHref(filter, on ? null : `${p}.${c.k}`)}
                    aria-current={on ? "true" : undefined}
                    title="Show the rows behind this number"
                    className={cn(
                      CELL,
                      on ? "bg-foreground text-background" : "hover:bg-foreground/[0.05]",
                    )}
                  >
                    {shown(value, c.count)}
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
          {COLUMNS.map((c) => (
            <TableCell key={c.k} className={cn(NUMBER, "px-3 font-semibold")}>
              {shown(totalOf(view, c.k), c.count)}
            </TableCell>
          ))}
        </TableRow>
      </TableFoot>
    </Table>
  );
}

export function MeetingTable({ view, period }: { view: View; period: Period }) {
  const columns = meetingColumns(period.periodFrom, period.reportDate);

  return (
    <Table>
      <TableHead>
        <tr>
          <TableHeaderCell className={cn(STICKY, "min-w-36")}>Project</TableHeaderCell>
          {columns.map((c) => (
            <Header key={c.k}>{c.label}</Header>
          ))}
        </tr>
      </TableHead>
      <TableBody>
        {PROJECTS.map((p) => (
          <TableRow key={p}>
            <TableCell className={cn(STICKY, "font-medium whitespace-nowrap")}>
              {PROJECT_NAMES[p]}
            </TableCell>
            {columns.map((c) =>
              c.k === "T" ? (
                <TableCell key={c.k} className="p-0">
                  <ManualFigure
                    key={`${p}.T.${view.figures[p].T}`}
                    project={p}
                    figure="T"
                    value={view.figures[p].T ?? null}
                    label={`${c.label}, ${PROJECT_NAMES[p]}`}
                  />
                </TableCell>
              ) : (
                <TableCell key={c.k} className={cn(NUMBER, "px-3")}>
                  {shown(figureOf(view, p, c.k), c.count)}
                </TableCell>
              ),
            )}
          </TableRow>
        ))}
        <TableRow>
          <TableCell className={cn(STICKY, "font-medium whitespace-nowrap")}>Phase 3</TableCell>
          {columns.map((c) => {
            const value = view.figures.phase3[c.k] ?? null;
            return (
              <TableCell key={c.k} className="p-0">
                <ManualFigure
                  key={`phase3.${c.k}.${value}`}
                  project="phase3"
                  figure={c.k}
                  value={value}
                  count={c.count}
                  label={`${c.label}, Phase 3`}
                />
              </TableCell>
            );
          })}
        </TableRow>
      </TableBody>
    </Table>
  );
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function detailCell(x: DetailCell | undefined) {
  if (typeof x === "number") return { text: formatAmount(x), numeric: true };
  if (typeof x === "string" && ISO_DATE.test(x)) return { text: formatDate(x), numeric: false };
  return { text: x ?? "", numeric: false };
}

type DetailLine = { cells: DetailCell[]; why: string };

function DetailTable({ cols, lines, out }: { cols: string[]; lines: DetailLine[]; out?: boolean }) {
  const numeric = cols.map((_, i) => typeof lines[0]?.cells[i] === "number");
  return (
    <Table containerClassName="max-h-96 overflow-auto">
      <TableHead className="bg-surface sticky top-0">
        <tr>
          {cols.map((c, i) => (
            <TableHeaderCell key={c} className={cn("px-3", numeric[i] && "text-right")}>
              {c}
            </TableHeaderCell>
          ))}
          <TableHeaderCell className="px-3">Note</TableHeaderCell>
        </tr>
      </TableHead>
      <TableBody>
        {lines.map((line, r) => (
          <TableRow key={r}>
            {cols.map((c, i) => {
              const { text, numeric: isNumber } = detailCell(line.cells[i]);
              return (
                <TableCell
                  key={c}
                  className={cn(
                    "px-3 py-2 text-[13px] whitespace-nowrap",
                    isNumber && NUMBER,
                    out && "text-muted",
                  )}
                >
                  {text}
                </TableCell>
              );
            })}
            <TableCell className="text-warning px-3 py-2 text-xs">{line.why}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** The rows behind one calculated figure, and what was left out of it. */
export function Breakdown({
  detail,
  title,
  k,
  filter,
  period = null,
}: {
  detail: Detail;
  title: string;
  k: string;
  filter: Filter;
  period?: Window | null;
}) {
  const valueAt = k === "L" ? 5 : ["F", "H", "MTD"].includes(k) ? 4 : detail.cols.length - 1;
  const sum = detail.rows.reduce((total, row) => total + (Number(row[valueAt]) || 0), 0);
  const lines = detail.rows.map((cells) => ({
    cells,
    why: String(cells[detail.cols.length] ?? ""),
  }));

  return (
    <div id="breakdown" className="scroll-mt-4">
      <Section
        title={title}
        note={`${formatCount(detail.rows.length)} rows · ${k === "O" ? `${formatCount(detail.rows.length)} units` : formatMoney(sum)}`}
        aside={
          <LinkButton href={summaryHref(filter, null, period)} variant="secondary" size="sm">
            Close
          </LinkButton>
        }
        bodyClassName="space-y-4"
      >
        <DetailTable cols={detail.cols} lines={lines} />
        {detail.left.length > 0 && (
          <details>
            <summary className="text-muted cursor-pointer text-sm">
              Left out of this number ({formatCount(detail.left.length)})
            </summary>
            <div className="mt-2">
              <DetailTable
                cols={detail.cols}
                lines={detail.left.map((l) => ({ cells: l.cells, why: l.why }))}
                out
              />
            </div>
          </details>
        )}
      </Section>
    </div>
  );
}
