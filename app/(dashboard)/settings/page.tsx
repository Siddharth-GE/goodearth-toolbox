import { PageTitle } from "@/components/ui/page-title";
import { ApproverCheckbox } from "./_components/approver-checkbox";
import { GrantCheckbox } from "./_components/grant-checkbox";
import { Badge } from "@/components/ui/badge";
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
import { listAllGrants, listIndentApprovers, listUsersForAdmin } from "@/lib/settings/queries";
import { GRANTABLE_TOOLS } from "@/lib/tools";

export default async function SettingsPage() {
  const user = await requireUser();
  await requireAdmin(user);

  const [users, grants, approvers] = await Promise.all([
    listUsersForAdmin(),
    listAllGrants(),
    listIndentApprovers(),
  ]);

  return (
    <div className="space-y-4">
      <PageTitle
        title="Settings"
        description="Choose which apps each person can open. Admins always have every app."
      />

      <Table>
        <TableHead>
          <TableRow>
            <TableHeaderCell>Person</TableHeaderCell>
            {GRANTABLE_TOOLS.map((tool) => (
              <TableHeaderCell key={tool.href}>{tool.name}</TableHeaderCell>
            ))}
            <TableHeaderCell>
              Approve indents
              <span className="text-muted block text-[10px] font-normal tracking-normal normal-case">
                Also needs the Indents app
              </span>
            </TableHeaderCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {users.map((row) => {
            const userGrants = grants.get(row.id) ?? new Set<string>();
            return (
              <TableRow key={row.id}>
                <TableCell>
                  <p className="text-foreground font-medium">{row.full_name || row.email}</p>
                  <p className="text-muted text-xs">{row.email}</p>
                </TableCell>
                {row.role === "admin" ? (
                  // +1 spans the "Approve indents" column too: admins can
                  // always approve, without a row on the approvers list.
                  <TableCell colSpan={GRANTABLE_TOOLS.length + 1}>
                    <Badge variant="info">All apps (admin)</Badge>
                  </TableCell>
                ) : (
                  <>
                    {GRANTABLE_TOOLS.map((tool) => (
                      <TableCell key={tool.href}>
                        <GrantCheckbox
                          userId={row.id}
                          app={tool.href}
                          granted={userGrants.has(tool.href)}
                        />
                      </TableCell>
                    ))}
                    <TableCell>
                      <ApproverCheckbox userId={row.id} isApprover={approvers.has(row.id)} />
                    </TableCell>
                  </>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
