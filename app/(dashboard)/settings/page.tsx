import { Badge } from "@/components/ui/badge";
import { Button, LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageTitle } from "@/components/ui/page-title";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import { requireAdmin } from "@/lib/auth/access";
import { requireUser } from "@/lib/auth/dal";
import { formatMoney } from "@/lib/format";
import {
  listAllGrants,
  listBillApprovalLimits,
  listBillApprovers,
  listIndentApprovers,
  listUsersForAdmin,
} from "@/lib/settings/queries";
import { Users } from "lucide-react";
import Link from "next/link";
import { InviteDialog } from "./_components/invite-dialog";
import { SettingsNav } from "./_components/settings-nav";

export default async function SettingsPeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await requireUser();
  await requireAdmin(user);
  const { q } = await searchParams;

  const [users, grants, indentApprovers, billApprovers, billLimits] = await Promise.all([
    listUsersForAdmin(),
    listAllGrants(),
    listIndentApprovers(),
    listBillApprovers(),
    listBillApprovalLimits(),
  ]);

  // ~70 people: filtering in memory is honest here — listUsersForAdmin
  // already returns everyone, so there's no second read to save.
  const needle = (q ?? "").trim().toLowerCase();
  const people = needle
    ? users.filter(
        (row) =>
          (row.full_name ?? "").toLowerCase().includes(needle) ||
          row.email.toLowerCase().includes(needle),
      )
    : users;

  return (
    <div className="space-y-4">
      <PageTitle
        title="Settings"
        description="Everyone with an account, and what each of them can open."
      />
      <SettingsNav active="people" />

      <div className="flex flex-wrap items-end justify-between gap-2">
        <form action="/settings" className="flex flex-wrap items-end gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="q">Search</Label>
            <Input
              id="q"
              name="q"
              defaultValue={q ?? ""}
              placeholder="Name or email…"
              autoComplete="off"
            />
          </div>
          <Button type="submit" variant="secondary">
            Search
          </Button>
          {q && (
            <LinkButton href="/settings" variant="ghost">
              Clear
            </LinkButton>
          )}
        </form>
        <div className="flex items-center gap-3">
          <p className="text-muted text-sm">
            {people.length} of {users.length}
          </p>
          <InviteDialog />
        </div>
      </div>

      {people.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Nobody found"
          description="Try a different name or email."
        />
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Person</TableHeaderCell>
              <TableHeaderCell>Apps</TableHeaderCell>
              <TableHeaderCell>Can approve</TableHeaderCell>
              <TableHeaderCell></TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {people.map((row) => {
              const isAdmin = row.role === "admin";
              const appCount = grants.get(row.id)?.size ?? 0;
              return (
                <TableRow key={row.id}>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/settings/people/${row.id}`}
                        className="text-foreground font-medium hover:underline"
                      >
                        {row.full_name ?? "No name yet"}
                      </Link>
                      {!row.is_active && <Badge variant="neutral">Deactivated</Badge>}
                    </div>
                    <p className="text-muted mt-0.5 text-xs">{row.email}</p>
                  </TableCell>
                  <TableCell>
                    {isAdmin ? (
                      <Badge variant="info">All apps (admin)</Badge>
                    ) : appCount === 0 ? (
                      <span className="text-muted">no apps yet</span>
                    ) : (
                      `${appCount} app${appCount === 1 ? "" : "s"}`
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1.5">
                      {isAdmin || indentApprovers.has(row.id) ? (
                        <Badge variant="neutral">Indents</Badge>
                      ) : null}
                      {isAdmin || billApprovers.has(row.id) ? (
                        <Badge variant="neutral">
                          Bills
                          {!isAdmin && billLimits.get(row.id) != null
                            ? ` up to ${formatMoney(billLimits.get(row.id))}`
                            : ""}
                        </Badge>
                      ) : null}
                      {!isAdmin && !indentApprovers.has(row.id) && !billApprovers.has(row.id) && (
                        <span className="text-muted">—</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <LinkButton href={`/settings/people/${row.id}`} variant="secondary">
                      Manage
                    </LinkButton>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
