-- 0052 — Dashboard becomes Reporter
--
-- FOUNDER, 2026-08-11: the Dashboard stub becomes a report builder named
-- Reporter. This migration is Stage 1 of that plan and does the grant
-- rename ALONE — no tables, no policies, no behaviour. The full plan is
-- app/(dashboard)/reporter/PLAN.md.
--
-- Same shape as 0047 (Pusher -> Relay), and simpler: Dashboard was never
-- built, so no policy anywhere asks for '/management-dashboard' — there
-- is nothing to rewrite, only grants to move and a proof to assert.
--
-- '/management-dashboard' stays in the two CHECKs alongside '/reporter'.
-- The CHECKs are additive-only by house rule, and an old slug left inert
-- costs nothing (0036 §1 and 0047 both did the same).

-- ---------------------------------------------------------------------
-- 1. '/reporter' becomes a grantable app
-- ---------------------------------------------------------------------

alter table user_apps drop constraint if exists user_apps_app_known;
alter table user_apps add constraint user_apps_app_known check (
  app in (
    '/marathon', '/settings', '/masters', '/selections', '/budgets',
    '/indents', '/purchase-orders', '/inventory', '/bills', '/directory',
    '/training', '/management-dashboard', '/project-management',
    '/design-management', '/client-relations', '/financial-management',
    '/business-planning', '/pusher', '/relay', '/reporter'
  )
);

alter table role_apps drop constraint if exists role_apps_app_known;
alter table role_apps add constraint role_apps_app_known check (
  app in (
    '/marathon', '/settings', '/masters', '/selections', '/budgets',
    '/indents', '/purchase-orders', '/inventory', '/bills', '/directory',
    '/training', '/management-dashboard', '/project-management',
    '/design-management', '/client-relations', '/financial-management',
    '/business-planning', '/pusher', '/relay', '/reporter'
  )
);

-- ---------------------------------------------------------------------
-- 2. Move anyone who holds the old grant
-- ---------------------------------------------------------------------
-- Almost certainly zero rows — the tool was a stub — but this migration
-- has to be correct on a database where somebody does hold it, including
-- a restore from a backup. `on conflict do nothing` then delete, because
-- a person could conceivably hold both slugs already (0047's reasoning).

insert into user_apps (user_id, app)
select user_id, '/reporter' from user_apps where app = '/management-dashboard'
on conflict do nothing;
delete from user_apps where app = '/management-dashboard';

insert into role_apps (role_id, app)
select role_id, '/reporter' from role_apps where app = '/management-dashboard'
on conflict do nothing;
delete from role_apps where app = '/management-dashboard';

-- ---------------------------------------------------------------------
-- 3. Prove no policy ever asked for the old slug
-- ---------------------------------------------------------------------
-- The greps say none does — the tool was never built — so assert it
-- rather than trust it. If this ever fires, a policy exists that this
-- migration should have rewritten, and committing would leave it
-- silently denying everyone.

do $$
declare
  v_left int;
begin
  select count(*) into v_left
  from pg_policies
  where schemaname = 'public'
    and (
      coalesce(qual, '') like '%/management-dashboard%'
      or coalesce(with_check, '') like '%/management-dashboard%'
    );

  if v_left > 0 then
    raise exception 'Rename incomplete: % policies still ask for /management-dashboard', v_left;
  end if;
end $$;
