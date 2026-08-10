-- 0047 — Pusher becomes Relay
--
-- FOUNDER, 2026-08-10: "I want to rename it to relay instead of pusher."
--
-- The grant slug is the permission boundary for this whole tool, so the
-- grants and every policy that reads them MOVE IN ONE TRANSACTION. If
-- they were split across two migrations there would be a window where
-- user_apps says '/relay' and 27 policies still ask for '/pusher', and
-- every single one of them would silently deny everyone. Silent denial
-- is the worst failure mode available here — no error, no log, just an
-- empty tool.
--
-- WHAT IS NOT RENAMED, and this is deliberate: the TABLES stay
-- `pusher_*`. Renaming a table is not additive — the moment
-- `pusher_chains` becomes `relay_chains`, the code deployed on
-- production stops working, and it stays broken until this branch
-- merges. That is an unbounded outage window in exchange for tidier
-- internals. The table names are now a legacy detail; every name a
-- person can see says Relay.
--
-- '/pusher' stays in the two CHECKs alongside '/relay'. The CHECKs are
-- additive-only by house rule, and an old slug left inert costs nothing
-- (0036 §1 did the same for the two tools Pusher replaced).

-- ---------------------------------------------------------------------
-- 1. '/relay' becomes a grantable app
-- ---------------------------------------------------------------------

alter table user_apps drop constraint if exists user_apps_app_known;
alter table user_apps add constraint user_apps_app_known check (
  app in (
    '/marathon', '/settings', '/masters', '/selections', '/budgets',
    '/indents', '/purchase-orders', '/inventory', '/bills', '/directory',
    '/training', '/management-dashboard', '/project-management',
    '/design-management', '/client-relations', '/financial-management',
    '/business-planning', '/pusher', '/relay'
  )
);

alter table role_apps drop constraint if exists role_apps_app_known;
alter table role_apps add constraint role_apps_app_known check (
  app in (
    '/marathon', '/settings', '/masters', '/selections', '/budgets',
    '/indents', '/purchase-orders', '/inventory', '/bills', '/directory',
    '/training', '/management-dashboard', '/project-management',
    '/design-management', '/client-relations', '/financial-management',
    '/business-planning', '/pusher', '/relay'
  )
);

-- ---------------------------------------------------------------------
-- 2. Move anyone who holds the old grant
-- ---------------------------------------------------------------------
-- Nobody does today (checked: 0 rows in both tables), but this migration
-- has to be correct on a database where somebody does — including a
-- restore from a backup taken after someone was granted it.
--
-- `on conflict do nothing` then delete, rather than a plain update,
-- because a person could conceivably hold both slugs already and the
-- unique key would trip.

insert into user_apps (user_id, app)
select user_id, '/relay' from user_apps where app = '/pusher'
on conflict do nothing;
delete from user_apps where app = '/pusher';

insert into role_apps (role_id, app)
select role_id, '/relay' from role_apps where app = '/pusher'
on conflict do nothing;
delete from role_apps where app = '/pusher';

-- ---------------------------------------------------------------------
-- 3. Every policy that asks for '/pusher' now asks for '/relay'
-- ---------------------------------------------------------------------
-- Regenerated from pg_policies rather than retyped, for the same reason
-- 0042 exists: these policies were written across five migrations and
-- one of them (0041's queued-chain delete) carries a `not exists`
-- subquery that no hand-copied list would reproduce correctly. Reading
-- the live definition and substituting one string cannot lose a clause.
--
-- The policy NAMES move too ("... by pusher app" -> "... by relay app"),
-- since they are recreated anyway and a security surface that half says
-- pusher is a security surface nobody trusts at a glance.

do $$
declare
  r record;
  v_qual text;
  v_check text;
  v_name text;
begin
  for r in
    select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (coalesce(qual, '') like '%/pusher%' or coalesce(with_check, '') like '%/pusher%')
  loop
    v_qual := replace(coalesce(r.qual, ''), '/pusher', '/relay');
    v_check := replace(coalesce(r.with_check, ''), '/pusher', '/relay');
    v_name := replace(r.policyname, 'pusher app', 'relay app');

    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);

    execute format(
      'create policy %I on %I.%I as %s for %s to %s %s %s',
      v_name, r.schemaname, r.tablename,
      r.permissive,
      r.cmd,
      array_to_string(r.roles, ', '),
      case when r.qual is not null then 'using (' || v_qual || ')' else '' end,
      case when r.with_check is not null then 'with check (' || v_check || ')' else '' end
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 4. Prove it
-- ---------------------------------------------------------------------
-- A migration that half-renamed the permission boundary would leave the
-- tool silently empty for everyone, so this refuses to commit unless
-- nothing is left asking for the old slug. Cheaper than finding out from
-- a person who cannot see their trails.

do $$
declare
  v_left int;
begin
  select count(*) into v_left
  from pg_policies
  where schemaname = 'public'
    and (coalesce(qual, '') like '%/pusher%' or coalesce(with_check, '') like '%/pusher%');

  if v_left > 0 then
    raise exception 'Rename incomplete: % policies still ask for /pusher', v_left;
  end if;
end $$;
