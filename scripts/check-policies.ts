/**
 * Asks one database whether its row-level security still holds the rules
 * SECURITY.md states. Read-only; CI runs it beside db:check-views.
 *
 *   npx tsx scripts/check-policies.ts --project <ref>
 *
 *   - row-level security on every table in public;
 *   - no policy reads profiles.role itself (is_admin() carries the second factor, BUGCATCHER #22);
 *   - one permissive SELECT policy per table (CLAUDE.md: widen the qual, never add a second);
 *   - every check a policy calls is wrapped as (select …), so it runs once per query, not per row (0139);
 *   - every security-definer function sets search_path, and, if a client role can call it,
 *     checks a grant or is a trigger or a named exception below;
 *   - nothing in public is executable by anon (an extension's own functions aside).
 *   - a deletable master whose children cascade or blank carries a delete guard (0150).
 */
import { requireProjectRef, sql } from "./supabase-management";

/** Definers that answer without a grant check on purpose (SECURITY.md, _Definer exceptions_). */
const NO_GRANT_CHECK = new Set([
  "is_admin",
  "has_app",
  "is_lead",
  "session_is_verified",
  "profile_is_active",
  "pusher_current_stage",
  "stock_qty_on_hand",
]);

/** The shared masters an admin may delete while unused (0150). */
const MASTERS = [
  "projects",
  "plots",
  "units",
  "clients",
  "vendors",
  "items",
  "stores",
  "companies",
  "document_terms",
  "item_categories",
  "brands",
  "construction_stages",
  "progress_stages",
  "uoms",
  "work_categories",
  "work_groups",
  "work_items",
];

const GRANT_WORDS = ["has_app(", "is_admin(", "is_lead(", "auth.uid("];

type Row = Record<string, string | number | boolean | null>;

async function main() {
  const ref = requireProjectRef(process.argv.slice(2));
  const problems: string[] = [];
  const ask = (query: string) => sql<Row>(ref, query);

  for (const row of await ask(`
    select c.relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`)) {
    problems.push(`row-level security is off on ${row.name}`);
  }

  for (const row of await ask(`
    select tablename, policyname from pg_policies
     where schemaname = 'public'
       and (position('.role =' in coalesce(qual, '') || coalesce(with_check, '')) > 0
         or position('(role =' in coalesce(qual, '') || coalesce(with_check, '')) > 0)`)) {
    problems.push(
      `${row.tablename}: policy "${row.policyname}" reads profiles.role itself; use is_admin()`,
    );
  }

  for (const row of await ask(`
    select tablename, count(*)::int as n from pg_policies
     where schemaname = 'public' and permissive = 'PERMISSIVE' and cmd in ('SELECT', 'ALL')
     group by tablename having count(*) > 1`)) {
    problems.push(`${row.tablename}: ${row.n} permissive SELECT policies; widen one qual instead`);
  }

  // A bare check runs once per row read; (select check(...)) runs once per query (0139).
  for (const row of await ask(`
    select tablename, policyname from pg_policies
     where schemaname = 'public'
       and coalesce(qual, '') || ' ' || coalesce(with_check, '')
           ~ '(?<!SELECT )((has_app|is_lead)\\(''[^'']*''::text\\)|session_is_verified\\(\\)|is_admin\\(\\)|auth\\.uid\\(\\))'`)) {
    problems.push(
      `${row.tablename}: policy "${row.policyname}" calls a check once per row; wrap it as (select …)`,
    );
  }

  const definers = await ask(`
    select p.proname as name,
           pg_get_function_result(p.oid) as returns,
           pg_get_functiondef(p.oid) as body,
           exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%') as pinned,
           (has_function_privilege('authenticated', p.oid, 'execute')
             or has_function_privilege('anon', p.oid, 'execute')) as callable
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef`);
  for (const fn of definers) {
    const name = String(fn.name);
    if (!fn.pinned) problems.push(`${name}: security definer without search_path`);
    const isTrigger = fn.returns === "trigger" || fn.returns === "event_trigger";
    const checksGrant = GRANT_WORDS.some((word) => String(fn.body).includes(word));
    if (fn.callable && !isTrigger && !checksGrant && !NO_GRANT_CHECK.has(name)) {
      problems.push(`${name}: security definer that checks no grant`);
    }
  }

  for (const row of await ask(`
    select p.proname as name from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')
       and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
     order by 1`)) {
    problems.push(`${row.name}: executable by anon`);
  }

  // A deletable master whose children cascade or blank needs a <table>_delete_guard (0150); a unit's guard deletes its
  // plot record, so nothing may cascade off that record but its seeded schedule, or off the schedule at all.
  for (const row of await ask(`
    select k.confrelid::regclass::text as parent, k.conrelid::regclass::text as child
      from pg_constraint k
     where k.contype = 'f' and k.confdeltype in ('c', 'n', 'd')
       and exists (select 1 from pg_policies p
                    where p.schemaname = 'public' and p.tablename = k.confrelid::regclass::text
                      and p.cmd in ('DELETE', 'ALL'))
       and k.confrelid::regclass::text in (${MASTERS.map((t) => `'${t}'`).join(", ")})
       and not exists (select 1 from pg_trigger t
                        where t.tgrelid = k.confrelid and t.tgenabled <> 'D'
                          and t.tgname = k.confrelid::regclass::text || '_delete_guard')
    union all
    select k.confrelid::regclass::text, k.conrelid::regclass::text
      from pg_constraint k
     where k.contype = 'f' and k.confdeltype in ('c', 'n', 'd')
       and k.confrelid::regclass::text in ('client_engagements', 'client_payment_milestones')
       and (k.confrelid::regclass::text, k.conrelid::regclass::text)
           <> ('client_engagements', 'client_payment_milestones')
       and exists (select 1 from pg_trigger t where t.tgname = 'units_delete_guard')
     order by 1, 2`)) {
    problems.push(
      `${row.parent} → ${row.child}: a delete would cascade or blank it with no guard to refuse`,
    );
  }

  if (problems.length > 0) {
    for (const problem of problems) console.error(problem);
    console.error(`\n${problems.length} problem(s) in ${ref}'s row-level security.`);
    process.exitCode = 1;
    return;
  }
  console.log(`${ref}: row-level security holds every rule checked.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
