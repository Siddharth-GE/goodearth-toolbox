-- 0041 — Standard trails at the house level
--
-- Every villa runs roughly the same set of handoffs. This migration lets
-- that set be laid down on a house in one click, and — the part that
-- shapes everything — lets the trails arrive WITHOUT their clocks
-- running.
--
-- WHY QUEUED TRAILS EXIST AT ALL (founder, 2026-08-10)
--
-- Twelve trails opened live is twelve clocks started at once. Handover,
-- at three expected days, would be cold within the week — months before
-- anyone was ever meant to touch it. Cold is the loudest signal in this
-- tool and it is worth exactly nothing once it cries wolf. So a standard
-- set arrives dormant, and each trail goes live when someone starts it.
--
-- THE HAPPY DISCOVERY: this needed almost no new machinery. "The event
-- log is the state" already had this state in it and nothing used it —
-- a chain with NO events. Both guards from 0036 already handle it:
--
--   * pusher_chain_events_guard: "if not v_has_last then if new.kind <>
--     'started' then raise 'This trail has not been opened yet'". An
--     eventless chain accepts exactly one thing, the 'started' event.
--     That IS start_chain(), already written, already tested.
--   * pusher_chain_legs_guard: "if v_last_kind is null then return".
--     Legs are freely editable before the first event — its own comment
--     says "before the trail is opened there is nothing to protect".
--
-- So there is no status column here either, and there is no new rule
-- about what may happen to a queued trail. Queued simply means "no
-- events yet", derived like everything else in this tool.
--
-- WHAT IS ACTUALLY NEW
--   1. Two tables for the named sets.
--   2. open_chain() splits into create_chain() + start_chain(); the old
--      function keeps its name and behaviour by composing them.
--   3. create_chains() — a whole set in one transaction.
--   4. pusher_chain_state learns is_queued, and stops answering NULL to
--      questions about trails that have not started.

-- ---------------------------------------------------------------------
-- 1. pusher_trail_sets — a named standard set
-- ---------------------------------------------------------------------
-- Global, not per project: "Standard villa" is the same list of work at
-- Saarang and at the next project, and a set that had to be rebuilt per
-- project would be rebuilt slightly differently every time. Projects
-- differ in their SCHEDULE (0039), which is per project; they do not
-- differ in what building a villa involves.
--
-- Off-switch, never a delete — the 0031 §2 masters rule. A set that has
-- been applied is history someone may want to read.

create table if not exists pusher_trail_sets (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists pusher_trail_sets_name_key
  on pusher_trail_sets (lower(name));
create index if not exists pusher_trail_sets_active_idx
  on pusher_trail_sets (sort_order, name) where is_active;

-- ---------------------------------------------------------------------
-- 2. pusher_trail_set_items — the ordered activities in a set
-- ---------------------------------------------------------------------
-- A set is a list of ACTIVITIES, not a frozen copy of people and days.
-- The legs still prefill from the activity's last run at the moment the
-- set is applied (getPrefillsByActivity), which is the same doctrine as
-- everywhere else here: the set says what work happens, the last run
-- says who tends to do it. Freezing assignees into the set would mean a
-- leaver's name reappearing on every new villa forever.
--
-- No unique constraint on sort_order — reordering by swapping two rows
-- trips it instantly (0039 §2 records the same trade). Reads order by
-- (sort_order, id) so ties are at least stable.
--
-- unique (set_id, activity_id): the same activity twice in one set would
-- produce two identical trails on every house, which is never what
-- anyone meant.

create table if not exists pusher_trail_set_items (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null references pusher_trail_sets (id) on delete cascade,
  activity_id uuid not null references pusher_activities (id),
  sort_order int not null default 0,
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (set_id, activity_id)
);

create index if not exists pusher_trail_set_items_set_idx
  on pusher_trail_set_items (set_id, sort_order);

-- ---------------------------------------------------------------------
-- 3. create_chain() — a trail that exists but has not started
-- ---------------------------------------------------------------------
-- This is open_chain() from 0036 §9 with its last three lines removed:
-- everything except the 'started' event. Splitting it here rather than
-- adding a boolean flag keeps both call sites honest about which one
-- they mean, and leaves the guard's own vocabulary ('started') as the
-- single thing that makes a trail live.

create or replace function create_chain(
  p_project_id uuid,
  p_unit_id uuid,
  p_activity_id uuid,
  p_title text,
  p_note text,
  p_legs jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
  v_count int;
begin
  if p_legs is null or jsonb_typeof(p_legs) <> 'array' or jsonb_array_length(p_legs) = 0 then
    raise exception 'A trail needs at least one leg';
  end if;

  insert into pusher_chains (
    project_id, unit_id, activity_id, title, note, created_by, updated_by
  )
  values (
    p_project_id, p_unit_id, p_activity_id,
    nullif(trim(p_title), ''), nullif(trim(p_note), ''),
    auth.uid(), auth.uid()
  )
  returning id into v_id;

  insert into pusher_chain_legs (
    chain_id, leg_no, label, assignee_id, expected_days, created_by, updated_by
  )
  select
    v_id,
    l.ord::int,
    trim(l.rec ->> 'label'),
    (l.rec ->> 'assignee_id')::uuid,
    (l.rec ->> 'expected_days')::int,
    auth.uid(),
    auth.uid()
  from jsonb_array_elements(p_legs) with ordinality as l(rec, ord);

  get diagnostics v_count = row_count;
  if v_count = 0 then
    raise exception 'A trail needs at least one leg';
  end if;

  return v_id;
end $$;

revoke execute on function create_chain(uuid, uuid, uuid, text, text, jsonb) from public;
grant execute on function create_chain(uuid, uuid, uuid, text, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 4. start_chain() — the baton lands on leg 1
-- ---------------------------------------------------------------------
-- One insert. Every rule about whether this is legal already lives in
-- pusher_chain_events_guard: a chain with no events accepts 'started'
-- and nothing else, and a chain that has one refuses a second with
-- "This trail has already been opened".
--
-- WHO MAY START ONE: anyone holding /pusher, and that is a deliberate
-- match to what the tool already does rather than a new permission. The
-- Open-a-trail form has always let one person open a trail whose first
-- leg belongs to someone else — the baton simply lands in their court.
-- Starting a queued trail is that same act, deferred. A stricter rule
-- here would mean a coordinator could lay down a house's whole set and
-- then be unable to begin any of it.

create or replace function start_chain(p_chain_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  insert into pusher_chain_events (chain_id, kind, to_leg)
  values (p_chain_id, 'started', 1);
end $$;

revoke execute on function start_chain(uuid) from public;
grant execute on function start_chain(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 5. open_chain() — unchanged behaviour, now composed
-- ---------------------------------------------------------------------
-- "Open a trail" still creates and starts in one go. Rewritten to call
-- the two halves so the leg-insert logic exists once; if it drifted, the
-- queue and the form would build subtly different trails.

create or replace function open_chain(
  p_project_id uuid,
  p_unit_id uuid,
  p_activity_id uuid,
  p_title text,
  p_note text,
  p_legs jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
begin
  v_id := create_chain(p_project_id, p_unit_id, p_activity_id, p_title, p_note, p_legs);
  perform start_chain(v_id);
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- 6. create_chains() — a whole standard set, all or nothing
-- ---------------------------------------------------------------------
-- One RPC rather than N round trips, and the reason is the Inventory
-- lesson recorded in STATUS.md: goods receipts insert their lines one at
-- a time so a guard can name the line it refused, and the accepted cost
-- is a half-written note when one fails. There is no per-trail refusal
-- message worth having here — a set either lands or it does not — so
-- this takes the transaction and leaves no half-applied house behind.
--
-- Each element is the same shape create_chain takes:
--   { activity_id, title, legs: [{ label, assignee_id, expected_days }] }

create or replace function create_chains(
  p_project_id uuid,
  p_unit_id uuid,
  p_chains jsonb
)
returns int
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_rec jsonb;
  v_count int := 0;
begin
  if p_chains is null or jsonb_typeof(p_chains) <> 'array' or jsonb_array_length(p_chains) = 0 then
    raise exception 'Pick at least one trail to add';
  end if;

  for v_rec in select value from jsonb_array_elements(p_chains)
  loop
    perform create_chain(
      p_project_id,
      p_unit_id,
      (v_rec ->> 'activity_id')::uuid,
      v_rec ->> 'title',
      null,
      v_rec -> 'legs'
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end $$;

revoke execute on function create_chains(uuid, uuid, jsonb) from public;
grant execute on function create_chains(uuid, uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 7. The state view learns about queued trails
-- ---------------------------------------------------------------------
-- THIS IS THE DANGEROUS PART OF THE MIGRATION, and it is worth being
-- explicit about why.
--
-- Before today every chain had at least one event, so `last` was never
-- null and the case expressions below never met one. A queued chain
-- makes `last.kind` null, and in SQL that quietly turns
--
--     (last.kind = 'completed')  into  NULL, not false
--
-- NULL is not false. `.eq("is_finished", false)` would filter a queued
-- trail out (correct by accident), while TypeScript reading the same
-- column as `is_finished ?? false` would count it as unfinished work
-- and drag every project's progress number down (wrong, and silent).
-- Relying on that distinction across ~30 call sites is how a tool grows
-- a bug nobody can find.
--
-- So: is_queued is stated outright, and every derived answer is given a
-- definite value for a trail that has not started. A queued trail is not
-- finished, is not cold, and has spent zero days in a leg it has not
-- reached — all three are true, and none of them is NULL.

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
  u.name as unit_name,
  a.name as activity_name,
  legs.leg_count,
  last.seq as last_seq,
  last.kind as last_kind,
  last.to_leg as current_leg,
  last.to_assignee_id as holder_id,
  entry.occurred_at as entered_at,
  entry.to_expected_days as expected_days,
  first_ev.occurred_at as started_at,
  -- No events at all: created, not started, no clock running.
  (last.seq is null) as is_queued,
  coalesce(last.kind = 'completed', false) as is_finished,
  case
    when last.seq is null then 0
    when last.kind = 'completed' then 0
    else greatest(
      0,
      (now() at time zone 'Asia/Kolkata')::date
        - (entry.occurred_at at time zone 'Asia/Kolkata')::date
    )
  end as days_in_leg,
  -- A queued trail can never be cold. That is the entire reason the
  -- queue exists — see the header.
  case
    when last.seq is null then false
    when last.kind = 'completed' then false
    else (now() at time zone 'Asia/Kolkata')::date
           - (entry.occurred_at at time zone 'Asia/Kolkata')::date
         > entry.to_expected_days
  end as is_stuck
from pusher_chains c
join projects p on p.id = c.project_id
join pusher_activities a on a.id = c.activity_id
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
  select count(*)::int as leg_count
  from pusher_chain_legs l
  where l.chain_id = c.id
) legs on true;

revoke all on pusher_chain_state from public, anon;
grant select on pusher_chain_state to authenticated;

-- ---------------------------------------------------------------------
-- 8. Audit, updated_at and RLS on the two new tables
-- ---------------------------------------------------------------------
-- Both carry an `id`, which 0039/0040 is the standing reminder about:
-- audit_row() reads new.id and raises at runtime without one. It
-- typechecks, it builds, and only opening the page finds it.

drop trigger if exists audit_pusher_trail_sets on pusher_trail_sets;
create trigger audit_pusher_trail_sets
  after insert or update or delete on pusher_trail_sets
  for each row execute function audit_row();

drop trigger if exists set_updated_at on pusher_trail_sets;
create trigger set_updated_at
  before update on pusher_trail_sets
  for each row execute function set_updated_at();

drop trigger if exists audit_pusher_trail_set_items on pusher_trail_set_items;
create trigger audit_pusher_trail_set_items
  after insert or update or delete on pusher_trail_set_items
  for each row execute function audit_row();

drop trigger if exists set_updated_at on pusher_trail_set_items;
create trigger set_updated_at
  before update on pusher_trail_set_items
  for each row execute function set_updated_at();

alter table pusher_trail_sets enable row level security;
alter table pusher_trail_set_items enable row level security;

do $$
declare
  t text;
begin
  for t in select unnest(array['pusher_trail_sets', 'pusher_trail_set_items'])
  loop
    execute format('drop policy if exists "%1$s readable by authenticated users" on %1$I', t);
    execute format(
      'create policy "%1$s readable by authenticated users" on %1$I for select to authenticated using (true)',
      t
    );
    execute format('drop policy if exists "%1$s writable by pusher app" on %1$I', t);
    execute format(
      'create policy "%1$s writable by pusher app" on %1$I for insert to authenticated with check (has_app(''/pusher''))',
      t
    );
    execute format('drop policy if exists "%1$s updatable by pusher app" on %1$I', t);
    execute format(
      'create policy "%1$s updatable by pusher app" on %1$I for update to authenticated using (has_app(''/pusher'')) with check (has_app(''/pusher''))',
      t
    );
  end loop;
end $$;

-- A set's contents are a working list, not history: taking an activity
-- out of "Standard villa" is editing a plan, not rewriting what already
-- happened on a house. The trails it already created are untouched.
drop policy if exists "pusher_trail_set_items deletable by pusher app" on pusher_trail_set_items;
create policy "pusher_trail_set_items deletable by pusher app"
  on pusher_trail_set_items for delete to authenticated using (has_app('/pusher'));

-- ---------------------------------------------------------------------
-- 9. A queued trail can be thrown away
-- ---------------------------------------------------------------------
-- 0036 §7 is emphatic that a chain is never deleted, and that stands:
-- every chain that has run has history from its 'started' event, and one
-- opened by mistake is FINISHED with a note.
--
-- A queued trail is the one honest exception, and only because it has no
-- history to destroy — no events, nothing that ever happened, nobody who
-- ever held it. Laying down a twelve-trail set and finding two do not
-- apply to this house has to be recoverable, and "finish a trail that
-- never started" would be a lie in the log forever.
--
-- The `not exists` subquery is the whole guarantee: the moment a trail
-- starts, this policy stops matching it, and the 0036 rule takes over
-- again with no gap between them.

drop policy if exists "queued chains deletable by pusher app" on pusher_chains;
create policy "queued chains deletable by pusher app"
  on pusher_chains for delete to authenticated
  using (
    has_app('/pusher')
    and not exists (
      select 1 from pusher_chain_events e where e.chain_id = pusher_chains.id
    )
  );

-- Its legs need no new policy: 0036 §13 already makes pusher_chain_legs
-- deletable by any /pusher holder, and pusher_chain_legs_guard is what
-- actually protects them — it refuses any leg at or behind the baton,
-- and waves through every leg on a chain with no events.
--
-- discard_chain(): legs then chain, in one transaction, with a check
-- that says something a person can act on rather than letting RLS
-- silently delete nothing.

create or replace function discard_chain(p_chain_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_chain_id::text, 0));

  if exists (select 1 from pusher_chain_events e where e.chain_id = p_chain_id) then
    raise exception 'This trail has already started — finish it with a note instead of removing it';
  end if;

  -- pusher_chain_links points at OTHER TOOLS' records (target_kind +
  -- target_id), never at another chain, so there is no inbound link to
  -- clean up — only this chain's own outbound ones.
  delete from pusher_chain_departments where chain_id = p_chain_id;
  delete from pusher_chain_links where chain_id = p_chain_id;
  delete from pusher_chain_legs where chain_id = p_chain_id;
  delete from pusher_chains where id = p_chain_id;
end $$;

revoke execute on function discard_chain(uuid) from public;
grant execute on function discard_chain(uuid) to authenticated;
