import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageTitle } from "@/components/ui/page-title";
import { requireAdmin } from "@/lib/auth/access";
import { requireUser } from "@/lib/auth/dal";
import { formatDate, formatMoney, formatTime } from "@/lib/format";
import { setBillApprover, setIndentApprover } from "@/lib/settings/actions";
import { describeAccessHistory } from "@/lib/settings/history";
import {
  getPersonForAdmin,
  listAccessHistory,
  listBillApprovalLimits,
  listBillApprovers,
  listGrantsForUser,
  listIndentApprovers,
} from "@/lib/settings/queries";
import { effectiveApprovalLimit, effectiveGrant } from "@/lib/settings/access-model";
import { getRole, listRoleApps, listRoles } from "@/lib/settings/roles";
import { GRANTABLE_TOOLS, type ToolGroup } from "@/lib/tools";
import { notFound } from "next/navigation";
import { AccountSwitches } from "../../_components/account-switches";
import { ApprovalLimitField } from "../../_components/approval-limit-field";
import { ApproverCheckbox } from "../../_components/approver-checkbox";
import { GrantCheckbox } from "../../_components/grant-checkbox";
import { NameField } from "../../_components/name-field";
import { RolePicker } from "../../_components/role-picker";

// Grants read as groups here rather than as one long column: sixteen
// tools in a flat list is a wall, and the groups are how the sidebar
// already organises them.
const GROUP_ORDER: ToolGroup[] = ["Operations", "Management", "People", "Events", "Admin"];

export default async function PersonPage({ params }: { params: Promise<{ personId: string }> }) {
  const user = await requireUser();
  await requireAdmin(user);
  const { personId } = await params;

  const person = await getPersonForAdmin(personId);
  if (!person) notFound();

  const [grants, indentApprovers, billApprovers, billLimits, historyRows, roles] =
    await Promise.all([
      listGrantsForUser(personId),
      listIndentApprovers(),
      listBillApprovers(),
      listBillApprovalLimits(),
      listAccessHistory(personId),
      listRoles(),
    ]);

  // The role's own bundle and rights, when they hold one.
  const [roleApps, assignedRole] = await Promise.all([
    person.role_id ? listRoleApps(person.role_id) : Promise.resolve(new Set<string>()),
    person.role_id ? getRole(person.role_id) : Promise.resolve(null),
  ]);

  const isAdmin = person.role === "admin";
  const isBillApprover = billApprovers.has(person.id);
  const effectiveBillLimit = effectiveApprovalLimit(
    { isApprover: isBillApprover, limit: billLimits.get(person.id) ?? null },
    {
      canApprove: assignedRole?.can_approve_bills ?? false,
      limit: assignedRole?.bill_approval_limit ?? null,
    },
  );
  const approvesBills = isBillApprover || (assignedRole?.can_approve_bills ?? false);
  const approvesIndents =
    indentApprovers.has(person.id) || (assignedRole?.can_approve_indents ?? false);
  const history = describeAccessHistory(historyRows);
  const groups = GROUP_ORDER.map((group) => ({
    group,
    tools: GRANTABLE_TOOLS.filter((tool) => tool.group === group),
  })).filter((entry) => entry.tools.length > 0);

  return (
    <div className="space-y-4">
      <PageTitle
        title={person.full_name ?? "No name yet"}
        backHref="/settings"
        backLabel="All people"
        description={person.email}
        actions={
          <>
            {isAdmin && <Badge variant="info">Admin</Badge>}
            {!person.is_active && <Badge variant="neutral">Deactivated</Badge>}
          </>
        }
      />

      {!person.is_active && (
        <div className="border-border bg-surface rounded-xl border px-4 py-3">
          <p className="text-foreground text-sm">
            This account is switched off — they can&apos;t sign in. Their apps and approval rights
            are kept exactly as they were, and come back the moment it&apos;s reactivated.
          </p>
        </div>
      )}

      <Card className="space-y-3 p-4">
        <p className="text-muted text-xs font-semibold tracking-widest uppercase">Name</p>
        {/* The name feeds every avatar and "approved by" line in the
            toolbox — editable here because account creation never asks
            for one. */}
        <NameField userId={person.id} name={person.full_name} />
      </Card>

      <Card className="space-y-3 p-4">
        <div>
          <p className="text-muted text-xs font-semibold tracking-widest uppercase">Account</p>
          <p className="text-muted mt-1 text-sm">
            Admins can open every app and change everyone&apos;s access. Deactivating stops someone
            signing in without deleting anything they&apos;ve done.
          </p>
        </div>
        <AccountSwitches
          userId={person.id}
          isAdmin={isAdmin}
          isActive={person.is_active}
          isSelf={person.id === user.id}
        />
      </Card>

      <Card className="space-y-3 p-4">
        <div>
          <p className="text-muted text-xs font-semibold tracking-widest uppercase">Role</p>
          <p className="text-muted mt-1 text-sm">
            A role brings a set of apps and approval rights with it. Anything ticked below is on top
            of that — a role only ever adds.
          </p>
        </div>
        <RolePicker
          userId={person.id}
          roleId={person.role_id}
          roles={roles.map((role) => ({ id: role.id, name: role.name }))}
        />
        {assignedRole && roleApps.size > 0 && (
          <p className="text-muted text-xs">
            {assignedRole.name} includes {roleApps.size} app{roleApps.size === 1 ? "" : "s"}.
          </p>
        )}
      </Card>

      <Card className="space-y-4 p-4">
        <div>
          <p className="text-muted text-xs font-semibold tracking-widest uppercase">Apps</p>
          <p className="text-muted mt-1 text-sm">
            {isAdmin
              ? "Admins can open every app — there is nothing to tick."
              : "Tick an app to let this person open it. Changes save immediately. Apps their role already includes are shown as “via role”."}
          </p>
        </div>

        {isAdmin ? (
          <Badge variant="info">All apps (admin)</Badge>
        ) : (
          <div className="space-y-4">
            {groups.map(({ group, tools }) => (
              <div key={group} className="space-y-2">
                <p className="text-foreground text-sm font-medium">{group}</p>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {tools.map((tool) => {
                    const effective = effectiveGrant(tool.href, grants, roleApps);
                    return (
                      <label
                        key={tool.href}
                        className="border-border flex items-start gap-2 rounded-lg border px-3 py-2"
                      >
                        <GrantCheckbox
                          userId={person.id}
                          app={tool.href}
                          granted={grants.has(tool.href)}
                        />
                        <span className="min-w-0">
                          <span className="text-foreground block text-sm font-medium">
                            {tool.name}
                            {!tool.built && (
                              <span className="text-muted ml-1.5 text-xs font-normal">
                                coming soon
                              </span>
                            )}
                          </span>
                          {effective.source === "role" || effective.source === "both" ? (
                            <span className="text-muted block text-xs">
                              via role
                              {effective.source === "both" ? " (and given directly)" : ""} — they
                              keep it{" "}
                              {effective.source === "both" ? "even if unticked" : "without a tick"}
                            </span>
                          ) : (
                            <span className="text-muted block text-xs">{tool.description}</span>
                          )}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="space-y-4 p-4">
        <div>
          <p className="text-muted text-xs font-semibold tracking-widest uppercase">
            Approval rights
          </p>
          <p className="text-muted mt-1 text-sm">
            {isAdmin
              ? "Admins can approve indents and bills without being on either list."
              : "Being named here is what actually lets someone approve — not just what shows them the button."}
          </p>
        </div>

        {!isAdmin && assignedRole && (approvesIndents || approvesBills) && (
          <div className="border-border bg-surface rounded-lg border px-3 py-2">
            <p className="text-foreground text-sm">
              Right now they can approve{" "}
              {[
                approvesIndents ? "indents" : null,
                approvesBills
                  ? `bills${
                      effectiveBillLimit === null
                        ? " with no limit"
                        : ` up to ${formatMoney(effectiveBillLimit)}`
                    }`
                  : null,
              ]
                .filter(Boolean)
                .join(" and ")}
              .
            </p>
            {(assignedRole.can_approve_indents || assignedRole.can_approve_bills) && (
              <p className="text-muted mt-0.5 text-xs">
                Partly from their role {assignedRole.name} — changing that role changes this.
              </p>
            )}
          </div>
        )}

        {isAdmin ? (
          <Badge variant="info">Approves everything (admin)</Badge>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="border-border flex items-start gap-2 rounded-lg border px-3 py-2">
              <ApproverCheckbox
                userId={person.id}
                isApprover={indentApprovers.has(person.id)}
                action={setIndentApprover}
                label="indent approver"
              />
              <span className="min-w-0">
                <span className="text-foreground block text-sm font-medium">Approve indents</span>
                <span className="text-muted block text-xs">
                  Also needs the Indents app to see them.
                </span>
              </span>
            </label>
            <div className="border-border space-y-2 rounded-lg border px-3 py-2">
              <label className="flex items-start gap-2">
                <ApproverCheckbox
                  userId={person.id}
                  isApprover={billApprovers.has(person.id)}
                  action={setBillApprover}
                  label="bill approver"
                />
                <span className="min-w-0">
                  <span className="text-foreground block text-sm font-medium">Approve bills</span>
                  <span className="text-muted block text-xs">
                    Also needs the Bills app to see them.
                  </span>
                </span>
              </label>
              {billApprovers.has(person.id) && (
                <div className="space-y-1 pl-6">
                  <p className="text-foreground text-xs font-medium">Up to (₹)</p>
                  <ApprovalLimitField
                    userId={person.id}
                    limit={billLimits.get(person.id) ?? null}
                  />
                  <p className="text-muted text-xs">
                    Leave blank for no limit. Bills above it wait for an admin or a higher approver.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </Card>

      <Card className="space-y-3 p-4">
        <div>
          <p className="text-muted text-xs font-semibold tracking-widest uppercase">
            Access history
          </p>
          <p className="text-muted mt-1 text-sm">
            App grants and account changes, newest first. Approver changes aren&apos;t recorded yet.
          </p>
        </div>
        {history.length === 0 ? (
          <p className="text-muted text-sm">Nothing recorded yet.</p>
        ) : (
          <ul className="space-y-2">
            {history.map((event, index) => (
              <li
                key={`${event.at}-${index}`}
                className="border-border border-b pb-2 last:border-0"
              >
                <p className="text-foreground text-sm">{event.what}</p>
                <p className="text-muted text-xs">
                  {formatDate(event.at)} {formatTime(event.at)}
                  {event.actorName ? ` · by ${event.actorName}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
