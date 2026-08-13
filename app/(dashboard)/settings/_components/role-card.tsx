"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney } from "@/lib/format";
import { addRoleApp, deleteRole, removeRoleApp, updateRole } from "@/lib/settings/roles-actions";
import type { RoleWithApps } from "@/lib/settings/roles";
import type { Tool, ToolGroup } from "@/lib/tools";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";

/**
 * One role: its name and approval rights as a small save-on-submit
 * form, and its app bundle as toggles that save immediately (the
 * GrantCheckbox pattern — controlled, rolled back if the server
 * disagrees).
 *
 * Editing a bundle changes what everyone holding the role can open, on
 * their very next page load — nothing is copied, so nothing can drift.
 */
export function RoleCard({
  role,
  groups,
}: {
  role: RoleWithApps;
  groups: { group: ToolGroup; tools: Tool[] }[];
}) {
  const [state, formAction, pending] = useActionState(updateRole.bind(null, role.id), undefined);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, startDelete] = useTransition();
  const [deleteError, setDeleteError] = useState<string>();
  const [approvesBills, setApprovesBills] = useState(role.can_approve_bills);
  const [saved, setSaved] = useState(false);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state?.error) {
      setSaved(true);
      const timer = setTimeout(() => setSaved(false), 2000);
      return () => clearTimeout(timer);
    }
    wasPending.current = pending;
  }, [pending, state]);

  return (
    <Card className="space-y-4 p-4">
      <form action={formAction} className="space-y-3">
        <fieldset disabled={pending} className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div className="space-y-1.5">
              <Label htmlFor={`name-${role.id}`}>Role name</Label>
              <Input
                id={`name-${role.id}`}
                name="name"
                defaultValue={role.name}
                required
                autoComplete="off"
                className="max-w-56"
              />
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="neutral">
                {role.memberCount} {role.memberCount === 1 ? "person" : "people"}
              </Badge>
              <Button type="submit" variant="secondary">
                {pending ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-4">
            <label className="text-foreground flex items-center gap-2 text-sm">
              <Checkbox
                name="can_approve_indents"
                value="1"
                defaultChecked={role.can_approve_indents}
              />
              Approves indents
            </label>
            <label className="text-foreground flex items-center gap-2 text-sm">
              <Checkbox
                name="can_approve_bills"
                value="1"
                checked={approvesBills}
                onChange={(event) => setApprovesBills(event.target.checked)}
              />
              Approves bills
            </label>
            {approvesBills && (
              <div className="space-y-1.5">
                <Label htmlFor={`limit-${role.id}`}>Up to (₹)</Label>
                <Input
                  id={`limit-${role.id}`}
                  name="bill_approval_limit"
                  defaultValue={
                    role.bill_approval_limit === null ? "" : String(role.bill_approval_limit)
                  }
                  placeholder="No limit"
                  inputMode="decimal"
                  className="max-w-36"
                />
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <FormMessage error={state?.error} size="xs" />
            {saved && <FormMessage success="Saved" size="xs" />}
          </div>
        </fieldset>
      </form>

      <div className="space-y-3">
        <p className="text-muted text-xs font-semibold tracking-widest uppercase">
          Apps in this role
        </p>
        {groups.map(({ group, tools }) => (
          <div key={group} className="space-y-2">
            <p className="text-foreground text-sm font-medium">{group}</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {tools.map((tool) => (
                <RoleAppToggle
                  key={tool.href}
                  roleId={role.id}
                  app={tool.href}
                  label={tool.name}
                  warning={tool.grantWarning}
                  inBundle={role.apps.includes(tool.href)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="border-border flex flex-wrap items-center gap-2 border-t pt-3">
        {confirmingDelete ? (
          <>
            <span className="text-muted text-xs">
              Delete this role? People holding it must be moved first.
            </span>
            <Button
              variant="ghost"
              size="sm"
              disabled={deleting}
              onClick={() => setConfirmingDelete(false)}
            >
              Keep it
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="text-danger"
              disabled={deleting}
              onClick={() =>
                startDelete(async () => {
                  const result = await deleteRole(role.id);
                  if (result?.error) setDeleteError(result.error);
                  setConfirmingDelete(false);
                })
              }
            >
              {deleting ? "Deleting…" : "Delete role"}
            </Button>
          </>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => setConfirmingDelete(true)}>
            Delete role
          </Button>
        )}
        <FormMessage error={deleteError} size="xs" />
      </div>

      {role.can_approve_bills && (
        <p className="text-muted text-xs">
          Anyone with this role can approve bills
          {role.bill_approval_limit === null
            ? " with no limit."
            : ` up to ${formatMoney(role.bill_approval_limit)}.`}
        </p>
      )}
    </Card>
  );
}

function RoleAppToggle({
  roleId,
  app,
  label,
  warning,
  inBundle,
}: {
  roleId: string;
  app: string;
  label: string;
  /** The tool's grantWarning — a role hands the grant to everyone in it. */
  warning?: string;
  inBundle: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  // Controlled, like GrantCheckbox: the state the server confirmed,
  // rolled back when it disagrees.
  const [checked, setChecked] = useState(inBundle);
  const [error, setError] = useState<string>();

  return (
    <label className="border-border flex items-start gap-2 rounded-lg border px-3 py-2">
      <Checkbox
        checked={checked}
        disabled={isPending}
        aria-label={`${checked ? "Remove" : "Add"} ${label}`}
        onChange={(event) => {
          const next = event.target.checked;
          setChecked(next);
          setError(undefined);
          startTransition(async () => {
            const result = next ? await addRoleApp(roleId, app) : await removeRoleApp(roleId, app);
            if (result?.error) {
              setChecked(!next);
              setError(result.error);
            }
          });
        }}
      />
      <span className="min-w-0">
        <span className="text-foreground block text-sm font-medium">{label}</span>
        {warning && <span className="text-warning block text-xs font-medium">{warning}</span>}
        {error && (
          <span role="alert" className="text-danger block text-xs">
            {error}
          </span>
        )}
      </span>
    </label>
  );
}
