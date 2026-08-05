/**
 * Turning audit_log rows about one person's access into sentences.
 *
 * Pure on purpose (the house rule: tests cover logic, never the
 * database) — the query hands over rows, this decides what they say.
 * Only the shapes Settings actually writes are described; anything else
 * falls back to a plain "changed" line rather than inventing a story.
 */

export type AccessAuditRow = {
  table_name: string;
  action: string;
  at: string;
  /** profiles.full_name of whoever made the change, when known. */
  actorName: string | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
};

export type AccessEvent = {
  /** The sentence, without the actor or date. */
  what: string;
  actorName: string | null;
  at: string;
};

function field(data: Record<string, unknown> | null, key: string): string | null {
  const value = data?.[key];
  return typeof value === "string" ? value : null;
}

/** "/purchase-orders" → "Purchase orders" — readable without a tools lookup. */
export function appLabel(app: string): string {
  const slug = app.replace(/^\//, "").replace(/-/g, " ");
  return slug.charAt(0).toUpperCase() + slug.slice(1);
}

export function describeAccessEvent(row: AccessAuditRow): AccessEvent | null {
  const base = { actorName: row.actorName, at: row.at };

  if (row.table_name === "user_apps") {
    const app = field(row.new_data, "app") ?? field(row.old_data, "app");
    if (!app) return null;
    if (row.action === "INSERT") return { ...base, what: `Granted ${appLabel(app)}` };
    if (row.action === "DELETE") return { ...base, what: `Removed ${appLabel(app)}` };
    return null;
  }

  if (row.table_name === "profiles") {
    // An UPDATE can touch several columns at once; report each real
    // change rather than the first one found, so nothing goes unseen.
    const changes: string[] = [];

    const oldName = field(row.old_data, "full_name");
    const newName = field(row.new_data, "full_name");
    if (row.action === "UPDATE" && oldName !== newName) {
      changes.push(newName ? `Name set to "${newName}"` : "Name cleared");
    }

    const oldRole = field(row.old_data, "role");
    const newRole = field(row.new_data, "role");
    if (row.action === "UPDATE" && oldRole !== newRole && newRole) {
      changes.push(newRole === "admin" ? "Made an admin" : "Admin removed");
    }

    const oldActive = row.old_data?.is_active;
    const newActive = row.new_data?.is_active;
    if (row.action === "UPDATE" && oldActive !== newActive && typeof newActive === "boolean") {
      changes.push(newActive ? "Reactivated" : "Deactivated");
    }

    if (row.action === "INSERT") return { ...base, what: "Account created" };
    if (changes.length === 0) return null;
    return { ...base, what: changes.join(" · ") };
  }

  return null;
}

/** The whole log for one person, newest first, unexplainable rows dropped. */
export function describeAccessHistory(rows: AccessAuditRow[]): AccessEvent[] {
  return rows.map(describeAccessEvent).filter((event): event is AccessEvent => event !== null);
}
