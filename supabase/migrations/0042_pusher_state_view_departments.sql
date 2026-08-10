-- 0042 — put the department columns back on pusher_chain_state
--
-- A REGRESSION FIX, applied within minutes of the mistake, and worth
-- keeping as its own file rather than editing 0041 (migrations are never
-- edited once applied — CLAUDE.md).
--
-- WHAT HAPPENED: 0041 recreates pusher_chain_state to add is_queued. It
-- was written from 0036's definition of that view, which is where the
-- view was first created — but 0038 had already REPLACED the whole view
-- to add `department_ids` and `department_names`, and 0039 added
-- `project_stage_id`. 0041 carried the 0039 column across and silently
-- lost the two 0038 ones, because a `create view` is a full replacement,
-- not a patch.
--
-- The damage was real: /pusher/trails selects department_names and
-- filters on department_ids, so the All-trails page was broken against
-- the live database from the moment 0041 was applied.
--
-- THE LESSON, for whoever recreates this view next: pusher_chain_state
-- has now been defined in FOUR migrations. Never rebuild it from an
-- older file. Get the live definition first —
--
--   select pg_get_viewdef('pusher_chain_state'::regclass, true);
--
-- — and add to that. `npm run typecheck` is what caught this one, because
-- the generated types knew the column had gone; that is the second time
-- this repo has been saved by regenerating types straight after applying
-- a migration rather than at the end.

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
  -- A queued trail can never be cold. That is the entire reason the
  -- queue exists — see 0041's header.
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
