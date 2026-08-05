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
import { formatMoney } from "@/lib/format";
import { effectiveGrant } from "@/lib/settings/access-model";
import { listRoles } from "@/lib/settings/roles";
import {
  listAllGrants,
  listBillApprovalLimits,
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

  const [users, grants, indentApprovers, billApprovers, billLimits, roles] = await Promise.all([
    listUsersForAdmin(),
    listAllGrants(),
    listIndentApprovers(),
    listBillApprovers(),
    listBillApprovalLimits(),
    listRoles(),
  ]);
  const roleById = new Map(roles.map((role) => [role.id, role]));

  return (
    <div className="space-y-4">
      <PageTitle title="Settings" description="Who can open what. Open a person to change it." />
      <SettingsNav active="overview" />

      <p className="text-muted text-sm">
        A filled dot is an app given to the person directly; a ring is one their role brings. Admins
        hold everything without either.
      </p>

      {/* Sixteen tool columns don't fit a phone — the table scrolls
          inside its own box rather than the page scrolling sideways. */}
      <div className="overflow-x-auto">
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Person</TableHeaderCell>
              <TableHeaderCell>Role</TableHeaderCell>
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
              const personRole = row.role_id ? roleById.get(row.role_id) : undefined;
              const roleApps = new Set(personRole?.apps ?? []);
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
                  <TableCell>
                    {personRole ? personRole.name : <span className="text-muted">—</span>}
                  </TableCell>
                  {isAdmin ? (
                    <TableCell colSpan={GRANTABLE_TOOLS.length + 1}>
                      <Badge variant="info">All apps (admin)</Badge>
                    </TableCell>
                  ) : (
                    <>
                      {GRANTABLE_TOOLS.map((tool) => {
                        const effective = effectiveGrant(tool.href, userGrants, roleApps);
                        return (
                          <TableCell key={tool.href}>
                            {!effective.granted ? (
                              <span className="text-muted" aria-label={`${tool.name} not granted`}>
                                ·
                              </span>
                            ) : effective.source === "role" ? (
                              <span
                                aria-label={`${tool.name} granted via role`}
                                className="border-accent inline-block h-2 w-2 rounded-full border-2"
                              />
                            ) : (
                              <span
                                aria-label={`${tool.name} granted`}
                                className="bg-accent inline-block h-2 w-2 rounded-full"
                              />
                            )}
                          </TableCell>
                        );
                      })}
                      <TableCell>
                        <div className="flex flex-wrap gap-1.5">
                          {(indentApprovers.has(row.id) ||
                            (personRole?.can_approve_indents ?? false)) && (
                            <Badge variant="neutral">Indents</Badge>
                          )}
                          {(billApprovers.has(row.id) ||
                            (personRole?.can_approve_bills ?? false)) && (
                            <Badge variant="neutral">
                              Bills
                              {billLimits.get(row.id) != null
                                ? ` up to ${formatMoney(billLimits.get(row.id))}`
                                : ""}
                            </Badge>
                          )}
                          {!indentApprovers.has(row.id) &&
                            !billApprovers.has(row.id) &&
                            !personRole?.can_approve_indents &&
                            !personRole?.can_approve_bills && <span className="text-muted">—</span>}
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
