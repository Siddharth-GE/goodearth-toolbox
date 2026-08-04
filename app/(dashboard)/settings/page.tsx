import { PageTitle } from "@/components/ui/page-title";
import { ApproverCheckbox } from "./_components/approver-checkbox";
import { GrantCheckbox } from "./_components/grant-checkbox";
import { NameField } from "./_components/name-field";
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
import { setBillApprover, setIndentApprover } from "@/lib/settings/actions";
import {
  listAllGrants,
  listBillApprovers,
  listIndentApprovers,
  listUsersForAdmin,
} from "@/lib/settings/queries";
import { GRANTABLE_TOOLS } from "@/lib/tools";

export default async function SettingsPage() {
  const user = await requireUser();
  await requireAdmin(user);

  const [users, grants, approvers, billApprovers] = await Promise.all([
    listUsersForAdmin(),
    listAllGrants(),
    listIndentApprovers(),
    listBillApprovers(),
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
            <TableHeaderCell>
              Approve bills
              <span className="text-muted block text-[10px] font-normal tracking-normal normal-case">
                Also needs the Bills app
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
                  {/* The name feeds every avatar and "approved by" line
                      in the toolbox — editable here because account
                      creation never asks for one. */}
                  <NameField userId={row.id} name={row.full_name} />
                  <p className="text-muted mt-1 text-xs">{row.email}</p>
                </TableCell>
                {row.role === "admin" ? (
                  // +2 spans the two approver columns too: admins can
                  // always approve, without a row on either list.
                  <TableCell colSpan={GRANTABLE_TOOLS.length + 2}>
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
                      <ApproverCheckbox
                        userId={row.id}
                        isApprover={approvers.has(row.id)}
                        action={setIndentApprover}
                        label="indent approver"
                      />
                    </TableCell>
                    <TableCell>
                      <ApproverCheckbox
                        userId={row.id}
                        isApprover={billApprovers.has(row.id)}
                        action={setBillApprover}
                        label="bill approver"
                      />
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
