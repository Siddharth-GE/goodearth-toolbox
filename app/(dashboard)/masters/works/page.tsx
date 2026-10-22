import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import { NavTabs } from "@/components/ui/tabs";
import { WORK_FAMILIES, isWorkFamily } from "@/lib/masters/work-families";
import { PACKAGE } from "@/lib/masters/works-workbook";
import {
  getWorksTree,
  type WorkCategoryRow,
  type WorkGroupRow,
  type WorkItemRow,
} from "@/lib/masters/works";
import { Hammer } from "lucide-react";
import {
  WorkCategoryFormDialog,
  WorkGroupFormDialog,
  WorkItemFormDialog,
  WorksToggle,
} from "./_components/works-forms";

export default async function WorksPage({
  searchParams,
}: {
  searchParams: Promise<{ family?: string }>;
}) {
  const { family: asked } = await searchParams;
  const family = asked && isWorkFamily(asked) ? asked : "Buildings";
  const everything = await getWorksTree();
  const tree = everything.filter((entry) => entry.category.family === family);
  const categories = everything.map((entry) => entry.category);
  const groups = everything.flatMap((entry) => entry.groups.map((g) => g.group));
  const workCount = (f: string) =>
    everything
      .filter((entry) => entry.category.family === f)
      .reduce(
        (n, e) => n + e.directItems.length + e.groups.reduce((m, g) => m + g.items.length, 0),
        0,
      );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="max-w-2xl">
          <p className="text-muted text-[11px] font-medium tracking-[0.14em] uppercase">Works</p>
          <p className="text-muted mt-1 text-sm">
            Every work on the estate, in the site team&apos;s own codes: site mobilisation,
            infrastructure, the buildings and maintenance. A &ldquo;{PACKAGE}&rdquo; work is a
            stage&apos;s share of the rate per square foot, which an estimate measures. This is a
            separate list from Construction stages, which indents and budgets pick from.
            Deactivating stops new picks without touching history.
          </p>
        </div>
        <div className="flex gap-2">
          <WorkCategoryFormDialog
            defaultFamily={family}
            trigger={<Button variant="secondary">New Category</Button>}
          />
          <WorkGroupFormDialog
            categories={categories}
            trigger={<Button variant="secondary">New Group</Button>}
          />
          <WorkItemFormDialog categories={categories} groups={groups} />
        </div>
      </div>

      <NavTabs
        active={family}
        tabs={WORK_FAMILIES.map((f) => ({
          key: f,
          href: `/masters/works?family=${encodeURIComponent(f)}`,
          label: `${f} · ${workCount(f)}`,
        }))}
      />

      {tree.length === 0 ? (
        <EmptyState
          icon={Hammer}
          title={`No ${family} works yet`}
          description="Add the first category, then its works."
        />
      ) : (
        <>
          <nav aria-label="Jump to category" className="flex flex-wrap gap-2">
            {tree.map(({ category }) => (
              <a
                key={category.id}
                href={`#cat-${category.code}`}
                className="text-muted hover:text-foreground text-xs font-medium tracking-wide uppercase hover:underline"
              >
                {category.code}
              </a>
            ))}
          </nav>

          {tree.map(({ category, directItems, groups: categoryGroups }) => {
            const itemCount =
              directItems.length + categoryGroups.reduce((n, g) => n + g.items.length, 0);
            // Direct items and groups interleave in code order, as in the site team's sheet.
            const entries = [
              ...directItems.map((item) => ({ sort: item.sort_order, code: item.code, item })),
              ...categoryGroups.map((g) => ({
                sort: g.group.sort_order,
                code: g.group.code,
                group: g,
              })),
            ].sort((a, b) => a.sort - b.sort || a.code.localeCompare(b.code));
            return (
              <Card
                key={category.id}
                id={`cat-${category.code}`}
                className="scroll-mt-4 space-y-3 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <p className="text-foreground text-sm font-semibold">
                      {category.code} — {category.name}
                    </p>
                    <Badge variant="neutral">
                      {itemCount} {itemCount === 1 ? "work" : "works"}
                    </Badge>
                    {!category.is_active && <Badge variant="warning">Inactive</Badge>}
                  </div>
                  <div className="flex items-center gap-1">
                    <WorkItemFormDialog
                      categories={categories}
                      groups={groups}
                      defaultCategoryId={category.id}
                      trigger={
                        <Button variant="ghost" size="sm">
                          Add work
                        </Button>
                      }
                    />
                    <WorkGroupFormDialog
                      categories={categories}
                      defaultCategoryId={category.id}
                      trigger={
                        <Button variant="ghost" size="sm">
                          Add group
                        </Button>
                      }
                    />
                    <WorkCategoryFormDialog
                      category={category}
                      trigger={
                        <Button variant="ghost" size="sm">
                          Edit
                        </Button>
                      }
                    />
                    <WorksToggle kind="category" id={category.id} isActive={category.is_active} />
                  </div>
                </div>

                {itemCount === 0 && categoryGroups.length === 0 ? (
                  <p className="text-muted text-sm">No works under this category yet.</p>
                ) : (
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableHeaderCell className="w-24">Code</TableHeaderCell>
                        <TableHeaderCell>Description</TableHeaderCell>
                        <TableHeaderCell>Status</TableHeaderCell>
                        <TableHeaderCell></TableHeaderCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {entries.map((entry) =>
                        "item" in entry ? (
                          <WorkItemTableRow
                            key={entry.item.id}
                            item={entry.item}
                            categories={categories}
                            groups={groups}
                          />
                        ) : (
                          <GroupRows
                            key={entry.group.group.id}
                            group={entry.group.group}
                            items={entry.group.items}
                            categories={categories}
                            groups={groups}
                          />
                        ),
                      )}
                    </TableBody>
                  </Table>
                )}
              </Card>
            );
          })}
        </>
      )}
    </div>
  );
}

function GroupRows({
  group,
  items,
  categories,
  groups,
}: {
  group: WorkGroupRow;
  items: WorkItemRow[];
  categories: WorkCategoryRow[];
  groups: WorkGroupRow[];
}) {
  return (
    <>
      <TableRow className="bg-background">
        <TableCell className="text-muted text-xs font-semibold">{group.code}</TableCell>
        <TableCell className="text-foreground text-xs font-semibold tracking-wide uppercase">
          {group.name}
        </TableCell>
        <TableCell>{!group.is_active && <Badge variant="warning">Inactive</Badge>}</TableCell>
        <TableCell>
          <div className="flex items-center justify-end gap-1">
            <WorkGroupFormDialog
              categories={categories}
              group={group}
              trigger={
                <Button variant="ghost" size="sm">
                  Edit
                </Button>
              }
            />
            <WorksToggle kind="group" id={group.id} isActive={group.is_active} />
          </div>
        </TableCell>
      </TableRow>
      {items.map((item) => (
        <WorkItemTableRow key={item.id} item={item} categories={categories} groups={groups} />
      ))}
    </>
  );
}

function WorkItemTableRow({
  item,
  categories,
  groups,
}: {
  item: WorkItemRow;
  categories: WorkCategoryRow[];
  groups: WorkGroupRow[];
}) {
  return (
    <TableRow>
      <TableCell className="text-muted text-sm">{item.code}</TableCell>
      <TableCell className="text-foreground text-sm">
        {item.name.endsWith(` — ${PACKAGE}`) ? (
          <span className="flex flex-wrap items-center gap-2">
            {item.name.slice(0, -` — ${PACKAGE}`.length)}
            <Badge variant="info">Package per sqft</Badge>
          </span>
        ) : (
          item.name
        )}
      </TableCell>
      <TableCell>
        <Badge variant={item.is_active ? "success" : "neutral"}>
          {item.is_active ? "Active" : "Inactive"}
        </Badge>
      </TableCell>
      <TableCell>
        <div className="flex items-center justify-end gap-1">
          <WorkItemFormDialog
            categories={categories}
            groups={groups}
            item={item}
            trigger={
              <Button variant="ghost" size="sm">
                Edit
              </Button>
            }
          />
          <WorksToggle kind="item" id={item.id} isActive={item.is_active} />
        </div>
      </TableCell>
    </TableRow>
  );
}
