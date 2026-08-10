-- Phase 10 — Pusher, the relay layer for site & design.
--
-- Pusher replaces the planned Project Management and Design Management
-- tools with one module. It tracks ACCOUNTABILITY ONLY: where a task is,
-- with whom, and for how long. The actual work stays deliberately
-- off-app — nothing here stores a drawing, a decision or a document.
--
-- A chain (UI: "trail") is a task with an ordered list of legs; each leg
-- is one person plus a number of expected days. The baton sits with
-- exactly one person, who can only PUSH it forward, BOUNCE it back to an
-- earlier leg (reason + note both mandatory), or FINISH it from the last
-- leg. Time in a leg beyond its expected days is "stuck" (UI: "cold").
--
-- THE EVENT LOG IS THE STATE. pusher_chain_events is append-only, and
-- holder / stuck-ness / actuals / points are ALWAYS derived by replaying
-- it. There is deliberately NO status column on pusher_chains, no
-- "current leg" column, no stored point total. If you find yourself
-- adding one, you are about to create a second source of truth that will
-- drift.
--
-- THE ONE DECISION EVERYTHING ELSE RESTS ON: events SNAPSHOT what they
-- need. to_assignee_id and to_expected_days are stamped onto the event
-- by the guard, read from the leg row at the moment the baton lands.
-- Same doctrine as prices-snapshotted-onto-lines-at-pick-time. Three
-- things fall out of it for free:
--
--   * A manager editing a future leg's expected days can never
--     retroactively make a past push "on time".
--   * Legality of a new event is decidable from the chain's LAST EVENT
--     ROW alone — so the guard needs no replay in plpgsql.
--   * The leaderboard reads one table.
--
-- The legs table is THE PLAN. The log is THE RECORD.
--
-- Scope of this migration: the relay itself (Phase 1 of four). Project
-- and unit STAGES — the ordered week-counted stages a chain lives in,
-- and the macro timeline they roll up into — arrive additively in a
-- later migration, together with their screens. A chain today anchors to
-- a project and optionally a unit; nothing here needs changing when
-- stages land, only new nullable columns.
--
-- Pusher carries NO MONEY, on any table, ever. Reads therefore follow
-- the Indents precedent (0019 §3) — open to any signed-in staff member,
-- writes gated to has_app('/pusher'). If a future phase wants a cost or
-- a rate on a chain, it does not go here: it goes behind a fact view.
--
-- Re-runnable throughout (the 0016 convention). No preflight needed —
-- every table is new, and both added columns start NULL on every
-- existing row.

-- ---------------------------------------------------------------------
-- 1. Grant slugs — '/pusher' becomes grantable
-- ---------------------------------------------------------------------
-- Both CHECKs, in the same migration, or granting the tool fails at the
-- database (0030 for user_apps, 0034 §1 for role_apps — the two lists
-- must stay identical).
--
-- '/project-management' and '/design-management' STAY in both lists even
-- though Pusher supersedes them and their sidebar entries are gone:
-- migrations are additive-only, and dropping a value would fail outright
-- if any grant row still held it. A slug nobody can be granted from the
-- UI is inert.

alter table user_apps drop constraint if exists user_apps_app_known;
alter table user_apps add constraint user_apps_app_known check (app in (
  '/selections', '/budgets', '/masters', '/marathon',
  '/indents', '/purchase-orders', '/inventory', '/bills',
  '/directory', '/training',
  '/management-dashboard', '/project-management', '/design-management',
  '/client-relations', '/financial-management', '/business-planning',
  '/pusher'
));

alter table role_apps drop constraint if exists role_apps_app_known;
alter table role_apps add constraint role_apps_app_known check (app in (
  '/selections', '/budgets', '/masters', '/marathon',
  '/indents', '/purchase-orders', '/inventory', '/bills',
  '/directory', '/training',
  '/management-dashboard', '/project-management', '/design-management',
  '/client-relations', '/financial-management', '/business-planning',
  '/pusher'
));

-- ---------------------------------------------------------------------
-- 2. units (project_id, id) — the composite-FK target
-- ---------------------------------------------------------------------
-- So a chain's unit is provably in the chain's own project, declaratively
-- and with no trigger. The idiom is 0029 §2's, where plots gained
-- (project_id, id) for exactly this reason.

alter table units drop constraint if exists units_project_id_id_key;
alter table units add constraint units_project_id_id_key unique (project_id, id);

-- ---------------------------------------------------------------------
-- 3. pusher_activities — the appendable master list
-- ---------------------------------------------------------------------
-- "Drawing approval", "Fire NOC", "Site handover". Deliberately GLOBAL
-- rather than per-project: a Fire NOC is a Fire NOC everywhere, and
-- since a new chain's legs prefill from that activity's LAST RUN, the
-- prefill is more useful when it reaches across projects, not less.
--
-- Unique on lower(name), because "Fire NOC" and "Fire noc" existing as
-- two masters would silently split that prefill history in half.
--
-- Off-switch, never a delete (the 0031 §2 masters rule): an activity
-- with chains behind it must stay resolvable forever.

create table if not exists pusher_activities (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists pusher_activities_name_key
  on pusher_activities (lower(name));
create index if not exists pusher_activities_active_idx
  on pusher_activities (sort_order, name) where is_active;

-- ---------------------------------------------------------------------
-- 4. pusher_chains — a trail
-- ---------------------------------------------------------------------
-- NO status column and NO reference number, both on purpose. Finished is
-- derived from the last event; a chain is not a piece of paper anyone
-- files, so it needs no IND/PO-style number. If one is ever wanted, the
-- counter idiom is 0019 §4/§7 verbatim.
--
-- unit_id is nullable: a chain can belong to the project as a whole (a
-- Fire NOC covers a building, not a villa).

create table if not exists pusher_chains (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id),
  unit_id uuid references units (id),
  activity_id uuid not null references pusher_activities (id),
  -- Optional free-text discriminator: "R1 set", "Lighting layout". The
  -- activity name is the noun; this is which one.
  title text,
  note text,
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- MATCH SIMPLE (the default) skips the check entirely when unit_id is
  -- null, which is exactly what makes the project-level branch legal —
  -- the same trick indent_lines' budget anchor uses (0019 §5).
  foreign key (project_id, unit_id) references units (project_id, id)
);

create index if not exists pusher_chains_project_idx on pusher_chains (project_id);
create index if not exists pusher_chains_activity_idx on pusher_chains (activity_id);
create index if not exists pusher_chains_unit_idx
  on pusher_chains (unit_id) where unit_id is not null;

-- ---------------------------------------------------------------------
-- 5. pusher_chain_legs — the plan
-- ---------------------------------------------------------------------
-- leg_no replaces the repo's usual sort_order column, and that is a
-- DELIBERATE exception worth stating: events reference legs by position
-- (from_leg / to_leg are ints), so leg_no is both the identity and the
-- order. Two independent ordering concepts over the same rows would be a
-- bug factory.
--
-- expected_days is whole days, minimum 1. Elapsed time in this tool is
-- counted in IST calendar days (see the state view below and
-- lib/pusher/day.ts), so half a day is not a thing this model can
-- express honestly.
--
-- NO `on delete cascade`: this is a guarded child, and 0019 §5 records
-- why — a cascaded delete fires the guard after the parent is gone, the
-- guard reads "missing", and it raises. There is no delete path for a
-- chain anyway (see §7).

create table if not exists pusher_chain_legs (
  id uuid primary key default gen_random_uuid(),
  chain_id uuid not null references pusher_chains (id),
  leg_no int not null check (leg_no >= 1),
  label text not null check (length(trim(label)) > 0),
  assignee_id uuid not null references profiles (id),
  expected_days int not null check (expected_days between 1 and 365),
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (chain_id, leg_no)
);

create index if not exists pusher_chain_legs_assignee_idx
  on pusher_chain_legs (assignee_id);

-- ---------------------------------------------------------------------
-- 6. pusher_chain_events — the log, and therefore the state
-- ---------------------------------------------------------------------
-- Five kinds:
--   started    the trail opens; baton lands on leg 1
--   pushed     baton moves forward exactly one leg
--   bounced    baton goes back to any earlier leg; reason + note required
--   completed  finished, from the last leg; nothing may follow
--   handed     admin moves the baton to a different person on the SAME
--              leg — the rescue hatch for someone who left or is away.
--              Worth zero points, and it does not reset the leg clock.
--
-- The row CHECKs below carry all the arithmetic, with no trigger and no
-- locking. The guard in §8 carries only what needs to see the chain's
-- last event.
--
-- One timestamp, not occurred_at + created_at: the guard sets
-- occurred_at := now() unconditionally, so backdating an on-time push is
-- impossible even through raw PostgREST.

create table if not exists pusher_chain_events (
  id uuid primary key default gen_random_uuid(),
  chain_id uuid not null references pusher_chains (id),
  -- Assigned by the guard under an advisory lock. The client never sends
  -- it and therefore can never race it.
  seq int not null,
  kind text not null check (
    kind in ('started', 'pushed', 'bounced', 'completed', 'handed')
  ),
  from_leg int,
  to_leg int,
  -- Stamped auth.uid() by the guard: you cannot bank points for someone
  -- else, whatever you POST.
  actor_id uuid not null references profiles (id),
  -- SNAPSHOTS, filled by the guard from the leg row. Everything derived
  -- — points, on-time, stuck-ness, actuals — reads these and never joins
  -- back to pusher_chain_legs.
  to_assignee_id uuid references profiles (id),
  to_expected_days int,
  reason text,
  note text,
  occurred_at timestamptz not null default now(),

  unique (chain_id, seq),

  check (kind <> 'started' or (from_leg is null and to_leg = 1)),
  check (kind <> 'completed' or (from_leg is not null and to_leg is null)),
  check (
    kind not in ('pushed', 'bounced', 'handed')
    or (from_leg is not null and to_leg is not null)
  ),
  check (kind <> 'pushed' or to_leg = from_leg + 1),
  -- Bouncing honestly is rewarded and never punished — but it is never
  -- silent. This CHECK is why "bounce without a reason and a note" is
  -- not a thing the database can hold.
  check (
    kind <> 'bounced'
    or (to_leg < from_leg
        and reason is not null
        and note is not null and length(trim(note)) > 0)
  ),
  check (
    kind <> 'handed'
    or (to_leg = from_leg and note is not null and length(trim(note)) > 0)
  ),
  -- A controlled list, not free text: "which activities bounce, and
  -- why" is the diagnostic that tells you an activity's legs are wrong,
  -- and it is unanswerable over free text. The note stays free.
  check (
    reason is null
    or reason in ('rework', 'missing_info', 'wrong_person', 'client_change', 'other')
  ),
  check ((to_leg is null) = (to_assignee_id is null)),
  check ((to_leg is null) = (to_expected_days is null))
);

-- The workhorse: a backward index scan answers "the last event of this
-- chain", which is the only read the guard needs.
create index if not exists pusher_chain_events_actor_idx
  on pusher_chain_events (actor_id, occurred_at desc);
create index if not exists pusher_chain_events_at_idx
  on pusher_chain_events (occurred_at desc);
create index if not exists pusher_chain_events_holder_idx
  on pusher_chain_events (to_assignee_id) where to_leg is not null;

-- ---------------------------------------------------------------------
-- 7. pusher_chain_links — pointing at a record in another tool
-- ---------------------------------------------------------------------
-- A trail can point at whatever spawned it: a selections revision, an
-- indent, a PO. DELIBERATELY WITHOUT A FOREIGN KEY, which is a break
-- from this repo's habit and needs its reasons stated:
--
--   1. Nothing here computes from the target. The link is navigational
--      only, so a dangling id costs nothing.
--   2. A real FK would make delete_draft_indent() fail because someone
--      happened to link a trail to that draft — exactly the
--      cascade-misfire class 0019 §5 exists to avoid.
--   3. Links must DEAD-END POLITELY (the toolbox resilience rule: if a
--      linked tool is down or the record is gone, chains must still
--      push). `label` is not null and snapshots the human reference at
--      link time, so a dead link still renders "IND/ASHRAM/012", never a
--      bare uuid.
--
-- Resolution reads only money-free surfaces (indents, selections,
-- po_facts, bill_facts) — never purchase_orders or bills directly.

create table if not exists pusher_chain_links (
  id uuid primary key default gen_random_uuid(),
  chain_id uuid not null references pusher_chains (id),
  target_kind text not null check (
    target_kind in ('selection', 'indent', 'purchase_order', 'bill', 'budget')
  ),
  target_id uuid not null,
  label text not null check (length(trim(label)) > 0),
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  unique (chain_id, target_kind, target_id)
);

create index if not exists pusher_chain_links_chain_idx on pusher_chain_links (chain_id);
create index if not exists pusher_chain_links_target_idx
  on pusher_chain_links (target_kind, target_id);

-- ---------------------------------------------------------------------
-- 8. The event guard — the whole rule set, in one place
-- ---------------------------------------------------------------------
-- Reads the chain's LAST EVENT ROW plus max(leg_no). That is the entire
-- state it needs; there is no replay here, and there never needs to be.
--
-- Serialisation is an advisory transaction lock on the chain, the 0021
-- §7 idiom, chosen over "select ... for update" on pusher_chains for the
-- same reasons given there: it needs no table privilege, is held to
-- transaction end, and — because it lives inside the trigger rather than
-- inside one RPC — it protects EVERY insert path, including a raw
-- PostgREST POST. unique (chain_id, seq) is the structural backstop if a
-- future code path ever bypasses the lock.
--
-- Three assignments here are the anti-gaming hardening, and they are the
-- difference between a game layer that is fun and one that is farmed:
--   occurred_at := now()        you cannot backdate an on-time push
--   actor_id := auth.uid()      you cannot bank points for someone else
--   to_expected_days from the   you cannot POST yourself a 90-day
--     leg row                     deadline and never be stuck

create or replace function pusher_chain_events_guard()
returns trigger
language plpgsql
as $$
declare
  v_last pusher_chain_events%rowtype;
  v_has_last boolean;
  v_legs int;
  v_actor uuid;
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
end $$;

drop trigger if exists pusher_chain_events_guard on pusher_chain_events;
create trigger pusher_chain_events_guard
  before insert on pusher_chain_events
  for each row execute function pusher_chain_events_guard();

-- Append-only, in three layers because each alone has a hole:
--   1. No UPDATE and no DELETE policy in §12 — closes PostgREST.
--   2. This trigger — closes the table owner, Studio, and any future
--      security-definer function.
--   3. No `on delete cascade` from pusher_chains — so deleting a chain
--      can never silently delete its log.
-- Break-glass is `alter table ... disable trigger`, the same posture as
-- the Studio escape hatches elsewhere. Note that disabling it also
-- disables the guard above, and with it seq assignment — the log stops
-- being ordered. Do not leave it off.

create or replace function pusher_chain_events_permanent()
returns trigger
language plpgsql
as $$
begin
  raise exception 'The push log is permanent — a mistake is corrected by pushing or bouncing again, never by editing history';
end $$;

drop trigger if exists pusher_chain_events_permanent on pusher_chain_events;
create trigger pusher_chain_events_permanent
  before update or delete on pusher_chain_events
  for each row execute function pusher_chain_events_permanent();

-- ---------------------------------------------------------------------
-- 9. The legs guard — what may still be changed, and when
-- ---------------------------------------------------------------------
--   finished chain      nothing changes, ever
--   leg_no <  current   frozen: the baton has already been through
--   leg_no =  current   only assignee_id, only an admin — this is
--                       reallocation, and hand_baton() is the only thing
--                       that does it, so the live baton moves with it
--   leg_no >  current   freely editable: rename, reassign, restretch,
--                       insert, delete
--
-- Why the current leg is otherwise frozen rather than editable: holder
-- and expected days come from the SNAPSHOT on the last event, so editing
-- the current leg row would change nothing the user can see. Silently
-- doing nothing is worse than refusing. Moving a live baton is what
-- 'handed' is for; moving work backwards is what 'bounced' is for.

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

  -- Before the trail is opened (inside open_chain, between the leg
  -- inserts and the 'started' event) there is nothing to protect.
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
    if (new.leg_no, new.label, new.expected_days)
       is distinct from (old.leg_no, old.label, old.expected_days) then
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

drop trigger if exists pusher_chain_legs_guard on pusher_chain_legs;
create trigger pusher_chain_legs_guard
  before insert or update or delete on pusher_chain_legs
  for each row execute function pusher_chain_legs_guard();

-- Gaplessness has to be asserted at COMMIT, not per row: a gap in
-- leg_no would strand the baton permanently ('pushed' requires
-- to_leg = from_leg + 1), but a per-row trigger cannot see a batch.
-- Deferring it is also what lets replace_future_legs() delete-then-insert
-- without fighting the constraint mid-transaction.

create or replace function pusher_chain_legs_gapless()
returns trigger
language plpgsql
as $$
declare
  v_chain uuid;
  v_count int;
  v_min int;
  v_max int;
begin
  if tg_op = 'DELETE' then
    v_chain := old.chain_id;
  else
    v_chain := new.chain_id;
  end if;

  select count(*), min(leg_no), max(leg_no)
  into v_count, v_min, v_max
  from pusher_chain_legs
  where chain_id = v_chain;

  -- Zero legs means the chain never got off the ground in this
  -- transaction; there is nothing to assert about it.
  if v_count = 0 then
    return null;
  end if;

  if v_min <> 1 or v_max <> v_count then
    raise exception 'A trail''s legs must be numbered 1 to % with no gaps', v_count;
  end if;

  return null;
end $$;

drop trigger if exists pusher_chain_legs_gapless on pusher_chain_legs;
create constraint trigger pusher_chain_legs_gapless
  after insert or update or delete on pusher_chain_legs
  deferrable initially deferred
  for each row execute function pusher_chain_legs_gapless();

-- ---------------------------------------------------------------------
-- 10. The three RPCs
-- ---------------------------------------------------------------------
-- Everything else is a plain PostgREST write. Push, bounce, finish and
-- the reason-and-note rules are ONE INSERT into pusher_chain_events —
-- the guard does the rest — which is the cleanest write path in this
-- repo and worth preserving.
--
-- security invoker + pinned search_path throughout: these are not RLS
-- bypasses, the /pusher grant is still the gate.

-- open_chain: chain + N legs + the 'started' event, atomically. A chain
-- with legs and no 'started' event is invisible (it has no holder); a
-- 'started' event with no legs is refused by the guard. PostgREST cannot
-- wrap three inserts, so this must be a function. create_next_revision()
-- (0007) is the precedent.

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

  -- with ordinality is what makes leg_no the array position — the client
  -- never numbers the legs, so it can never number them wrong.
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

  insert into pusher_chain_events (chain_id, kind, to_leg)
  values (v_id, 'started', 1);

  return v_id;
end $$;

revoke execute on function open_chain(uuid, uuid, uuid, text, text, jsonb) from public;
grant execute on function open_chain(uuid, uuid, uuid, text, text, jsonb) to authenticated;

-- replace_future_legs: rewriting the tail of a live trail. An RPC rather
-- than a batch of PATCHes because renumbering trips unique (chain_id,
-- leg_no) mid-statement; the deferred gapless trigger is what makes the
-- delete-then-insert legal. delete_draft_indent() (0019 §8) is the shape.

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
    raise exception 'Send the legs that come after the baton';
  end if;

  delete from pusher_chain_legs
  where chain_id = p_chain_id and leg_no > v_current;

  insert into pusher_chain_legs (
    chain_id, leg_no, label, assignee_id, expected_days, created_by, updated_by
  )
  select
    p_chain_id,
    v_current + l.ord::int,
    trim(l.rec ->> 'label'),
    (l.rec ->> 'assignee_id')::uuid,
    (l.rec ->> 'expected_days')::int,
    auth.uid(),
    auth.uid()
  from jsonb_array_elements(p_legs) with ordinality as l(rec, ord);
end $$;

revoke execute on function replace_future_legs(uuid, jsonb) from public;
grant execute on function replace_future_legs(uuid, jsonb) to authenticated;

-- hand_baton: the rescue hatch. Two writes that must not come apart —
-- the leg row (so a later bounce back to this leg lands on the right
-- person) and the 'handed' event (so the live baton actually moves).
-- Admin only, enforced here AND in both guards.

create or replace function hand_baton(p_chain_id uuid, p_to_user uuid, p_note text)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_last_kind text;
  v_current int;
begin
  if not is_admin() then
    raise exception 'Only an admin can hand a baton to someone else';
  end if;
  if nullif(trim(coalesce(p_note, '')), '') is null then
    raise exception 'Say why the baton is changing hands';
  end if;

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
    raise exception 'This trail is finished — nothing more can happen to it';
  end if;

  update pusher_chain_legs
  set assignee_id = p_to_user, updated_by = auth.uid()
  where chain_id = p_chain_id and leg_no = v_current;

  insert into pusher_chain_events (chain_id, kind, from_leg, to_leg, to_assignee_id, note)
  values (p_chain_id, 'handed', v_current, v_current, p_to_user, trim(p_note));
end $$;

revoke execute on function hand_baton(uuid, uuid, text) from public;
grant execute on function hand_baton(uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 11. pusher_chain_state — the view every list reads
-- ---------------------------------------------------------------------
-- "Stuck must be impossible to miss" must not come to mean "read every
-- event in the database on every page". This view derives holder,
-- current leg, expected days and DAYS IN LEG in SQL, so lists filter and
-- sort on stuck server-side and only the trail detail page ever reads a
-- full event log.
--
-- Both laterals are backward index scans on unique (chain_id, seq) —
-- cheap, and the reason that unique index is the workhorse of §6.
--
-- Unlike the 0019 §9 / 0022 views, this one is NOT a security boundary:
-- every base table underneath it is `for select using (true)`, so the
-- view exposes nothing the policies wouldn't. It exists for speed and
-- for one definition of "days in leg", not for secrecy. Pusher has no
-- money — if that ever changes, this comment stops being true.
--
-- Asia/Kolkata is deliberate and load-bearing. Vercel runs UTC, Postgres
-- runs UTC, the office is +05:30 — a push at 02:00 IST is the previous
-- day in UTC. lib/pusher/day.ts must agree with this expression exactly.

drop view if exists pusher_chain_state;

create view pusher_chain_state
with (security_barrier) as
select
  c.id as chain_id,
  c.project_id,
  c.unit_id,
  c.activity_id,
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
-- 12. Audit, updated_at, and RLS
-- ---------------------------------------------------------------------
-- pusher_chain_events is deliberately NOT audited. It IS an audit log,
-- it can never UPDATE or DELETE, and mirroring it into audit_log would
-- double the write volume of this tool's hottest table for exactly zero
-- extra information. This is a decision, not an oversight.
--
-- pusher_chain_links has no updated_at (insert and delete only), so it
-- gets the audit trigger and not set_updated_at.

do $$
declare
  t text;
begin
  for t in select unnest(array[
    'pusher_activities', 'pusher_chains', 'pusher_chain_legs', 'pusher_chain_links'
  ])
  loop
    execute format('drop trigger if exists audit_%s on %I', t, t);
    execute format(
      'create trigger audit_%s after insert or update or delete on %I for each row execute function audit_row()',
      t, t
    );
  end loop;

  for t in select unnest(array[
    'pusher_activities', 'pusher_chains', 'pusher_chain_legs'
  ])
  loop
    execute format('drop trigger if exists set_updated_at on %I', t);
    execute format(
      'create trigger set_updated_at before update on %I for each row execute function set_updated_at()',
      t
    );
  end loop;
end $$;

alter table pusher_activities enable row level security;
alter table pusher_chains enable row level security;
alter table pusher_chain_legs enable row level security;
alter table pusher_chain_events enable row level security;
alter table pusher_chain_links enable row level security;

-- Everyone signed in can SEE everything — that is a product invariant,
-- not an oversight: full visibility is what lets a manager spot a cold
-- trail in someone else's court and reallocate. Filters do the
-- narrowing. Writing needs the grant.

do $$
declare
  t text;
begin
  for t in select unnest(array[
    'pusher_activities', 'pusher_chains', 'pusher_chain_legs', 'pusher_chain_links'
  ])
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

-- Legs are deleted by replace_future_legs() (security invoker), so the
-- acting user needs DELETE; the guard in §9 is what makes it safe.
drop policy if exists "pusher_chain_legs deletable by pusher app" on pusher_chain_legs;
create policy "pusher_chain_legs deletable by pusher app"
  on pusher_chain_legs for delete to authenticated using (has_app('/pusher'));

-- Unlinking is not rewriting history.
drop policy if exists "pusher_chain_links deletable by pusher app" on pusher_chain_links;
create policy "pusher_chain_links deletable by pusher app"
  on pusher_chain_links for delete to authenticated using (has_app('/pusher'));

-- Activities are deactivated, never deleted (the masters rule), and
-- chains are never deleted at all: every chain has history from the
-- moment open_chain() writes its 'started' event, and deleting one would
-- contradict append-only. A trail opened by mistake is FINISHED with a
-- note. So: no delete policy on either table, on purpose.

-- The log: INSERT only. With RLS on and no permissive policy for a
-- command, that command is denied outright — which is layer 1 of the
-- three in §8.
drop policy if exists "pusher_chain_events readable by authenticated users" on pusher_chain_events;
create policy "pusher_chain_events readable by authenticated users"
  on pusher_chain_events for select to authenticated using (true);
drop policy if exists "pusher_chain_events writable by pusher app" on pusher_chain_events;
create policy "pusher_chain_events writable by pusher app"
  on pusher_chain_events for insert to authenticated with check (has_app('/pusher'));

-- ---------------------------------------------------------------------
-- 13. Seed the activity list
-- ---------------------------------------------------------------------
-- The six the founder's concept names. The list is appendable from the
-- tool, so these are a starting point, not a fixed set.

insert into pusher_activities (name, sort_order)
values
  ('Drawing approval', 10),
  ('Selections handoff', 20),
  ('Site handover', 30),
  ('Client onboarding', 40),
  ('Fire NOC', 50),
  ('Procurement kickoff', 60)
on conflict do nothing;
