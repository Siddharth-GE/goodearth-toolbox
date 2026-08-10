-- 0044 — replace_future_legs() takes activities, like everything else
--
-- 0043 made the leg an activity everywhere except here. This function
-- still read `label` out of the jsonb and wrote nothing to activity_id,
-- which after 0043's NOT NULL means editing the legs ahead of the baton
-- would fail outright — the one write path left speaking the old
-- language.
--
-- Same shape as create_chain: the client sends activity_id, and the
-- LABEL IS READ FROM THE ACTIVITY here, so it stays a snapshot of what
-- the activity was called rather than something a caller could disagree
-- with.

create or replace function replace_future_legs(p_chain_id uuid, p_legs jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_last_kind text;
  v_current int;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_chain_id::text, 0));

  select kind, to_leg into v_last_kind, v_current
  from pusher_chain_events
  where chain_id = p_chain_id
  order by seq desc
  limit 1;

  if v_last_kind is null then
    raise exception 'This trail has not been opened yet';
  end if;
  if v_last_kind = 'completed' then
    raise exception 'This trail is finished — its legs are history now';
  end if;
  if p_legs is null or jsonb_typeof(p_legs) <> 'array' then
    raise exception 'Send the activities that come after the baton';
  end if;

  delete from pusher_chain_legs
  where chain_id = p_chain_id and leg_no > v_current;

  insert into pusher_chain_legs (
    chain_id, leg_no, activity_id, label, assignee_id, expected_days, created_by, updated_by
  )
  select
    p_chain_id,
    v_current + l.ord::int,
    (l.rec ->> 'activity_id')::uuid,
    (select a.name from pusher_activities a where a.id = (l.rec ->> 'activity_id')::uuid),
    (l.rec ->> 'assignee_id')::uuid,
    (l.rec ->> 'expected_days')::int,
    auth.uid(),
    auth.uid()
  from jsonb_array_elements(p_legs) with ordinality as l(rec, ord);
end $$;
