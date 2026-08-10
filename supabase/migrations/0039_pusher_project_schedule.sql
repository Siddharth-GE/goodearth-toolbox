-- 0039 — Pusher: the project schedule, and trails that live in a stage.
--
-- Founder, 2026-08-10: "the overview for a project like Saarang, Baveli
-- etc holds the overall schedules, and each trail has its own dates and
-- timings change dynamically when required", and, asked how dates should
-- work: **dates are worked out, never typed.**
--
-- That last decision is the whole design. There is exactly ONE typed
-- date in this migration -- a project's start date -- and one number per
-- stage, its length in weeks. Every other date anyone ever sees (when a
-- stage should start, when it should end, when a trail should finish,
-- how far behind the project is) is CALCULATED from those two and
-- recalculated on every read.
--
-- What that buys, and why it is worth insisting on:
--
--   * Nothing to keep up to date. Insert a stage in the middle and every
--     downstream date moves by itself. With stored dates, that same edit
--     silently orphans every date after it and nobody finds out until a
--     client does.
--   * No two dates can ever contradict each other, because there is only
--     one source for all of them.
--   * "Timings change dynamically" falls out for free: a trail sitting
--     cold pushes its own finish date later every day, without anybody
--     touching anything.
--
-- Same doctrine as the event log in 0036: store the few things that are
-- genuinely inputs, derive everything else, every time.
--
-- Unit-level stages (a per-villa breakdown rolling up into these) are
-- deliberately NOT here. They are additive on top of this and land with
-- their own screens; the columns below are shaped so nothing changes
-- when they do.
--
-- Re-runnable throughout. Every project starts with no plan row and no
-- stages, so an unscheduled project simply says so.

-- ---------------------------------------------------------------------
-- 1. pusher_project_plans — the one typed date in the whole tool
-- ---------------------------------------------------------------------
-- A project's schedule start, one row per project, and nothing else.
--
-- Why its own table rather than a start_date column on `projects`: that
-- is a shared master, and this repo's rule is that writing a master
-- needs the /masters grant. A column there would mean a Pusher user
-- could see the schedule and not set it — the tool's own overview
-- unusable by the people who own it — or else Pusher's policy would have
-- to widen write access to `projects` as a whole, exposing name, code
-- and status to edit as a side effect of wanting one date. Pusher owns
-- Pusher's planning data; Masters keeps owning project facts.
--
-- A project with no row here shows "no schedule yet" rather than a wrong
-- timeline, exactly how projects.code behaves for indent numbering
-- (0019 §1). A wrong date is worse than a missing one.

create table if not exists pusher_project_plans (
  project_id uuid primary key references projects (id),
  start_date date not null,
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 2. project_stages — the schedule, as an ordered list of weeks
-- ---------------------------------------------------------------------
-- WEEKS, NOT DATES, and this is the point of the whole migration. A
-- stage says "Construction takes 46 weeks"; when Construction actually
-- starts is worked out by adding up every stage before it. Store the
-- dates instead and inserting one stage rewrites every later date, or
-- worse, silently does not.
--
-- No unique constraint on sort_order: reordering by swapping two rows
-- trips it instantly. Every read orders by (sort_order, id) so ties are
-- at least stable — the accepted moveSpaceView race, same trade.

create table if not exists project_stages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id),
  name text not null check (length(trim(name)) > 0),
  weeks int not null check (weeks between 1 and 520),
  sort_order int not null default 0,
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, name),
  -- The composite-FK target, so a chain's stage is provably in the
  -- chain's own project — declaratively, with no trigger (0029 §2).
  unique (project_id, id)
);

create index if not exists project_stages_project_idx
  on project_stages (project_id, sort_order);

-- ---------------------------------------------------------------------
-- 3. A trail can live in a stage
-- ---------------------------------------------------------------------
-- Nullable: a trail does not have to be filed under a stage, and every
-- trail that exists today has none. An unfiled trail still works
-- perfectly — it simply does not count towards the project picture,
-- which the overview says out loud rather than hiding.

alter table pusher_chains add column if not exists project_stage_id uuid;

alter table pusher_chains drop constraint if exists pusher_chains_project_stage_fkey;
alter table pusher_chains add constraint pusher_chains_project_stage_fkey
  foreign key (project_id, project_stage_id)
  references project_stages (project_id, id);

create index if not exists pusher_chains_stage_idx
  on pusher_chains (project_stage_id) where project_stage_id is not null;

-- ---------------------------------------------------------------------
-- 4. Stages are the plan; a stage with trails in it is not deletable
-- ---------------------------------------------------------------------
-- Editing a stage's name, length or order is ordinary planning and stays
-- free. Deleting one that trails are filed under would orphan real work
-- from the picture, so it is refused with something a person can act on.

create or replace function project_stages_guard()
returns trigger
language plpgsql
as $$
declare
  v_chains int;
begin
  if tg_op = 'UPDATE' and new.project_id is distinct from old.project_id then
    raise exception 'A stage cannot move to another project';
  end if;

  if tg_op = 'DELETE' then
    select count(*) into v_chains
    from pusher_chains
    where project_stage_id = old.id;

    if v_chains > 0 then
      raise exception 'This stage still has % trail(s) in it — move them to another stage first', v_chains;
    end if;
    return old;
  end if;

  return new;
end $$;

drop trigger if exists project_stages_guard on project_stages;
create trigger project_stages_guard
  before update or delete on project_stages
  for each row execute function project_stages_guard();

-- ---------------------------------------------------------------------
-- 5. pusher_chain_state carries its stage
-- ---------------------------------------------------------------------
-- Repeated in full because a view cannot be altered in place; the only
-- change from 0038 §5 is project_stage_id and project_start_date, which
-- the overview needs on every row to group and date them without a
-- second query.

drop view if exists pusher_chain_state;

create view pusher_chain_state
with (security_barrier) as
select
  c.id as chain_id,
  c.project_id,
  c.unit_id,
  c.activity_id,
  c.project_stage_id,
  c.title,
  c.created_at,
  p.name as project_name,
  p.code as project_code,
  plan.start_date as project_start_date,
  u.name as unit_name,
  a.name as activity_name,
  dept.department_ids,
  dept.department_names,
  legs.leg_count,
  legs.planned_days,
  last.seq as last_seq,
  last.kind as last_kind,
  last.to_leg as current_leg,
  last.to_assignee_id as holder_id,
  entry.occurred_at as entered_at,
  entry.to_expected_days as expected_days,
  first_ev.occurred_at as started_at,
  (last.kind = 'completed') as is_finished,
  case
    when last.kind = 'completed' then 0
    else greatest(
      0,
      (now() at time zone 'Asia/Kolkata')::date
        - (entry.occurred_at at time zone 'Asia/Kolkata')::date
    )
  end as days_in_leg,
  case
    when last.kind = 'completed' then false
    else (now() at time zone 'Asia/Kolkata')::date
           - (entry.occurred_at at time zone 'Asia/Kolkata')::date
         > entry.to_expected_days
  end as is_stuck
from pusher_chains c
join projects p on p.id = c.project_id
join pusher_activities a on a.id = c.activity_id
left join pusher_project_plans plan on plan.project_id = c.project_id
left join units u on u.id = c.unit_id
left join lateral (
  select e.seq, e.kind, e.to_leg, e.to_assignee_id
  from pusher_chain_events e
  where e.chain_id = c.id
  order by e.seq desc
  limit 1
) last on true
-- The leg clock is anchored on the last LEG-ENTERING event, so a
-- hand-off cannot reset a cold trail's timer.
left join lateral (
  select e.occurred_at, e.to_expected_days
  from pusher_chain_events e
  where e.chain_id = c.id and e.kind <> 'handed'
  order by e.seq desc
  limit 1
) entry on true
left join lateral (
  select e.occurred_at
  from pusher_chain_events e
  where e.chain_id = c.id
  order by e.seq asc
  limit 1
) first_ev on true
left join lateral (
  select count(*)::int as leg_count, coalesce(sum(l.expected_days), 0)::int as planned_days
  from pusher_chain_legs l
  where l.chain_id = c.id
) legs on true
left join lateral (
  select
    coalesce(array_agg(d.id order by d.sort_order, d.name), '{}') as department_ids,
    coalesce(array_agg(d.name order by d.sort_order, d.name), '{}') as department_names
  from pusher_chain_departments cd
  join pusher_departments d on d.id = cd.department_id
  where cd.chain_id = c.id
) dept on true;

revoke all on pusher_chain_state from public, anon;
grant select on pusher_chain_state to authenticated;

-- ---------------------------------------------------------------------
-- 6. Audit, updated_at, RLS
-- ---------------------------------------------------------------------

do $$
declare
  t text;
begin
  for t in select unnest(array['pusher_project_plans'])
  loop
    execute format('drop trigger if exists audit_%s on %I', t, t);
    execute format(
      'create trigger audit_%s after insert or update or delete on %I for each row execute function audit_row()', t, t
    );
    execute format('drop trigger if exists set_updated_at on %I', t);
    execute format(
      'create trigger set_updated_at before update on %I for each row execute function set_updated_at()', t
    );
  end loop;
end $$;

drop trigger if exists audit_project_stages on project_stages;
create trigger audit_project_stages
  after insert or update or delete on project_stages
  for each row execute function audit_row();

drop trigger if exists set_updated_at on project_stages;
create trigger set_updated_at
  before update on project_stages
  for each row execute function set_updated_at();

alter table project_stages enable row level security;

-- A project's schedule is not a secret — every tool that shows a project
-- may want to say where it is. Writing it is Pusher's job.
drop policy if exists "project_stages readable by authenticated users" on project_stages;
create policy "project_stages readable by authenticated users"
  on project_stages for select to authenticated using (true);
drop policy if exists "project_stages writable by pusher app" on project_stages;
create policy "project_stages writable by pusher app"
  on project_stages for insert to authenticated with check (has_app('/pusher'));
drop policy if exists "project_stages updatable by pusher app" on project_stages;
create policy "project_stages updatable by pusher app"
  on project_stages for update to authenticated
  using (has_app('/pusher')) with check (has_app('/pusher'));
drop policy if exists "project_stages deletable by pusher app" on project_stages;
create policy "project_stages deletable by pusher app"
  on project_stages for delete to authenticated using (has_app('/pusher'));

alter table pusher_project_plans enable row level security;

drop policy if exists "pusher_project_plans readable by authenticated users" on pusher_project_plans;
create policy "pusher_project_plans readable by authenticated users"
  on pusher_project_plans for select to authenticated using (true);
drop policy if exists "pusher_project_plans writable by pusher app" on pusher_project_plans;
create policy "pusher_project_plans writable by pusher app"
  on pusher_project_plans for insert to authenticated with check (has_app('/pusher'));
drop policy if exists "pusher_project_plans updatable by pusher app" on pusher_project_plans;
create policy "pusher_project_plans updatable by pusher app"
  on pusher_project_plans for update to authenticated
  using (has_app('/pusher')) with check (has_app('/pusher'));
-- No delete policy: clearing a schedule is setting a new start date, and
-- a project row here is one row that costs nothing to keep.
