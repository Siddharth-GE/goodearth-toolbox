-- 0084 — Supervisors: labour logs and requests for issue (Phase 2, Step G)
--
-- FOUNDER, 2026-08-20 (plan.md): a phone-first app for site
-- supervisors — log the day's labour per villa + work + contractor,
-- see what material each work has drawn, and request store issues.
-- Labour is counted by trade (masons, helpers, others), never priced:
-- nothing in /supervisors carries money, and estimate_takeoff_facts —
-- which gains '/supervisors' below — has no rate column, ever.
--
-- Two tables, both anchored on the PLOT like stock_issues (the
-- supervisor stands on a plot; the estimate is found through the
-- unit's 0029 1:1 when needed):
--
--   * labour_logs — one row per plot + work + contractor + date,
--     edited rather than accumulated (the estimator_estimate_lines
--     rule: two rows for one question would be two answers).
--     /supervisors on every verb.
--
--   * issue_requests — plot, work, item, quantity in the ITEM's unit
--     (how stock moves — 0076's D5 rule), status requested →
--     fulfilled/declined. Supervisors raise and may withdraw or edit
--     an OPEN request; the store-keeper (Inventory) resolves it. That
--     resolution is a cross-tool write, the fifth documented exception
--     in STATUS.md's list, and the guard trigger below is its fine
--     grain: identity permanent, content edits only while open and
--     only by /supervisors, transitions only by /inventory, resolved
--     rows immutable. RLS admits both apps on SELECT and UPDATE —
--     one policy per verb, never two (permissive policies OR
--     together and the second is invisible).
--
-- estimate_takeoff_facts is redefined ONCE, same columns, WHERE
-- widened to /supervisors — the request screen shows the official
-- estimate's figure beside what the site asks for. The revokes ride
-- in the same migration (0059's lesson), and scripts/view-manifest.ts
-- moves in the same commit or db:check-views fails the pull request.
--
-- Re-runnable throughout.

-- ---------------------------------------------------------------------
-- 1. '/supervisors' becomes a grantable app
-- ---------------------------------------------------------------------
-- Both CHECKs, restated in full and identically — granting fails at the
-- database if only one moves. The list is 0074's plus '/supervisors'.

alter table user_apps drop constraint if exists user_apps_app_known;
alter table user_apps add constraint user_apps_app_known check (
  app in (
    '/marathon', '/settings', '/masters', '/selections', '/budgets',
    '/indents', '/purchase-orders', '/inventory', '/bills', '/directory',
    '/training', '/management-dashboard', '/project-management',
    '/design-management', '/client-relations', '/financial-management',
    '/business-planning', '/pusher', '/relay', '/reporter', '/estimator',
    '/supervisors'
  )
);

alter table role_apps drop constraint if exists role_apps_app_known;
alter table role_apps add constraint role_apps_app_known check (
  app in (
    '/marathon', '/settings', '/masters', '/selections', '/budgets',
    '/indents', '/purchase-orders', '/inventory', '/bills', '/directory',
    '/training', '/management-dashboard', '/project-management',
    '/design-management', '/client-relations', '/financial-management',
    '/business-planning', '/pusher', '/relay', '/reporter', '/estimator',
    '/supervisors'
  )
);

-- ---------------------------------------------------------------------
-- 2. labour_logs — who worked, where, on what
-- ---------------------------------------------------------------------

create table if not exists labour_logs (
  id uuid primary key default gen_random_uuid(),
  plot_id uuid not null references plots (id),
  work_item_id uuid not null references work_items (id),
  contractor_id uuid not null references vendors (id),
  log_date date not null default current_date,
  -- Counted by trade (founder, 2026-08-20) — heads, never wages.
  masons int not null default 0,
  helpers int not null default 0,
  others int not null default 0,
  note text,
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint labour_logs_counts_sane
    check (masons >= 0 and helpers >= 0 and others >= 0),
  constraint labour_logs_some_workers
    check (masons + helpers + others > 0),
  -- One row per plot + work + contractor + day: quantities are edited,
  -- not accumulated. The action turns 23505 into "edit today's entry".
  constraint labour_logs_one_per_day
    unique (plot_id, work_item_id, contractor_id, log_date)
);

create index if not exists labour_logs_plot_idx on labour_logs (plot_id);
create index if not exists labour_logs_work_idx on labour_logs (work_item_id);
create index if not exists labour_logs_contractor_idx on labour_logs (contractor_id);
create index if not exists labour_logs_date_idx on labour_logs (log_date);

-- The picker only offers contractors, but the API accepts any vendor id
-- — data hygiene lives in the database, not the form. Not a security
-- boundary (RLS above is that), so a plain invoker trigger is enough.
create or replace function labour_logs_contractor_only()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1 from vendors v
    where v.id = new.contractor_id and v.is_contractor
  ) then
    raise exception 'Pick a contractor — that vendor is not marked as one in Masters.';
  end if;
  return new;
end;
$$;

drop trigger if exists labour_logs_contractor_only on labour_logs;
create trigger labour_logs_contractor_only
  before insert or update on labour_logs
  for each row execute function labour_logs_contractor_only();

-- ---------------------------------------------------------------------
-- 3. issue_requests — the supervisor asks, the store-keeper answers
-- ---------------------------------------------------------------------

create table if not exists issue_requests (
  id uuid primary key default gen_random_uuid(),
  plot_id uuid not null references plots (id),
  work_item_id uuid not null references work_items (id),
  item_id uuid not null references items (id),
  -- In items.default_uom — the unit stock moves in (0076 D5). The form
  -- shows the estimate's figure converted beside it.
  quantity numeric not null check (quantity > 0),
  note text,
  status text not null default 'requested',
  -- Set when the store-keeper records the issue this request produced.
  fulfilled_issue_id uuid references stock_issues (id),
  declined_reason text,
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint issue_requests_status_known
    check (status in ('requested', 'fulfilled', 'declined')),
  -- Resolution columns exist exactly when their status does.
  constraint issue_requests_fulfil_shape
    check ((status = 'fulfilled') = (fulfilled_issue_id is not null)),
  constraint issue_requests_decline_needs_reason
    check (
      status <> 'declined'
      or (declined_reason is not null and length(trim(declined_reason)) > 0)
    ),
  constraint issue_requests_reason_only_when_declined
    check (declined_reason is null or status = 'declined')
);

create index if not exists issue_requests_plot_idx on issue_requests (plot_id);
create index if not exists issue_requests_item_idx on issue_requests (item_id);
-- The store-keeper's queue reads exactly this.
create index if not exists issue_requests_open_idx
  on issue_requests (created_at) where status = 'requested';

-- The fine grain RLS cannot hold. Invoker context, so has_app() sees
-- the person clicking (this is a direct write path, not a cross-tool
-- trigger — the 0071/BUGCATCHER #11 trap does not apply).
create or replace function issue_requests_guard()
returns trigger
language plpgsql
as $$
begin
  if new.plot_id <> old.plot_id
    or new.work_item_id <> old.work_item_id
    or new.item_id <> old.item_id
    or new.created_by is distinct from old.created_by
    or new.created_at <> old.created_at then
    raise exception 'A request''s villa, work, item and requester never change — withdraw it and raise another.';
  end if;

  if old.status <> 'requested' then
    raise exception 'This request is already % — it cannot change.', old.status;
  end if;

  if new.status = 'requested' then
    -- A content edit while open: the supervisor's side of the fence.
    if not has_app('/supervisors') then
      raise exception 'Only the supervisors app edits an open request.';
    end if;
  elsif new.status in ('fulfilled', 'declined') then
    -- Resolution: the store-keeper's side. The shape CHECKs already
    -- demand the issue id / the reason.
    if not has_app('/inventory') then
      raise exception 'Only the store can fulfil or decline a request.';
    end if;
    if new.quantity <> old.quantity or new.note is distinct from old.note then
      raise exception 'Resolving a request does not rewrite it — the issue records what was actually given.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists issue_requests_guard on issue_requests;
create trigger issue_requests_guard
  before update on issue_requests
  for each row execute function issue_requests_guard();

-- ---------------------------------------------------------------------
-- 4. Audit, updated_at, RLS
-- ---------------------------------------------------------------------

do $$
declare
  t text;
begin
  for t in select unnest(array['labour_logs', 'issue_requests'])
  loop
    execute format('drop trigger if exists audit_%I on %I', t, t);
    execute format(
      'create trigger audit_%I after insert or update or delete on %I
         for each row execute function audit_row()', t, t);

    execute format('drop trigger if exists set_updated_at on %I', t);
    execute format(
      'create trigger set_updated_at before update on %I
         for each row execute function set_updated_at()', t);

    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- labour_logs: /supervisors on every verb. Nothing else reads labour.
drop policy if exists "labour_logs readable by supervisors app" on labour_logs;
create policy "labour_logs readable by supervisors app" on labour_logs
  for select to authenticated using (has_app('/supervisors'));

drop policy if exists "labour_logs writable by supervisors app" on labour_logs;
create policy "labour_logs writable by supervisors app" on labour_logs
  for insert to authenticated with check (has_app('/supervisors'));

drop policy if exists "labour_logs updatable by supervisors app" on labour_logs;
create policy "labour_logs updatable by supervisors app" on labour_logs
  for update to authenticated
  using (has_app('/supervisors')) with check (has_app('/supervisors'));

drop policy if exists "labour_logs deletable by supervisors app" on labour_logs;
create policy "labour_logs deletable by supervisors app" on labour_logs
  for delete to authenticated using (has_app('/supervisors'));

-- issue_requests: both sides of the counter read it; the guard above
-- says who may change what. ONE policy per verb — a second permissive
-- SELECT policy is the documented invisible mistake.
drop policy if exists "issue_requests readable by supervisors and inventory" on issue_requests;
create policy "issue_requests readable by supervisors and inventory" on issue_requests
  for select to authenticated
  using (has_app('/supervisors') or has_app('/inventory'));

drop policy if exists "issue_requests writable by supervisors app" on issue_requests;
create policy "issue_requests writable by supervisors app" on issue_requests
  for insert to authenticated
  with check (has_app('/supervisors') and status = 'requested');

drop policy if exists "issue_requests updatable by supervisors and inventory" on issue_requests;
create policy "issue_requests updatable by supervisors and inventory" on issue_requests
  for update to authenticated
  using (has_app('/supervisors') or has_app('/inventory'))
  with check (has_app('/supervisors') or has_app('/inventory'));

drop policy if exists "issue_requests deletable by supervisors app" on issue_requests;
create policy "issue_requests deletable by supervisors app" on issue_requests
  for delete to authenticated
  using (has_app('/supervisors') and status = 'requested');

-- ---------------------------------------------------------------------
-- 5. estimate_takeoff_facts admits /supervisors
-- ---------------------------------------------------------------------
-- Redefined whole (0078's columns, character for character) with one
-- WHERE change. NO rate column, ever — the manifest row moves in this
-- same commit and db:check-views holds the shape.

create or replace view estimate_takeoff_facts with (security_barrier) as
select
  e.id as estimate_id,
  e.project_id,
  e.unit_id,
  e.reference,
  e.submitted_at,
  t.work_item_id,
  t.material_id,
  t.material_name,
  t.uom,
  t.quantity,
  -- The bridge to procurement, read live from the material: the link
  -- and factor are bridging properties, not part of what was estimated,
  -- so a link added after submit still lets the frozen quantity pull.
  m.item_id,
  m.item_uom_factor
from estimator_estimate_takeoff t
join estimator_estimates e on e.id = t.estimate_id
left join estimator_materials m on m.id = t.material_id
where e.status = 'submitted'
  and (
    has_app('/estimator') or has_app('/indents')
    or has_app('/inventory') or has_app('/supervisors')
  );

-- drop view restores default write grants every time (0059's lesson),
-- so the revokes ride in the same migration as the definition.
revoke all on estimate_takeoff_facts from public, anon;
revoke insert, update, delete, truncate on estimate_takeoff_facts from anon, authenticated;
grant select on estimate_takeoff_facts to authenticated;

-- ---------------------------------------------------------------------
-- 6. Prove it all landed
-- ---------------------------------------------------------------------

do $$
declare
  v int;
  c text;
begin
  foreach c in array array['user_apps_app_known', 'role_apps_app_known']
  loop
    if not exists (
      select 1 from pg_constraint
      where conname = c and pg_get_constraintdef(oid) like '%''/supervisors''%'
    ) then
      raise exception '0084: % does not admit /supervisors', c;
    end if;
  end loop;

  foreach c in array array['labour_logs', 'issue_requests']
  loop
    if not exists (
      select 1 from pg_class
      where relname = c and relrowsecurity
    ) then
      raise exception '0084: % is missing or has RLS off', c;
    end if;
    select count(*) into v from pg_policies
      where schemaname = 'public' and tablename = c;
    if v <> 4 then
      raise exception '0084: % has % policies, expected 4', c, v;
    end if;
  end loop;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'issue_requests_guard' and tgrelid = 'issue_requests'::regclass
  ) then
    raise exception '0084: issue_requests_guard trigger missing';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'labour_logs_contractor_only' and tgrelid = 'labour_logs'::regclass
  ) then
    raise exception '0084: labour_logs_contractor_only trigger missing';
  end if;

  if position('/supervisors' in pg_get_viewdef('estimate_takeoff_facts'::regclass)) = 0 then
    raise exception '0084: estimate_takeoff_facts does not admit /supervisors';
  end if;

  if has_table_privilege('authenticated', 'estimate_takeoff_facts', 'insert')
    or has_table_privilege('anon', 'estimate_takeoff_facts', 'select') then
    raise exception '0084: estimate_takeoff_facts grants are wrong';
  end if;
end $$;
