import { Button, LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Figure, FigureBand, FigureBandCell } from "@/components/ui/figure";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pagination } from "@/components/ui/pagination";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import {
  getFilterOptions,
  getHeadlines,
  listEngagementsPage,
} from "@/lib/client-relations/queries";
import { BOTTLENECKS, DEED_STATUSES, REGISTRATION_STAGES } from "@/lib/client-relations/stages";
import { formatCount, formatMoney } from "@/lib/format";
import { MapPin } from "lucide-react";
import Link from "next/link";

import {
  AckBadge,
  BottleneckChips,
  DeedBadge,
  InvoiceStageBadge,
  OriginalWithBadge,
  RegistrationBadge,
  UnitStatusBadge,
} from "../_components/crm-badges";

export default async function PlotsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    project?: string;
    owner?: string;
    bottleneck?: string;
    deed?: string;
    registration?: string;
    page?: string;
  }>;
}) {
  const params = await searchParams;

  const [result, options, headlines] = await Promise.all([
    listEngagementsPage({ ...params, search: params.q, page: Number(params.page) || 1 }),
    getFilterOptions(),
    getHeadlines(params.project),
  ]);
  const { rows, total, page: currentPage, pageSize, pageCount } = result;
  const isFiltered = Boolean(
    params.q ||
    params.project ||
    params.owner ||
    params.bottleneck ||
    params.deed ||
    params.registration,
  );

  const hrefForPage = (target: number) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value && key !== "page") query.set(key, value);
    }
    if (target > 1) query.set("page", String(target));
    const search = query.toString();
    return search ? `/client-relations/plots?${search}` : "/client-relations/plots";
  };

  return (
    <div className="space-y-4">
      {/* The sheet's header row, computed. Every one of these was typed by
          hand — "Sale Count: 38", "Sale deed: 29", "Const Agmt: 23" — and
          went stale the moment a plot moved. */}
      <FigureBand>
        <FigureBandCell>
          <Figure label="Plots" value={formatCount(headlines.plots)} size="sm" />
        </FigureBandCell>
        <FigureBandCell>
          <Figure
            label="Sold"
            value={formatCount(headlines.sold)}
            hint={`${formatCount(headlines.reserved)} reserved, ${formatCount(headlines.available)} available`}
            size="sm"
          />
        </FigureBandCell>
        <FigureBandCell>
          <Figure
            label="Sale deeds signed"
            value={formatCount(headlines.saleDeedsSigned)}
            size="sm"
          />
        </FigureBandCell>
        <FigureBandCell>
          <Figure
            label="Agreements signed"
            value={formatCount(headlines.agreementsSigned)}
            size="sm"
          />
        </FigureBandCell>
        <FigureBandCell>
          <Figure
            label="For registration"
            value={formatCount(headlines.forRegistration)}
            size="sm"
          />
        </FigureBandCell>
        <FigureBandCell>
          <Figure
            label="Plots overdue"
            value={formatCount(headlines.overdue)}
            tone={headlines.overdue > 0 ? "bad" : undefined}
            size="sm"
          />
        </FigureBandCell>
      </FigureBand>

      <form action="/client-relations/plots" className="flex flex-wrap items-end gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="q">Search</Label>
          <Input
            id="q"
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Plot or client…"
            autoComplete="off"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="project">Project</Label>
          <Select id="project" name="project" defaultValue={params.project ?? ""}>
            <option value="">All</option>
            {options.projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="owner">Handled by</Label>
          <Select id="owner" name="owner" defaultValue={params.owner ?? ""}>
            <option value="">Anyone</option>
            {options.owners.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="deed">Sale deed</Label>
          <Select id="deed" name="deed" defaultValue={params.deed ?? ""}>
            <option value="">Any</option>
            {DEED_STATUSES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="registration">Registration</Label>
          <Select id="registration" name="registration" defaultValue={params.registration ?? ""}>
            <option value="">Any</option>
            {REGISTRATION_STAGES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bottleneck">Waiting on</Label>
          <Select id="bottleneck" name="bottleneck" defaultValue={params.bottleneck ?? ""}>
            <option value="">Anything</option>
            {BOTTLENECKS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
        <Button type="submit" variant="secondary">
          Filter
        </Button>
        {isFiltered && (
          <LinkButton href="/client-relations/plots" variant="ghost">
            Clear
          </LinkButton>
        )}
      </form>

      {rows.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title={isFiltered ? "No plots match those filters" : "No plots yet"}
          description={
            isFiltered
              ? "Try a wider search, or clear the filters."
              : "Plots appear here as soon as they exist in Masters."
          }
        />
      ) : (
        // Wide on purpose — this IS the sheet. It scrolls inside the
        // shared Table's own overflow wrapper rather than reflowing, so
        // the page body never scrolls sideways on a phone.
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell className="min-w-[120px]">Plot</TableHeaderCell>
              <TableHeaderCell className="min-w-[180px]">Client</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
              <TableHeaderCell>Sale deed</TableHeaderCell>
              <TableHeaderCell>Original</TableHeaderCell>
              <TableHeaderCell>Ack</TableHeaderCell>
              <TableHeaderCell>Agreement</TableHeaderCell>
              <TableHeaderCell>Registration</TableHeaderCell>
              <TableHeaderCell>Invoice stage</TableHeaderCell>
              <TableHeaderCell className="min-w-[160px]">Waiting on</TableHeaderCell>
              <TableHeaderCell className="text-right">Outstanding</TableHeaderCell>
              <TableHeaderCell>Handled by</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="text-foreground font-medium whitespace-nowrap">
                  <Link href={`/client-relations/plots/${row.id}`} className="hover:underline">
                    {row.unitName}
                  </Link>
                  <span className="text-muted block text-xs">{row.projectName}</span>
                </TableCell>
                <TableCell>
                  {row.clientId ? (
                    <Link
                      href={`/client-relations/${row.clientId}`}
                      className="text-foreground hover:underline"
                    >
                      {row.clientName}
                    </Link>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <UnitStatusBadge status={row.unitStatus} />
                </TableCell>
                <TableCell>
                  <DeedBadge status={row.saleDeedStatus} />
                </TableCell>
                <TableCell>
                  <OriginalWithBadge value={row.saleDeedOriginalWith} />
                </TableCell>
                <TableCell>
                  <AckBadge value={row.saleDeedAck} />
                </TableCell>
                <TableCell>
                  <DeedBadge status={row.caStatus} />
                </TableCell>
                <TableCell>
                  <RegistrationBadge stage={row.registrationStage} />
                </TableCell>
                <TableCell>
                  <InvoiceStageBadge stage={row.invoiceStage} />
                </TableCell>
                <TableCell>
                  <BottleneckChips values={row.bottlenecks} />
                </TableCell>
                <TableCell className="text-right font-mono text-xs whitespace-nowrap">
                  {row.dues.outstanding > 0 ? (
                    <span className={row.dues.overdue > 0 ? "text-danger" : undefined}>
                      {formatMoney(row.dues.outstanding)}
                    </span>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </TableCell>
                <TableCell className="text-muted whitespace-nowrap">
                  {row.ownerName ?? "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Pagination
        page={currentPage}
        pageCount={pageCount}
        total={total}
        pageSize={pageSize}
        unit="plots"
        prevHref={currentPage > 1 ? hrefForPage(currentPage - 1) : null}
        nextHref={currentPage < pageCount ? hrefForPage(currentPage + 1) : null}
      />
    </div>
  );
}
