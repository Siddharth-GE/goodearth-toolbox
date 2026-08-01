import { PageTitle } from "@/components/ui/page-title";
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
import { listAllGrants, listUsersForAdmin } from "@/lib/settings/queries";
import { GRANTABLE_TOOLS } from "@/lib/tools";

export default async function SettingsPage() {
  const user = await requireUser();
  await requireAdmin(user);

  const [users, grants] = await Promise.all([listUsersForAdmin(), listAllGrants()]);

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
                  <TableCell colSpan={GRANTABLE_TOOLS.length}>
                    <Badge variant="info">All apps (admin)</Badge>
                  </TableCell>
                ) : (
                  GRANTABLE_TOOLS.map((tool) => (
                    <TableCell key={tool.href}>
                      <GrantCheckbox
                        userId={row.id}
                        app={tool.href}
                        granted={userGrants.has(tool.href)}
                      />
                    </TableCell>
                  ))
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
