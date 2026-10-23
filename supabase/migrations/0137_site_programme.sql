-- 0137 — The site programme (plan.md, Supervisors site board, phase A; the schedule's tables for
-- phase B). Fable's review waived by the founder 2026-10-23; Opus reviewed, with a trial as a
-- /supervisors-only person and as the probe (scripts/trials/site-programme.sql).
--
-- A villa moves through stages, a stage being a work group (SS.01 Block work up to GF lintel).
-- Supervisors own every table here: /supervisors on every verb, no money anywhere.
--   1. site_villas — who runs a villa (a filter, not a permission) and the schedule's start date.
--   2. site_stages — a stage's status on a villa, its contractor and its real dates. A row exists
--      only once something happened on that stage; the programme itself is derived on read.
--   3. site_stage_events — the history, written by the database alone (the 0126 pattern).
--   4. The first labour logged on a stage starts it.
--   5. checklist_template_groups — the stages a checklist inspects; site_checklists names the stage
--      it was started for; site_checklist_items gains a photo.
--   6. estimate_work_facts — the official estimate's work quantities, money-free.
--   7. site_sequence, site_schedule_settings — the site's order of stages and the typical days the
--      schedule works its dates out from (phase B). Seeded with a draft order to be corrected.

-- 1. site_villas ---------------------------------------------------------------------------------
create table if not exists site_villas (
  id uuid primary key default gen_random_uuid(),
  plot_id uuid not null unique references plots (id),
  supervisor_id uuid references profiles (id),
  note text,
  start_on date,
  baselined_at timestamptz,
  baseline_note text,
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. site_stages ---------------------------------------------------------------------------------
create table if not exists site_stages (
  id uuid primary key default gen_random_uuid(),
  plot_id uuid not null references plots (id),
  work_group_id uuid not null references work_groups (id),
  status text not null default 'not_started'
    check (status in ('not_started', 'working', 'waiting', 'done')),
  status_changed_at timestamptz not null default now(),
  waiting_on text check (waiting_on in ('material', 'labour', 'inspection', 'client', 'other')),
  waiting_note text,
  started_on date,
  finished_on date,
  contractor_id uuid references vendors (id),
  days int check (days >= 1),
  pinned_start date,
  baseline_start date,
  baseline_finish date,
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plot_id, work_group_id),
  constraint site_stages_dates_follow_status check (
    (status = 'not_started' and started_on is null and finished_on is null)
    or (status = 'working' and started_on is not null and finished_on is null)
    or (status = 'waiting' and finished_on is null)
    or (status = 'done' and started_on is not null and finished_on is not null
        and finished_on >= started_on)
  ),
  constraint site_stages_waiting_says_on_what check ((status = 'waiting') = (waiting_on is not null))
);
create index if not exists site_stages_group on site_stages (work_group_id);

-- 3. site_stage_events ---------------------------------------------------------------------------
-- Append-only and written only by the two log triggers below: no insert, update or delete policy.
create table if not exists site_stage_events (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,
  plot_id uuid not null references plots (id),
  work_group_id uuid references work_groups (id),
  kind text not null check (kind in ('status', 'baseline')),
  from_status text,
  to_status text,
  waiting_on text,
  note text,
  actor_id uuid references profiles (id),
  at timestamptz not null default now(),
  constraint site_stage_events_shape check (
    (kind = 'status' and to_status is not null and work_group_id is not null)
    or (kind = 'baseline' and to_status is null and work_group_id is null)
  )
);
create index if not exists site_stage_events_plot on site_stage_events (plot_id, seq);

-- 5. Checklists and stages -----------------------------------------------------------------------
create table if not exists checklist_template_groups (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references checklist_templates (id),
  work_group_id uuid not null references work_groups (id),
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  unique (template_id, work_group_id)
);

alter table site_checklists add column if not exists work_group_id uuid references work_groups (id);
alter table site_checklist_items add column if not exists photo_path text;

-- 7. The schedule's inputs -----------------------------------------------------------------------
create table if not exists site_sequence (
  id uuid primary key default gen_random_uuid(),
  work_group_id uuid not null unique references work_groups (id),
  position int not null,
  follows_group_id uuid references work_groups (id),
  link text not null default 'after' check (link in ('after', 'alongside')),
  wait_days int not null default 0 check (wait_days >= 0),
  typical_days int check (typical_days >= 1),
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint site_sequence_not_itself check (follows_group_id is distinct from work_group_id)
);

create table if not exists site_schedule_settings (
  id uuid primary key default gen_random_uuid(),
  singleton boolean not null default true unique check (singleton),
  typical_sqft numeric check (typical_sqft > 0),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Audit, updated_at, RLS ------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['site_villas', 'site_stages', 'site_stage_events', 'checklist_template_groups',
                           'site_sequence', 'site_schedule_settings']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('revoke truncate on %I from anon, authenticated', t);
    execute format('revoke all on %I from anon', t);
  end loop;
  -- The history is its own audit; the rest are audited like every table.
  foreach t in array array['site_villas', 'site_stages', 'checklist_template_groups', 'site_sequence',
                           'site_schedule_settings']
  loop
    execute format('drop trigger if exists audit_%I on %I', t, t);
    execute format('create trigger audit_%I after insert or update or delete on %I for each row execute function audit_row()', t, t);
  end loop;
  foreach t in array array['site_villas', 'site_stages', 'site_sequence', 'site_schedule_settings']
  loop
    execute format('drop trigger if exists set_updated_at on %I', t);
    execute format('create trigger set_updated_at before update on %I for each row execute function set_updated_at()', t);
  end loop;
  -- Read, add, change; never delete.
  foreach t in array array['site_villas', 'site_stages', 'site_schedule_settings']
  loop
    execute format('drop policy if exists "%s readable by supervisors app" on %I', t, t);
    execute format('create policy "%s readable by supervisors app" on %I for select to authenticated using (has_app(''/supervisors''))', t, t);
    execute format('drop policy if exists "%s insertable by supervisors app" on %I', t, t);
    execute format('create policy "%s insertable by supervisors app" on %I for insert to authenticated with check (has_app(''/supervisors''))', t, t);
    execute format('drop policy if exists "%s updatable by supervisors app" on %I', t, t);
    execute format('create policy "%s updatable by supervisors app" on %I for update to authenticated using (has_app(''/supervisors'')) with check (has_app(''/supervisors''))', t, t);
  end loop;
end $$;

drop policy if exists "site_stage_events readable by supervisors app" on site_stage_events;
create policy "site_stage_events readable by supervisors app" on site_stage_events
  for select to authenticated using (has_app('/supervisors'));

-- The sequence is edited freely, a stage taken out of it included.
drop policy if exists "site_sequence readable by supervisors app" on site_sequence;
create policy "site_sequence readable by supervisors app" on site_sequence
  for select to authenticated using (has_app('/supervisors'));
drop policy if exists "site_sequence insertable by supervisors app" on site_sequence;
create policy "site_sequence insertable by supervisors app" on site_sequence
  for insert to authenticated with check (has_app('/supervisors'));
drop policy if exists "site_sequence updatable by supervisors app" on site_sequence;
create policy "site_sequence updatable by supervisors app" on site_sequence
  for update to authenticated using (has_app('/supervisors')) with check (has_app('/supervisors'));
drop policy if exists "site_sequence deletable by supervisors app" on site_sequence;
create policy "site_sequence deletable by supervisors app" on site_sequence
  for delete to authenticated using (has_app('/supervisors'));

-- The links are read with the templates (anyone signed in) and kept by /supervisors.
drop policy if exists "checklist_template_groups readable by signed-in" on checklist_template_groups;
create policy "checklist_template_groups readable by signed-in" on checklist_template_groups
  for select to authenticated using (session_is_verified());
drop policy if exists "checklist_template_groups insertable by supervisors app" on checklist_template_groups;
create policy "checklist_template_groups insertable by supervisors app" on checklist_template_groups
  for insert to authenticated with check (has_app('/supervisors'));
drop policy if exists "checklist_template_groups deletable by supervisors app" on checklist_template_groups;
create policy "checklist_template_groups deletable by supervisors app" on checklist_template_groups
  for delete to authenticated using (has_app('/supervisors'));
revoke update on checklist_template_groups from authenticated;

-- The stage's rules ------------------------------------------------------------------------------
-- Runs as the caller. A stage stays on its villa and work group; its contractor is a contractor
-- (labour_logs_contractor_only's rule); a change of status is timed for the health rules.
create or replace function site_stages_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and (new.plot_id, new.work_group_id) is distinct from (old.plot_id, old.work_group_id) then
    raise exception 'A stage stays on its villa.';
  end if;
  if new.contractor_id is not null
     and (tg_op = 'INSERT' or new.contractor_id is distinct from old.contractor_id)
     and not exists (select 1 from vendors v where v.id = new.contractor_id and v.is_contractor) then
    raise exception 'Pick a contractor — that vendor is not marked as one in Masters.';
  end if;
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    new.status_changed_at := now();
  end if;
  return new;
end $$;

drop trigger if exists site_stages_guard on site_stages;
create trigger site_stages_guard before insert or update on site_stages
  for each row execute function site_stages_guard();

-- A follows-chain never comes back round to the stage itself.
create or replace function site_sequence_guard()
returns trigger
language plpgsql
as $$
begin
  if new.follows_group_id is not null and exists (
    with recursive chain (group_id, depth) as (
      select new.follows_group_id, 1
      union all
      select s.follows_group_id, c.depth + 1
        from chain c join site_sequence s on s.work_group_id = c.group_id
       where s.follows_group_id is not null and c.depth < 500
    )
    select 1 from chain where group_id = new.work_group_id
  ) then
    raise exception 'That would make the stage wait on itself — pick an earlier stage to follow.';
  end if;
  return new;
end $$;

drop trigger if exists site_sequence_guard on site_sequence;
create trigger site_sequence_guard before insert or update on site_sequence
  for each row execute function site_sequence_guard();

-- 3. The log. SECURITY DEFINER so it can write the table nobody else may; execute revoked from
-- every client role, so the triggers are its only callers. auth.uid() is still the person.
create or replace function site_stages_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into site_stage_events (plot_id, work_group_id, kind, from_status, to_status, waiting_on, note, actor_id)
    values (new.plot_id, new.work_group_id, 'status',
            case when tg_op = 'UPDATE' then old.status end,
            new.status, new.waiting_on,
            case when new.status = 'waiting' then new.waiting_note end,
            auth.uid());
  end if;
  return null;
end $$;

drop trigger if exists site_stages_log on site_stages;
create trigger site_stages_log after insert or update on site_stages
  for each row execute function site_stages_log();

create or replace function site_villas_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.baselined_at is not null
     and (tg_op = 'INSERT' or new.baselined_at is distinct from old.baselined_at) then
    insert into site_stage_events (plot_id, kind, note, actor_id)
    values (new.plot_id, 'baseline', new.baseline_note, auth.uid());
  end if;
  return null;
end $$;

drop trigger if exists site_villas_log on site_villas;
create trigger site_villas_log after insert or update on site_villas
  for each row execute function site_villas_log();

-- 4. The first labour on a stage starts it. Runs as the caller, who wrote the log under
-- /supervisors and so may write the stage; a work with no group starts nothing; a stage waiting
-- before it began takes the date and keeps waiting; working or done is left alone. Bills' stamp
-- moves only bill_id, so it never fires this.
create or replace function labour_logs_start_stage()
returns trigger
language plpgsql
as $$
declare
  v_group uuid;
begin
  select group_id into v_group from work_items where id = new.work_item_id;
  if v_group is null then
    return null;
  end if;
  insert into site_stages as s (plot_id, work_group_id, status, started_on, created_by, updated_by)
  values (new.plot_id, v_group, 'working', new.log_date, auth.uid(), auth.uid())
  on conflict (plot_id, work_group_id) do update
    set status = case when s.status = 'not_started' then 'working' else s.status end,
        started_on = excluded.started_on,
        updated_by = excluded.updated_by
    where s.status = 'not_started' or (s.status = 'waiting' and s.started_on is null);
  return null;
end $$;

-- An edit fires it only when the work really changed: the edit form re-sends work_item_id every time.
drop trigger if exists labour_logs_start_stage on labour_logs;
create trigger labour_logs_start_stage after insert on labour_logs
  for each row execute function labour_logs_start_stage();
drop trigger if exists labour_logs_start_stage_moved on labour_logs;
create trigger labour_logs_start_stage_moved after update of work_item_id on labour_logs
  for each row when (old.work_item_id is distinct from new.work_item_id)
  execute function labour_logs_start_stage();

revoke all on function site_stages_guard() from public, anon, authenticated;
revoke all on function site_sequence_guard() from public, anon, authenticated;
revoke all on function site_stages_log() from public, anon, authenticated;
revoke all on function site_villas_log() from public, anon, authenticated;
revoke all on function labour_logs_start_stage() from public, anon, authenticated;

-- 6. estimate_work_facts --------------------------------------------------------------------------
-- What the official estimate measures per work — "1,800 sqft of block work" — so the site can set
-- logged piece-work against it and the schedule can size a villa. Quantity and unit only: the
-- line's labour_rate stays behind /estimator. The same four grants as estimate_takeoff_facts.
create or replace view estimate_work_facts with (security_barrier = true) as
select e.id as estimate_id,
       e.unit_id,
       l.work_item_id,
       l.qty as quantity,
       wi.uom
  from estimator_estimate_lines l
  join estimator_estimates e on e.id = l.estimate_id
  left join estimator_work_info wi on wi.work_item_id = l.work_item_id
 where e.status = 'submitted'
   and (has_app('/estimator') or has_app('/indents') or has_app('/inventory') or has_app('/supervisors'));

revoke all on estimate_work_facts from public, anon;
revoke insert, update, delete, truncate on estimate_work_facts from anon, authenticated;
grant select on estimate_work_facts to authenticated;

-- Seeds: a draft, for the founder and the site team to correct ------------------------------------
-- The site order of the 43 villa stages: each after or alongside the one it follows, with wait
-- days for curing. Typical days are left blank — the site team types them (phase B).
insert into site_sequence (work_group_id, position, follows_group_id, link, wait_days)
select g.id, d.position, f.id, d.link, d.wait_days
  from (values
    (10, 'FD.01', null, 'after', 0), (20, 'FD.02', 'FD.01', 'after', 0),
    (30, 'FD.03', 'FD.02', 'after', 0), (40, 'FD.04', 'FD.03', 'after', 0),
    (50, 'MEP.01', 'FD.04', 'alongside', 0), (60, 'SS.01', 'FD.04', 'after', 0),
    (70, 'SS.02', 'SS.01', 'after', 0), (80, 'SS.03', 'SS.02', 'alongside', 0),
    (90, 'SS.04', 'SS.02', 'after', 3), (100, 'SS.05', 'SS.04', 'after', 0),
    (110, 'MEP.02', 'SS.05', 'alongside', 0), (120, 'SS.06', 'SS.05', 'after', 7),
    (130, 'SS.07', 'SS.06', 'after', 0), (140, 'SS.08', 'SS.07', 'after', 3),
    (150, 'MEP.03', 'SS.08', 'alongside', 0), (160, 'SS.09', 'SS.08', 'after', 7),
    (170, 'SS.10', 'SS.09', 'after', 0), (180, 'PF.03', 'SS.10', 'after', 0),
    (190, 'SS.11', 'SS.10', 'after', 0), (200, 'MEP.04', 'SS.10', 'after', 0),
    (210, 'CAR.01', 'MEP.04', 'alongside', 0), (220, 'MEP.05', 'MEP.04', 'alongside', 0),
    (230, 'PF.01', 'MEP.04', 'after', 0), (240, 'MEP.06', 'PF.01', 'alongside', 0),
    (250, 'PF.02', 'PF.01', 'after', 0), (260, 'F.02', 'PF.02', 'after', 0),
    (270, 'MEP.07', 'F.02', 'alongside', 0), (280, 'F.03', 'F.02', 'after', 0),
    (290, 'MEP.08', 'F.03', 'alongside', 0), (300, 'CAR.02', 'F.03', 'alongside', 0),
    (310, 'F.04', 'F.03', 'alongside', 0), (320, 'MEP.10', 'F.04', 'alongside', 0),
    (330, 'MEP.09', 'F.03', 'after', 0), (340, 'F.01', 'F.03', 'after', 0),
    (350, 'LP.01', 'F.04', 'alongside', 0), (360, 'LP.07', 'LP.01', 'after', 0),
    (370, 'LP.06', 'LP.07', 'alongside', 0), (380, 'LP.03', 'LP.07', 'after', 0),
    (390, 'LP.02', 'LP.03', 'after', 0), (400, 'LP.04', 'LP.02', 'alongside', 0),
    (410, 'LP.08', 'LP.02', 'after', 0), (420, 'LP.05', 'LP.08', 'after', 0),
    (430, 'MEP.11', 'F.01', 'after', 0)
  ) as d (position, code, follows, link, wait_days)
  join work_groups g on g.code = d.code and g.is_active
  left join work_groups f on f.code = d.follows and f.is_active
 where not exists (select 1 from site_sequence)
on conflict (work_group_id) do nothing;

insert into site_schedule_settings (singleton) values (true) on conflict (singleton) do nothing;

-- Labour logged before this migration starts its stages too, from the first day logged.
insert into site_stages (plot_id, work_group_id, status, started_on)
select l.plot_id, w.group_id, 'working', min(l.log_date)
  from labour_logs l
  join work_items w on w.id = l.work_item_id
 where w.group_id is not null
 group by l.plot_id, w.group_id
on conflict (plot_id, work_group_id) do nothing;

-- Each checklist's stages, from its old work references read against the new groups (Plinth Beam's
-- works sit in FD.04 in the masters sheet). The concrete grade record inspects no one stage.
insert into checklist_template_groups (template_id, work_group_id)
select t.id, g.id
  from (values
    ('Blockwork', 'SS.01'), ('Blockwork', 'SS.04'), ('Blockwork', 'SS.06'), ('Blockwork', 'SS.10'),
    ('Dry Rubble', 'FD.02'), ('Floor PCC', 'SS.03'), ('Isolated Footing', 'FD.03'),
    ('Lintel Beam', 'SS.02'), ('Lintel Beam', 'SS.07'), ('Pile Foundation', 'FD.04'),
    ('Plastering', 'PF.01'), ('Plastering', 'PF.02'), ('Plinth Beam', 'FD.04'),
    ('Roof Slab Electrical', 'MEP.02'), ('Roof Slab Electrical', 'MEP.03'),
    ('Roof Slab', 'SS.05'), ('Roof Slab', 'SS.08')
  ) as d (template, code)
  join checklist_templates t on t.name = d.template
  join work_groups g on g.code = d.code and g.is_active
 where not exists (select 1 from checklist_template_groups)
on conflict (template_id, work_group_id) do nothing;

-- Checks ----------------------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['site_villas', 'site_stages', 'site_stage_events', 'checklist_template_groups',
                           'site_sequence', 'site_schedule_settings']
  loop
    if not (select relrowsecurity from pg_class where oid = t::regclass) then
      raise exception '0137: RLS is off on %', t;
    end if;
    if (select count(*) from pg_policies
         where schemaname = 'public' and tablename = t and cmd = 'SELECT') <> 1 then
      raise exception '0137: % should have exactly one SELECT policy', t;
    end if;
    if exists (select 1 from pg_policies
                where schemaname = 'public' and tablename = t and ('anon' = any (roles) or cmd = 'ALL')) then
      raise exception '0137: a % policy admits anon or every command', t;
    end if;
    if t <> 'checklist_template_groups' and exists (
      select 1 from pg_policies
       where schemaname = 'public' and tablename = t
         and (coalesce(qual, '') || coalesce(with_check, '')) not like '%has_app(''/supervisors''::text)%') then
      raise exception '0137: a % policy is not gated on /supervisors', t;
    end if;
  end loop;

  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'site_stage_events') <> 1 then
    raise exception '0137: site_stage_events must have its SELECT policy and nothing else';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and cmd = 'DELETE'
                and tablename in ('site_villas', 'site_stages', 'site_schedule_settings')) then
    raise exception '0137: villas, stages and settings are never deleted';
  end if;

  if not (select prosecdef from pg_proc where oid = 'site_stages_log()'::regprocedure)
     or not (select prosecdef from pg_proc where oid = 'site_villas_log()'::regprocedure) then
    raise exception '0137: the logs must be security definer';
  end if;
  if (select prosecdef from pg_proc where oid = 'labour_logs_start_stage()'::regprocedure) then
    raise exception '0137: labour_logs_start_stage runs as the caller';
  end if;
  foreach t in array array['site_stages_guard()', 'site_sequence_guard()', 'site_stages_log()',
                           'site_villas_log()', 'labour_logs_start_stage()']
  loop
    if has_function_privilege('anon', t, 'execute') or has_function_privilege('authenticated', t, 'execute') then
      raise exception '0137: % is executable by a client role', t;
    end if;
  end loop;

  if has_table_privilege('authenticated', 'estimate_work_facts', 'insert')
     or has_table_privilege('authenticated', 'estimate_work_facts', 'update')
     or has_table_privilege('authenticated', 'estimate_work_facts', 'delete')
     or has_table_privilege('anon', 'estimate_work_facts', 'select') then
    raise exception '0137: estimate_work_facts grants are wrong';
  end if;
  if exists (select 1 from information_schema.columns
              where table_name = 'estimate_work_facts' and column_name ilike '%rate%') then
    raise exception '0137: estimate_work_facts must carry no rate';
  end if;

  if exists (select 1 from work_groups where is_active and code = 'SS.01')
     and not exists (select 1 from site_sequence) then
    raise exception '0137: the draft sequence did not seed';
  end if;
end $$;
