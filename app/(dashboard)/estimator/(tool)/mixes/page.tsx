import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { LinkButton } from "@/components/ui/button";
import { ListToolbar } from "@/components/ui/list-toolbar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import {
  filterMixes,
  groupMixes,
  mixGroupNames,
  mixListParams,
  NO_GROUP,
} from "@/lib/estimator/mix-list";
import { listMixes } from "@/lib/estimator/mixes-queries";
import { listUomNames } from "@/lib/estimator/shared";
import { formatCount } from "@/lib/format";
import { Blend } from "lucide-react";
import Link from "next/link";
import { MixFormDialog } from "./_components/mix-forms";

export default async function MixesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = mixListParams(await searchParams);
  const [mixes, uoms] = await Promise.all([listMixes(), listUomNames()]);
  const groups = mixGroupNames(mixes);
  const shown = filterMixes(mixes, params);
  const sections = groupMixes(shown, params.by);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="max-w-2xl">
          <p className="text-muted text-[11px] font-medium tracking-[0.14em] uppercase">Mixes</p>
          <p className="text-muted mt-1 text-sm">
            A recipe several works share — M20 concrete, cement mortar. Set what goes into one unit
            of it once, and every work using it follows. Change the mix later and every estimate
            updates.
          </p>
        </div>
        <MixFormDialog uoms={uoms} groups={groups} />
      </div>

      {mixes.length === 0 ? (
        <EmptyState
          icon={Blend}
          title="No mixes yet"
          description="Add M20 concrete or a mortar, then say what goes into one unit of it."
        />
      ) : (
        <>
          <ListToolbar
            action="/estimator/mixes"
            values={params}
            search={{ placeholder: "Name, note or material — cement" }}
            filters={[
              {
                param: "group",
                label: "Group",
                allLabel: "All groups",
                options: [
                  ...groups.map((group) => ({ value: group, label: group })),
                  ...(mixes.some((mix) => !mix.groupName)
                    ? [{ value: NO_GROUP, label: "No group" }]
                    : []),
                ],
              },
              {
                param: "status",
                label: "Status",
                allLabel: "Active and inactive",
                options: [
                  { value: "active", label: "Active" },
                  { value: "inactive", label: "Inactive" },
                ],
              },
              {
                param: "show",
                label: "Show",
                allLabel: "Every mix",
                options: [
                  { value: "empty", label: "Nothing in it yet" },
                  { value: "unused", label: "Not used by any work" },
                ],
              },
              {
                param: "by",
                label: "Group by",
                allLabel: "Group",
                options: [
                  { value: "unit", label: "Unit" },
                  { value: "none", label: "No grouping" },
                ],
              },
            ]}
          />

          {shown.length < mixes.length && (
            <p className="text-muted text-sm">
              {formatCount(shown.length)} of {formatCount(mixes.length)} mixes
            </p>
          )}

          {sections.length === 0 ? (
            <p className="text-muted text-sm">No mix matches. Clear the search or filters.</p>
          ) : (
            sections.map((section) => (
              <Card key={section.heading ?? "all"} className="space-y-3 p-4">
                {section.heading !== null && (
                  <p className="text-foreground text-sm font-semibold">
                    {section.heading}
                    <span className="text-muted font-normal">
                      {" "}
                      · {formatCount(section.rows.length)}
                    </span>
                  </p>
                )}
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeaderCell>Mix</TableHeaderCell>
                      {params.by && <TableHeaderCell>Group</TableHeaderCell>}
                      <TableHeaderCell>Per</TableHeaderCell>
                      <TableHeaderCell>Materials</TableHeaderCell>
                      <TableHeaderCell>Used by</TableHeaderCell>
                      <TableHeaderCell>Status</TableHeaderCell>
                      <TableHeaderCell></TableHeaderCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {section.rows.map((mix) => (
                      <TableRow key={mix.id}>
                        <TableCell className="text-foreground font-medium">
                          <Link href={`/estimator/mixes/${mix.id}`} className="hover:underline">
                            {mix.name}
                          </Link>
                          {mix.description && (
                            <span className="text-muted block text-xs">{mix.description}</span>
                          )}
                        </TableCell>
                        {params.by && <TableCell>{mix.groupName ?? "—"}</TableCell>}
                        <TableCell>{mix.uom}</TableCell>
                        <TableCell>
                          {mix.componentCount === 0 ? (
                            <Badge variant="warning">Nothing in it yet</Badge>
                          ) : (
                            `${mix.componentCount} ${mix.componentCount === 1 ? "material" : "materials"}`
                          )}
                        </TableCell>
                        <TableCell>
                          {mix.useCount === 0
                            ? "—"
                            : `${mix.useCount} ${mix.useCount === 1 ? "work" : "works"}`}
                        </TableCell>
                        <TableCell>
                          <Badge variant={mix.isActive ? "success" : "neutral"}>
                            {mix.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {/* A visible Edit button: the name link alone was missed. */}
                          <div className="flex justify-end">
                            <LinkButton
                              href={`/estimator/mixes/${mix.id}`}
                              variant="ghost"
                              size="sm"
                            >
                              Edit
                            </LinkButton>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            ))
          )}
        </>
      )}
    </div>
  );
}
