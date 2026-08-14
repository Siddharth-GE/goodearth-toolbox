-- 0064 — the baton can sit with the client
--
-- Relay could say a trail was with Priya for eleven days. It could not
-- say that Priya sent it to the client on day two and has been waiting
-- ever since. Everyone knew; the tool called it "cold with Priya", so
-- the one number a leader reads was quietly blaming the wrong person.
--
-- Event-sourced, like everything else here: no status column. Two new
-- event kinds, and the view derives the flag from the log. Pushing,
-- bouncing or finishing implicitly clears it — the baton moved, so the
-- work is back with us, and nobody has to remember to "release" first.
--
-- THE CLOCK KEEPS RUNNING. A trail parked with a client for thirty days
-- is still thirty days of nothing happening, and it is still worth
-- surfacing. What changes is the sentence beside the number, not the
-- number. Pausing the clock would have meant teaching the SQL view,
-- chain.ts and the IST day arithmetic to agree about accumulated
-- intervals, and any disagreement between them is invisible.
--
-- Safe to run twice.

-- 1 ─────────────────────────────────────────────────────────────────
-- The two new kinds, and the shape they must have.

alter table pusher_chain_events drop constraint if exists pusher_chain_events_kind_check;
alter table pusher_chain_events add constraint pusher_chain_events_kind_check
  check (kind in ('started', 'pushed', 'bounced', 'completed', 'handed',
                  'client_held', 'client_returned'));

-- Same leg, both ends filled: this is a note about where the work is
-- standing, not a move. (checks 6 and 7 already force to_assignee_id and
-- to_expected_days to be present whenever to_leg is.)
alter table pusher_chain_events drop constraint if exists pusher_chain_events_client_leg;
alter table pusher_chain_events add constraint pusher_chain_events_client_leg
  check (
    kind not in ('client_held', 'client_returned')
    or (from_leg is not null and to_leg = from_leg)
  );

-- 2 ─────────────────────────────────────────────────────────────────
-- The guard. Carried forward whole from the live definition (0036 §6),
-- with two additions marked below. The trigger is the real boundary —
-- lib/relay/events.ts only mirrors it for readable error copy.

create or replace function pusher_chain_events_guard()
returns trigger
language plpgsql
as $function$
declare
  v_last pusher_chain_events%rowtype;
  v_has_last boolean;
  v_legs int;
  v_actor uuid;
  v_flow_kind text;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.chain_id::text, 0));

  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'Only a signed-in person can move a baton';
  end if;
  new.actor_id := v_actor;
  new.occurred_at := now();

  select * into v_last
  from pusher_chain_events
  where chain_id = new.chain_id
  order by seq desc
  limit 1;
  v_has_last := found;

  select max(leg_no) into v_legs
  from pusher_chain_legs
  where chain_id = new.chain_id;

  if v_legs is null then
    raise exception 'This trail has no legs yet';
  end if;

  if not v_has_last then
    if new.kind <> 'started' then
      raise exception 'This trail has not been opened yet';
    end if;
  else
    if v_last.kind = 'completed' then
      raise exception 'This trail is finished — nothing more can happen to it';
    end if;
    if new.kind = 'started' then
      raise exception 'This trail has already been opened';
    end if;
    -- from_leg is the caller's optimistic-concurrency token: "I am
    -- acting on what I saw". This message is the whole reason it is a
    -- required input rather than something the guard fills in.
    if new.from_leg is distinct from v_last.to_leg then
      raise exception 'The baton is on leg %, not leg % — someone moved it while you were looking',
        v_last.to_leg, new.from_leg;
    end if;
    if new.kind = 'handed' then
      if not is_admin() then
        raise exception 'Only an admin can hand a baton to someone else';
      end if;
    elsif v_actor is distinct from v_last.to_assignee_id and not is_admin() then
      raise exception 'Only the person holding this baton can move it';
    end if;

    -- ADDITION 1: you cannot give a trail to the client twice, or take
    -- it back from a client who never had it. The last event alone
    -- cannot answer this — an admin hand-off can sit on top of a hold —
    -- so the last event that MOVED the work is what gets asked.
    if new.kind in ('client_held', 'client_returned') then
      select kind into v_flow_kind
      from pusher_chain_events
      where chain_id = new.chain_id
        and kind in ('started', 'pushed', 'bounced', 'client_held', 'client_returned')
      order by seq desc
      limit 1;

      if new.kind = 'client_held' and v_flow_kind = 'client_held' then
        raise exception 'This trail is already with the client';
      end if;
      if new.kind = 'client_returned' and v_flow_kind is distinct from 'client_held' then
        raise exception 'This trail is not with the client';
      end if;
    end if;
  end if;

  if new.kind = 'completed' and new.from_leg <> v_legs then
    raise exception 'A trail is finished from its last leg — this is leg % of %',
      new.from_leg, v_legs;
  end if;

  if new.to_leg is null then
    new.to_assignee_id := null;
    new.to_expected_days := null;
  else
    if new.to_leg > v_legs then
      raise exception 'This trail only has % leg(s)', v_legs;
    end if;

    if new.kind = 'handed' then
      -- The one case where the assignee comes from the caller: handing
      -- the baton IS choosing a different person. The clock is not
      -- touched, so a hand-off can never launder a cold trail.
      if new.to_assignee_id is null then
        raise exception 'Say who is taking the baton';
      end if;
      select expected_days into new.to_expected_days
      from pusher_chain_legs
      where chain_id = new.chain_id and leg_no = new.to_leg;
    elsif new.kind in ('client_held', 'client_returned') then
      -- ADDITION 2: carry the CURRENT holder forward, from the last
      -- event rather than the leg row. Reading the leg row here — which
      -- is what every other kind does — would hand the baton back to
      -- whoever was originally staffed on this leg, silently undoing an
      -- admin's hand-off. Nothing about where the work stands changes
      -- when it goes to a client; only the label does.
      new.to_assignee_id := v_last.to_assignee_id;
      new.to_expected_days := v_last.to_expected_days;
    else
      select assignee_id, expected_days
      into new.to_assignee_id, new.to_expected_days
      from pusher_chain_legs
      where chain_id = new.chain_id and leg_no = new.to_leg;
    end if;

    -- A switched-off account cannot sign in and has_app() is false for
    -- it (0032 §2), so landing a baton there would build a data jail.
    if not exists (
      select 1 from profiles p where p.id = new.to_assignee_id and p.is_active
    ) then
      raise exception 'That person''s account is switched off — put someone else on leg % first',
        new.to_leg;
    end if;
  end if;

  new.seq := coalesce(v_last.seq, 0) + 1;
  return new;
end $function$;

-- 3 ─────────────────────────────────────────────────────────────────
-- The SIXTH definition of pusher_chain_state.
--
-- Built from the LIVE definition (pg_get_viewdef), never from an older
-- migration file — 0042's warning, and it now has consumers outside
-- Relay in Client Relations and Reporter. Every column those two select
-- is carried forward untouched; the three at the end are new.
--
-- The one dangerous edit is the `entry` lateral. It anchors the clock to
-- the last event that ENTERED a leg, which is why a hand-off cannot
-- reset a cold trail's timer. A client hold must not reset it either, so
-- the two new kinds join 'handed' in being excluded. Written as a
-- not-in list rather than an in-list so the behaviour for every existing
-- kind, including 'completed', is bit-for-bit what it was before.

drop view if exists pusher_chain_state;

create view pusher_chain_state with (security_barrier) as
 SELECT c.id AS chain_id,
    c.project_id,
    c.unit_id,
    c.activity_id,
    c.trail_set_id,
    c.project_stage_id,
    c.title,
    c.created_at,
    p.name AS project_name,
    p.code AS project_code,
    u.name AS unit_name,
    ts.name AS trail_set_name,
    COALESCE(a.name, ts.name, first_leg.label, 'Trail'::text) AS activity_name,
    dept.department_ids,
    dept.department_names,
    legs.leg_count,
    last.seq AS last_seq,
    last.kind AS last_kind,
    last.to_leg AS current_leg,
    last.to_assignee_id AS holder_id,
    entry.occurred_at AS entered_at,
    entry.to_expected_days AS expected_days,
    first_ev.occurred_at AS started_at,
    last.seq IS NULL AS is_queued,
    COALESCE(last.kind = 'completed'::text, false) AS is_finished,
        CASE
            WHEN last.seq IS NULL THEN 0
            WHEN last.kind = 'completed'::text THEN 0
            ELSE GREATEST(0, (now() AT TIME ZONE 'Asia/Kolkata'::text)::date - (entry.occurred_at AT TIME ZONE 'Asia/Kolkata'::text)::date)
        END AS days_in_leg,
        CASE
            WHEN last.seq IS NULL THEN false
            WHEN last.kind = 'completed'::text THEN false
            ELSE ((now() AT TIME ZONE 'Asia/Kolkata'::text)::date - (entry.occurred_at AT TIME ZONE 'Asia/Kolkata'::text)::date) > entry.to_expected_days
        END AS is_stuck,
    -- New: where the work is standing, not who is accountable for it.
    -- A finished trail is never with a client.
    COALESCE(flow.kind = 'client_held'::text AND last.kind <> 'completed'::text, false) AS is_with_client,
        CASE
            WHEN flow.kind = 'client_held'::text AND last.kind <> 'completed'::text THEN flow.occurred_at
            ELSE NULL::timestamptz
        END AS with_client_since,
        CASE
            WHEN flow.kind = 'client_held'::text AND last.kind <> 'completed'::text
            THEN GREATEST(0, (now() AT TIME ZONE 'Asia/Kolkata'::text)::date - (flow.occurred_at AT TIME ZONE 'Asia/Kolkata'::text)::date)
            ELSE 0
        END AS with_client_days
   FROM pusher_chains c
     JOIN projects p ON p.id = c.project_id
     LEFT JOIN pusher_activities a ON a.id = c.activity_id
     LEFT JOIN pusher_trail_sets ts ON ts.id = c.trail_set_id
     LEFT JOIN units u ON u.id = c.unit_id
     LEFT JOIN LATERAL ( SELECT e.seq,
            e.kind,
            e.to_leg,
            e.to_assignee_id
           FROM pusher_chain_events e
          WHERE e.chain_id = c.id
          ORDER BY e.seq DESC
         LIMIT 1) last ON true
     LEFT JOIN LATERAL ( SELECT e.occurred_at,
            e.to_expected_days
           FROM pusher_chain_events e
          WHERE e.chain_id = c.id
            AND e.kind <> ALL (ARRAY['handed'::text, 'client_held'::text, 'client_returned'::text])
          ORDER BY e.seq DESC
         LIMIT 1) entry ON true
     LEFT JOIN LATERAL ( SELECT e.kind,
            e.occurred_at
           FROM pusher_chain_events e
          WHERE e.chain_id = c.id
            AND e.kind = ANY (ARRAY['started'::text, 'pushed'::text, 'bounced'::text, 'client_held'::text, 'client_returned'::text])
          ORDER BY e.seq DESC
         LIMIT 1) flow ON true
     LEFT JOIN LATERAL ( SELECT e.occurred_at
           FROM pusher_chain_events e
          WHERE e.chain_id = c.id
          ORDER BY e.seq
         LIMIT 1) first_ev ON true
     LEFT JOIN LATERAL ( SELECT l.label
           FROM pusher_chain_legs l
          WHERE l.chain_id = c.id
          ORDER BY l.leg_no
         LIMIT 1) first_leg ON true
     LEFT JOIN LATERAL ( SELECT count(*)::integer AS leg_count
           FROM pusher_chain_legs l
          WHERE l.chain_id = c.id) legs ON true
     LEFT JOIN LATERAL ( SELECT COALESCE(array_agg(d.id ORDER BY d.sort_order, d.name), '{}'::uuid[]) AS department_ids,
            COALESCE(array_agg(d.name ORDER BY d.sort_order, d.name), '{}'::text[]) AS department_names
           FROM pusher_chain_departments cd
             JOIN pusher_departments d ON d.id = cd.department_id
          WHERE cd.chain_id = c.id) dept ON true;

-- A recreated view comes back with Supabase's default privileges, which
-- include writes. A writable view is an RLS bypass with a DELETE on the
-- end, and `from public` does not cover these two — name them.
revoke all on pusher_chain_state from public, anon;
revoke insert, update, delete, truncate on pusher_chain_state from anon, authenticated;
grant select on pusher_chain_state to authenticated;

-- 4 ─────────────────────────────────────────────────────────────────
-- Assert what this migration claimed to do.

do $$
begin
  -- Every column the three consumers select — Relay, Client Relations
  -- (lib/client-relations/queries.ts) and Reporter (lib/reporter/
  -- datasets.ts) — plus the three new ones. A dropped or renamed column
  -- fails here, not on someone's screen next week.
  perform chain_id, project_id, project_name, project_code, unit_id, unit_name,
          activity_id, activity_name, trail_set_id, trail_set_name, project_stage_id,
          title, created_at, department_ids, department_names,
          leg_count, last_seq, last_kind, current_leg, holder_id,
          entered_at, expected_days, started_at,
          is_queued, is_finished, days_in_leg, is_stuck,
          is_with_client, with_client_since, with_client_days
  from pusher_chain_state
  limit 1;

  if exists (
    select 1 from information_schema.role_table_grants
    where table_name = 'pusher_chain_state'
      and grantee in ('anon', 'authenticated')
      and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
  ) then
    raise exception 'pusher_chain_state is writable — a view is a read surface';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'pusher_chain_events'::regclass
      and conname = 'pusher_chain_events_kind_check'
      and pg_get_constraintdef(oid) like '%client_held%'
  ) then
    raise exception 'the event kinds do not include client_held';
  end if;

  if pg_get_functiondef('pusher_chain_events_guard'::regproc) not like '%client_held%' then
    raise exception 'the guard does not know about client holds';
  end if;

  -- The clock anchor must ignore the new kinds, or handing a trail to a
  -- client would reset its cold timer to zero — laundering exactly the
  -- delay this feature exists to show.
  if pg_get_viewdef('pusher_chain_state'::regclass, true) not like '%client_returned%' then
    raise exception 'the view does not account for the client kinds';
  end if;
end $$;
