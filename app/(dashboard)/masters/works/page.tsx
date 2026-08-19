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

export default async function WorksPage() {
  const tree = await getWorksTree();
  const categories = tree.map((entry) => entry.category);
  const groups = tree.flatMap((entry) => entry.groups.map((g) => g.group));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="max-w-2xl">
          <p className="text-muted text-xs font-semibold tracking-widest uppercase">Works</p>
          <p className="text-muted mt-1 text-sm">
            The labour works the Estimator will price and schedule, in the site team&apos;s own
            codes. This is a separate list from Construction stages, which indents and budgets pick
            from. Deactivating stops new picks without touching history.
          </p>
        </div>
        <div className="flex gap-2">
          <WorkCategoryFormDialog trigger={<Button variant="secondary">New Category</Button>} />
          <WorkGroupFormDialog
            categories={categories}
            trigger={<Button variant="secondary">New Group</Button>}
          />
          <WorkItemFormDialog categories={categories} groups={groups} />
        </div>
      </div>

      {tree.length === 0 ? (
        <EmptyState
          icon={Hammer}
          title="No works yet"
          description="Add the first category, then its works."
        />
      ) : (
        <>
          {/* ~230 rows on one page: fine to render, not to scroll blind. */}
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
                      {directItems.map((item) => (
                        <WorkItemTableRow
                          key={item.id}
                          item={item}
                          categories={categories}
                          groups={groups}
                        />
                      ))}
                      {categoryGroups.map(({ group, items }) => (
                        <GroupRows
                          key={group.id}
                          group={group}
                          items={items}
                          categories={categories}
                          groups={groups}
                        />
                      ))}
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
      <TableCell className="text-foreground text-sm">{item.name}</TableCell>
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
