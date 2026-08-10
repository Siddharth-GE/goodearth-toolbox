-- 0043 — the leg IS the activity
--
-- FOUNDER, 2026-08-10: "let each trail have a set of activities where
-- people can be customised, and standard set be a type of trail with
-- fixed activities. There needn't be sub legs to an activity — the leg
-- is the activity."
--
-- WHAT WAS WRONG. 0036 modelled a trail as ONE activity ("Drawing
-- approval") walked through free-text legs ("Draft", "Review", "Sign").
-- 0041 then made a standard set produce TWELVE such trails on a house.
-- That is one concept too many and twelve clocks too many.
--
-- WHAT IT BECOMES. A trail is an ordered list of ACTIVITIES, each with a
-- person and a number of days. A house's standard villa trail is one
-- trail with twelve activity-legs and ONE baton walking them. A "trail
-- type" (the table is still pusher_trail_sets — see §3) is a named trail
-- whose activities are fixed; you pick the type and customise who does
-- each one.
--
-- WHAT THIS FIXES BY ITSELF: only the leg holding the baton has a clock.
-- Legs 4 through 12 count nothing, so nothing can go cold months early —
-- which is what 0041's queue was invented to prevent. The queue survives
-- anyway, by the founder's choice, but now it means "this house's trail
-- is laid out and will begin when the site is ready", which is a
-- different and better reason than "stop the clocks".
--
-- Additive: nothing is dropped. Two NOT NULLs are relaxed and one is
-- added after a backfill, which is a constraint change, not data loss.

-- ---------------------------------------------------------------------
-- 1. A leg points at an activity
-- ---------------------------------------------------------------------
-- `label` is KEPT, and not as dead weight: it becomes the snapshot of
-- what the activity was CALLED when the leg was written, exactly like
-- to_expected_days on an event and prices on a budget line. Renaming
-- "Fire NOC" to "Fire clearance" must not rewrite what a trail from last
-- March says it did. It is nullable now only because the activity is the
-- real answer and the name is the courtesy.

alter table pusher_chain_legs add column if not exists activity_id uuid references pusher_activities (id);

-- Backfill: every existing leg belongs to a chain that had exactly one
-- activity, so that activity is unambiguously the leg's own.
--
-- The guard has to come off for it, and that is worth being explicit
-- about. pusher_chain_legs_guard refuses any change to a leg that has
-- already held the baton — which is exactly right for a person editing a
-- trail, and exactly wrong for a migration filling in a column that did
-- not exist when the leg was written. Nothing here changes what any leg
-- MEANS: it writes down the activity the leg always had, taken from its
-- own chain. Re-enabled immediately, in the same transaction, so there
-- is no window where the app runs unguarded.
alter table pusher_chain_legs disable trigger pusher_chain_legs_guard;

update pusher_chain_legs l
set activity_id = c.activity_id
from pusher_chains c
where c.id = l.chain_id and l.activity_id is null;

-- The update queues 0036's DEFERRED gapless constraint, and a table with
-- pending trigger events cannot be ALTERed. Forcing it to run now both
-- clears the block and checks, right here, that the backfill left every
-- chain's legs still gapless.
set constraints all immediate;

alter table pusher_chain_legs enable trigger pusher_chain_legs_guard;

alter table pusher_chain_legs alter column activity_id set not null;
alter table pusher_chain_legs alter column label drop not null;

create index if not exists pusher_chain_legs_activity_idx
  on pusher_chain_legs (activity_id);

-- ---------------------------------------------------------------------
-- 2. A trail no longer has to be one activity
-- ---------------------------------------------------------------------
-- pusher_chains.activity_id stays for the two trails that predate this
-- and for a single-activity trail, which is still a perfectly good thing
-- to open. It simply stops being required, because a twelve-activity
-- trail has no one answer to "which activity is it".

alter table pusher_chains alter column activity_id drop not null;

-- ---------------------------------------------------------------------
-- 3. A trail can be OF a type
-- ---------------------------------------------------------------------
-- pusher_trail_sets keeps its name rather than being renamed to
-- pusher_trail_types: renaming a table is not additive, the app is the
-- only thing that has to say "type" out loud, and a rename would break
-- 0041's policies and audit triggers for no gain. The UI says type.

alter table pusher_chains add column if not exists trail_set_id uuid references pusher_trail_sets (id);

create index if not exists pusher_chains_trail_set_idx
  on pusher_chains (trail_set_id) where trail_set_id is not null;

-- A type carries suggested days per activity, so picking "Standard
-- villa" fills in a plan and not just a list of names. Whoever opens the
-- trail can change any of them before it starts.
alter table pusher_trail_set_items
  add column if not exists expected_days int not null default 2
  check (expected_days between 1 and 365);

-- ---------------------------------------------------------------------
-- 4. The guard learns that the activity is part of the leg
-- ---------------------------------------------------------------------
-- Same rule as before, one more column: the leg under the baton cannot
-- be redefined out from under the person holding it. Swapping its
-- activity would be exactly that — it would change what they were asked
-- to do while they were doing it.

create or replace function pusher_chain_legs_guard()
returns trigger
language plpgsql
as $$
declare
  v_chain uuid;
  v_leg int;
  v_last_kind text;
  v_current int;
begin
  if tg_op = 'DELETE' then
    v_chain := old.chain_id;
    v_leg := old.leg_no;
  else
    v_chain := new.chain_id;
    v_leg := new.leg_no;
  end if;

  select kind, to_leg into v_last_kind, v_current
  from pusher_chain_events
  where chain_id = v_chain
  order by seq desc
  limit 1;

  -- Before the trail is opened (inside create_chain, and for as long as
  -- a queued trail sits waiting) there is nothing to protect.
  if v_last_kind is null then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if v_last_kind = 'completed' then
    raise exception 'This trail is finished — its legs are history now';
  end if;

  if v_leg < v_current then
    raise exception 'Leg % has already had the baton — you can only change what is still ahead', v_leg;
  end if;

  if v_leg = v_current then
    if tg_op <> 'UPDATE' then
      raise exception 'Leg % is where the baton is standing — it cannot be added or removed', v_leg;
    end if;
    if (new.leg_no, new.label, new.expected_days, new.activity_id)
       is distinct from (old.leg_no, old.label, old.expected_days, old.activity_id) then
      raise exception 'The baton is on leg % — only who is holding it can change, and only by handing it over', v_leg;
    end if;
    if new.assignee_id is distinct from old.assignee_id and not is_admin() then
      raise exception 'Only an admin can hand a baton to someone else';
    end if;
  end if;

  if tg_op <> 'DELETE'
     and not exists (
       select 1 from profiles p where p.id = new.assignee_id and p.is_active
     ) then
    raise exception 'That person''s account is switched off — put someone else on this leg';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 5. create_chain() takes activities
-- ---------------------------------------------------------------------
-- Each leg is now { activity_id, assignee_id, expected_days }. The label
-- is no longer sent by the client at all — it is READ FROM THE ACTIVITY
-- at insert time, which is what makes it a snapshot rather than
-- something a caller could disagree with.
--
-- The old signature is left in place and unused rather than dropped:
-- open_chain still calls this one, and a dropped-and-recreated function
-- signature is the kind of thing that fails at runtime on a stale
-- deployment mid-rollout.

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
    raise exception 'A trail needs at least one activity';
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

  -- with ordinality is what makes leg_no the array position — the client
  -- never numbers the legs, so it can never number them wrong.
  insert into pusher_chain_legs (
    chain_id, leg_no, activity_id, label, assignee_id, expected_days, created_by, updated_by
  )
  select
    v_id,
    l.ord::int,
    (l.rec ->> 'activity_id')::uuid,
    -- The snapshot. Renaming the activity later cannot rewrite this.
    (select a.name from pusher_activities a where a.id = (l.rec ->> 'activity_id')::uuid),
    (l.rec ->> 'assignee_id')::uuid,
    (l.rec ->> 'expected_days')::int,
    auth.uid(),
    auth.uid()
  from jsonb_array_elements(p_legs) with ordinality as l(rec, ord);

  get diagnostics v_count = row_count;
  if v_count = 0 then
    raise exception 'A trail needs at least one activity';
  end if;

  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- 6. open_chain() gains the trail type
-- ---------------------------------------------------------------------
-- A new overload rather than a changed signature, for the rollout reason
-- in §5: the old three-arg-plus-legs form keeps working while the new
-- code deploys.

create or replace function open_chain(
  p_project_id uuid,
  p_unit_id uuid,
  p_activity_id uuid,
  p_title text,
  p_note text,
  p_legs jsonb,
  p_trail_set_id uuid,
  p_start boolean
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

  if p_trail_set_id is not null then
    update pusher_chains set trail_set_id = p_trail_set_id where id = v_id;
  end if;

  -- The founder kept the queue: a trail can be laid out now and begun
  -- when the site is actually ready.
  if p_start then
    perform start_chain(v_id);
  end if;

  return v_id;
end $$;

revoke execute on function open_chain(uuid, uuid, uuid, text, text, jsonb, uuid, boolean) from public;
grant execute on function open_chain(uuid, uuid, uuid, text, text, jsonb, uuid, boolean) to authenticated;

-- create_chains() is no longer needed: a standard set is ONE trail now,
-- not twelve, so applying one is a single open_chain call. Left in place
-- (nothing calls it) rather than dropped mid-rollout.

-- ---------------------------------------------------------------------
-- 7. The state view: the trail's name, and its type
-- ---------------------------------------------------------------------
-- Rebuilt from `select pg_get_viewdef('pusher_chain_state'::regclass,
-- true)` — the live definition — and NOT from an older migration file.
-- That is the 0042 lesson, and this is the fifth definition of this view.
--
-- Two changes:
--   * `join pusher_activities` becomes a LEFT join, because a trail with
--     twelve activity-legs has no single one and c.activity_id is now
--     nullable. An inner join would have made every new trail vanish
--     from every list — silently, since a missing row is not an error.
--   * activity_name falls back to the TYPE's name, then to the first
--     leg's activity, so every trail still has something to be called.

drop view if exists pusher_chain_state;

create view pusher_chain_state
with (security_barrier) as
select
  c.id as chain_id,
  c.project_id,
  c.unit_id,
  c.activity_id,
  c.trail_set_id,
  c.project_stage_id,
  c.title,
  c.created_at,
  p.name as project_name,
  p.code as project_code,
  u.name as unit_name,
  ts.name as trail_set_name,
  coalesce(a.name, ts.name, first_leg.label, 'Trail') as activity_name,
  dept.department_ids,
  dept.department_names,
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
  case
    when last.seq is null then false
    when last.kind = 'completed' then false
    else (now() at time zone 'Asia/Kolkata')::date
           - (entry.occurred_at at time zone 'Asia/Kolkata')::date
         > entry.to_expected_days
  end as is_stuck
from pusher_chains c
join projects p on p.id = c.project_id
left join pusher_activities a on a.id = c.activity_id
left join pusher_trail_sets ts on ts.id = c.trail_set_id
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
  select l.label
  from pusher_chain_legs l
  where l.chain_id = c.id
  order by l.leg_no
  limit 1
) first_leg on true
left join lateral (
  select count(*)::int as leg_count
  from pusher_chain_legs l
  where l.chain_id = c.id
) legs on true
-- 0038: arrays, so "every cold Design trail" stays one server-side
-- containment filter rather than a second query and a merge in Node.
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
