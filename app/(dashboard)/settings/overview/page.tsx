import { Badge } from "@/components/ui/badge";
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
import {
  listAllGrants,
  listBillApprovers,
  listIndentApprovers,
  listUsersForAdmin,
} from "@/lib/settings/queries";
import { GRANTABLE_TOOLS } from "@/lib/tools";
import Link from "next/link";
import { SettingsNav } from "../_components/settings-nav";

/**
 * Who has what, at a glance — read-only on purpose. The matrix used to
 * BE the editor, which made every column a place to mis-click; changes
 * now happen on a person's own page, and this stays the picture.
 */
export default async function SettingsOverviewPage() {
  const user = await requireUser();
  await requireAdmin(user);

  const [users, grants, indentApprovers, billApprovers] = await Promise.all([
    listUsersForAdmin(),
    listAllGrants(),
    listIndentApprovers(),
    listBillApprovers(),
  ]);

  return (
    <div className="space-y-4">
      <PageTitle title="Settings" description="Who can open what. Open a person to change it." />
      <SettingsNav active="overview" />

      <p className="text-muted text-sm">
        A dot means the app is granted. Admins hold everything without a tick.
      </p>

      {/* Sixteen tool columns don't fit a phone — the table scrolls
          inside its own box rather than the page scrolling sideways. */}
      <div className="overflow-x-auto">
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Person</TableHeaderCell>
              {GRANTABLE_TOOLS.map((tool) => (
                <TableHeaderCell key={tool.href}>{tool.name}</TableHeaderCell>
              ))}
              <TableHeaderCell>Approves</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {users.map((row) => {
              const isAdmin = row.role === "admin";
              const userGrants = grants.get(row.id) ?? new Set<string>();
              return (
                <TableRow key={row.id}>
                  <TableCell>
                    <Link
                      href={`/settings/people/${row.id}`}
                      className="text-foreground font-medium hover:underline"
                    >
                      {row.full_name ?? "No name yet"}
                    </Link>
                    <p className="text-muted mt-0.5 text-xs">{row.email}</p>
                  </TableCell>
                  {isAdmin ? (
                    <TableCell colSpan={GRANTABLE_TOOLS.length + 1}>
                      <Badge variant="info">All apps (admin)</Badge>
                    </TableCell>
                  ) : (
                    <>
                      {GRANTABLE_TOOLS.map((tool) => (
                        <TableCell key={tool.href}>
                          {userGrants.has(tool.href) ? (
                            <span
                              aria-label={`${tool.name} granted`}
                              className="bg-accent inline-block h-2 w-2 rounded-full"
                            />
                          ) : (
                            <span className="text-muted" aria-label={`${tool.name} not granted`}>
                              ·
                            </span>
                          )}
                        </TableCell>
                      ))}
                      <TableCell>
                        <div className="flex flex-wrap gap-1.5">
                          {indentApprovers.has(row.id) && <Badge variant="neutral">Indents</Badge>}
                          {billApprovers.has(row.id) && <Badge variant="neutral">Bills</Badge>}
                          {!indentApprovers.has(row.id) && !billApprovers.has(row.id) && (
                            <span className="text-muted">—</span>
                          )}
                        </div>
                      </TableCell>
                    </>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
