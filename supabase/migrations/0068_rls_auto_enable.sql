-- 0068 — write down the safety net that was only ever a manual click
--
-- Why this exists
-- ---------------
-- CLAUDE.md says "RLS on for every table, always. A new table without
-- policies is a bug." The original database has been enforcing that in
-- the database itself since some point in its history: an event trigger
-- called `ensure_rls` that fires after any DDL and turns row level
-- security on for every table created in `public`.
--
-- It is in no migration. It was created by hand, and nobody wrote it
-- down — so when a second database was built on 17 Aug 2026 by replaying
-- all sixty-seven migrations, it came up **without** the safety net. The
-- two databases were identical in every column, policy, index and grant,
-- and differed in exactly one thing: the fresh one would happily accept a
-- new table with RLS off.
--
-- That is worth pausing on, because it is the whole argument for having a
-- schema comparison at all. Nothing would have failed. No test, no build,
-- no screen. The rule would simply have stopped being enforced on the
-- database that matters, and the first anyone knew of it would be a table
-- readable by every signed-in user.
--
-- What it does
-- ------------
-- After any `create table` in `public`, run `alter table ... enable row
-- level security`. Failures are logged, never raised — a safety net that
-- can abort a migration is worse than no safety net.
--
-- What it is NOT
-- --------------
-- Not a substitute for writing policies. RLS with no policies denies
-- everything to every signed-in role, which is a safe default and a
-- useless table. The rule is still "a new table without policies is a
-- bug"; this only guarantees the failure mode is locked, not open.
--
-- Reproduced verbatim from the original database, so the two match.
--
-- Safe to run twice: `create or replace`, `drop ... if exists`.

create or replace function public.rls_auto_enable()
  returns event_trigger
  language plpgsql
  security definer
  set search_path to 'pg_catalog'
as $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

-- The rulebook's rule for every new function. An event trigger function
-- cannot be called from SQL at all — its return type forbids it — so this
-- is belt and braces, kept for consistency with every other function here.
revoke execute on function public.rls_auto_enable() from public, anon;

drop event trigger if exists ensure_rls;
create event trigger ensure_rls
  on ddl_command_end
  execute function public.rls_auto_enable();

-- ---------------------------------------------------------------------
-- Assert what this migration claimed to do
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_event_trigger e
    join pg_proc p on p.oid = e.evtfoid
    where e.evtname = 'ensure_rls'
      and p.proname = 'rls_auto_enable'
      and e.evtevent = 'ddl_command_end'
      and e.evtenabled <> 'D'
  ) then
    raise exception '0068: the ensure_rls event trigger is not attached and enabled';
  end if;
end $$;
