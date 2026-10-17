-- 0126_design_board.sql — Design Management: each villa passed from stage
-- to stage (root plan.md, thirteenth piece).
--
-- The founder, 2026-10-17: "each plot can be passed from one stage to
-- another and so to different people, like design, permit, wd, structure,
-- interiors … its not a clean linear line it can go back and forth but the
-- stage that a house is in is marked by the latest stage even tho
-- revisions may happen backwards … each house will have multiple people
-- working on it, and then you need actions" — and, asked about Relay:
-- "build it full forget relay". So the design team's hand-offs and to-dos
-- live here, and Design Management's "nothing here has a holder or a due
-- date" is amended. Relay is left as it is; nothing links the two.
--
--   1. design_stages.on_board — which stages are the board's columns, and
--      the founder's names for two of them.
--   2. design_team() — who can be put on a stage or own an action.
--   3. design_steps — a status per villa per board stage.
--   4. design_step_people — several people on each step.
--   5. design_step_events — every move, written by the database alone.
--   6. design_pass_step() and design_set_where() — the two moves that
--      touch several rows, each in one transaction.
--   7. design_actions — the design team's to-do list, Client Relations'
--      shape (0120, 0121).
--
-- Everyone holding /design-management sees every villa, as with the
-- drawings (founder: the plan's recommendation, "open"). No view, no money.
-- Re-runnable throughout.

-- ---------------------------------------------------------------------
-- 1. design_stages.on_board
-- ---------------------------------------------------------------------
-- The board's columns are the tool's own stage list, so "WD" means one
-- thing on a transmittal and on the board. Typical Details and Landscape
-- are what a transmittal is filed under, not where a house is — so each
-- stage says whether it is a column. Switched on once, by code, only
-- while no stage is on the board: a re-run never fights Design stages.
--
-- The founder's words for the first two are Design and Permit. Renamed
-- only while the old seed names stand; sheet file names use the code (CON,
-- APP), so nothing already issued is renamed on disk.

alter table design_stages add column if not exists on_board boolean not null default false;

do $$
begin
  if not exists (select 1 from design_stages where on_board) then
    update design_stages set on_board = true where code in ('CON', 'APP', 'WD', 'STR', 'INT');
  end if;
end $$;

update design_stages set name = 'Design'
 where code = 'CON' and name = 'Concept'
   and not exists (select 1 from design_stages o where lower(o.name) = 'design');
update design_stages set name = 'Permit'
 where code = 'APP' and name = 'Approvals'
   and not exists (select 1 from design_stages o where lower(o.name) = 'permit');

-- ---------------------------------------------------------------------
-- 2. design_team() — who can be put on a stage or own an action
-- ---------------------------------------------------------------------
-- Active people holding /design-management, personally or through their
-- role bundle. An admin is on it only by holding the grant too — the
-- founder decides in Settings whether they design.
--
-- SECURITY DEFINER because nobody can read anyone else's grants
-- (user_apps is own-row, 0003). THE has_app CHECK IN THE BODY IS THE
-- WHOLE BOUNDARY (SECURITY.md): ids and names only — never an email,
-- never which grant — and only to someone already inside the tool. The
-- step and action guards below check every person against it, so nobody
-- is put on work they could not see.

create or replace function design_team()
returns table (id uuid, full_name text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not has_app('/design-management') then
    raise exception 'You need the Design Management app to see its team';
  end if;

  return query
    select p.id, p.full_name
      from profiles p
     where p.is_active
       and (
         exists (
           select 1 from user_apps ua
           where ua.user_id = p.id and ua.app = '/design-management'
         )
         or exists (
           select 1 from role_apps ra
           where ra.role_id = p.role_id and ra.app = '/design-management'
         )
       )
     order by p.full_name, p.id;
end $$;

revoke all on function design_team() from public, anon;
grant execute on function design_team() to authenticated;

-- ---------------------------------------------------------------------
-- 3. design_steps — a status per villa per board stage
-- ---------------------------------------------------------------------
-- No row is "not started". A villa sits at the furthest board stage whose
-- step has started — worked out on screen, never stored, so it can never
-- disagree with its steps. Stages run side by side: Structural alongside
-- WD is two rows both Working.
--
-- No DELETE policy: a step started by mistake goes back to not started,
-- and the history says so. The dates and the send-back reason are kept in
-- line with the status by the guard, so a screen cannot get them wrong.

create table if not exists design_steps (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references units (id),
  design_stage_id uuid not null references design_stages (id),
  status text not null default 'working',
  note text,
  -- Why it went back for revision; set only while revising.
  reason text,
  started_on date,
  done_on date,
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint design_steps_one_per_stage unique (unit_id, design_stage_id),
  constraint design_steps_status_check
    check (status in ('not_started', 'working', 'with_client', 'waiting', 'revising', 'done')),
  constraint design_steps_note_check
    check (note is null or length(note) <= 500),
  constraint design_steps_reason_check
    check (reason is null or length(trim(reason)) between 1 and 500),
  constraint design_steps_reason_while_revising
    check ((reason is not null) = (status = 'revising')),
  constraint design_steps_started_check
    check ((started_on is null) = (status = 'not_started')),
  constraint design_steps_done_on_check
    check ((done_on is not null) = (status = 'done'))
);

create index if not exists design_steps_stage_idx on design_steps (design_stage_id);

drop trigger if exists audit_design_steps on design_steps;
create trigger audit_design_steps
  after insert or update or delete on design_steps
  for each row execute function audit_row();

drop trigger if exists set_updated_at on design_steps;
create trigger set_updated_at
  before update on design_steps
  for each row execute function set_updated_at();

alter table design_steps enable row level security;

drop policy if exists "design_steps readable by design management app" on design_steps;
create policy "design_steps readable by design management app"
  on design_steps for select to authenticated
  using (has_app('/design-management'));

drop policy if exists "design_steps insertable by design management app" on design_steps;
create policy "design_steps insertable by design management app"
  on design_steps for insert to authenticated
  with check (has_app('/design-management'));

drop policy if exists "design_steps updatable by design management app" on design_steps;
create policy "design_steps updatable by design management app"
  on design_steps for update to authenticated
  using (has_app('/design-management'))
  with check (has_app('/design-management'));

-- ---------------------------------------------------------------------
-- 4. design_step_people — several people on each step
-- ---------------------------------------------------------------------
-- "So to different people" is choosing who is on the next step. A
-- villa's people are everyone on any of its steps. Put on, or taken off —
-- never edited into someone else, so the history reads true. `id` because
-- audit_row() reads new.id.

create table if not exists design_step_people (
  id uuid primary key default gen_random_uuid(),
  step_id uuid not null references design_steps (id),
  profile_id uuid not null references profiles (id),
  added_by uuid references profiles (id),
  added_at timestamptz not null default now(),
  constraint design_step_people_once unique (step_id, profile_id)
);

create index if not exists design_step_people_profile_idx on design_step_people (profile_id);

drop trigger if exists audit_design_step_people on design_step_people;
create trigger audit_design_step_people
  after insert or update or delete on design_step_people
  for each row execute function audit_row();

alter table design_step_people enable row level security;

drop policy if exists "design_step_people readable by design management app" on design_step_people;
create policy "design_step_people readable by design management app"
  on design_step_people for select to authenticated
  using (has_app('/design-management'));

drop policy if exists "design_step_people insertable by design management app" on design_step_people;
create policy "design_step_people insertable by design management app"
  on design_step_people for insert to authenticated
  with check (has_app('/design-management'));

drop policy if exists "design_step_people deletable by design management app" on design_step_people;
create policy "design_step_people deletable by design management app"
  on design_step_people for delete to authenticated
  using (has_app('/design-management'));

-- ---------------------------------------------------------------------
-- 5. design_step_events — every move, written by the database alone
-- ---------------------------------------------------------------------
-- The villa's timeline and its revision counts. Append-only, and written
-- ONLY by the two log triggers below: there is no insert, update or
-- delete policy, so nobody writes, edits or tidies history by hand. `seq`
-- orders events written in one transaction (a pass is two status changes
-- and a person, all at the same now()).

create table if not exists design_step_events (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,
  step_id uuid not null references design_steps (id),
  unit_id uuid not null references units (id),
  design_stage_id uuid not null references design_stages (id),
  kind text not null,
  from_status text,
  to_status text,
  person_id uuid references profiles (id),
  reason text,
  actor_id uuid references profiles (id),
  at timestamptz not null default now(),
  constraint design_step_events_kind_check
    check (kind in ('status', 'person_added', 'person_removed')),
  constraint design_step_events_shape
    check ((to_status is not null) = (kind = 'status')
       and (person_id is not null) = (kind <> 'status'))
);

create index if not exists design_step_events_unit_idx on design_step_events (unit_id, seq);
create index if not exists design_step_events_step_idx on design_step_events (step_id);

alter table design_step_events enable row level security;

drop policy if exists "design_step_events readable by design management app" on design_step_events;
create policy "design_step_events readable by design management app"
  on design_step_events for select to authenticated
  using (has_app('/design-management'));

-- ---------------------------------------------------------------------
-- 3b. The step guard and its log
-- ---------------------------------------------------------------------
-- The guard runs as the caller (RLS still applies). It refuses a step on
-- a stage that is not on the board, moving a step to another villa or
-- stage, and a send-back with no reason; it keeps the dates and the
-- reason in line with the status, and pins who started it.

create or replace function design_steps_guard()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
    if not exists (
      select 1 from design_stages s
       where s.id = new.design_stage_id and s.on_board and s.is_active
    ) then
      raise exception 'That stage is not on the design board. Switch it on in Design stages first';
    end if;
  else
    if new.unit_id is distinct from old.unit_id
       or new.design_stage_id is distinct from old.design_stage_id then
      raise exception 'A stage cannot move to another villa or another stage';
    end if;
    if new.created_by is distinct from old.created_by then
      raise exception 'Who started a stage cannot be changed';
    end if;
  end if;
  new.updated_by := coalesce(auth.uid(), new.updated_by);

  -- A send-back always says why. The reason belongs to that revision: it
  -- is cleared when the step leaves Revising, so the next send-back needs
  -- its own.
  if new.status = 'revising' then
    if (tg_op = 'INSERT' or old.status <> 'revising')
       and (new.reason is null or length(trim(new.reason)) = 0) then
      raise exception 'Say why it is going back for revision';
    end if;
    new.reason := nullif(trim(new.reason), '');
    if new.reason is null then
      new.reason := old.reason;
    end if;
  else
    new.reason := null;
  end if;

  -- The dates follow the status.
  if new.status = 'not_started' then
    new.started_on := null;
  elsif tg_op = 'UPDATE' and old.status <> 'not_started' then
    new.started_on := old.started_on;
  else
    new.started_on := v_today;
  end if;

  if new.status <> 'done' then
    new.done_on := null;
  elsif tg_op = 'UPDATE' and old.status = 'done' then
    new.done_on := old.done_on;
  else
    new.done_on := v_today;
  end if;

  return new;
end $$;

revoke all on function design_steps_guard() from public, anon, authenticated;

drop trigger if exists design_steps_guard on design_steps;
create trigger design_steps_guard
  before insert or update on design_steps
  for each row execute function design_steps_guard();

-- The log. SECURITY DEFINER so it can write the table nobody else may;
-- no client role may execute it, so the trigger is its only caller (the
-- SECURITY.md exception for trigger-only definers). auth.uid() is still
-- the person who made the change.

create or replace function design_steps_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into design_step_events
      (step_id, unit_id, design_stage_id, kind, from_status, to_status, reason, actor_id)
    values (
      new.id, new.unit_id, new.design_stage_id, 'status',
      case when tg_op = 'UPDATE' then old.status end,
      new.status,
      case when new.status = 'revising' then new.reason end,
      auth.uid()
    );
  end if;
  return null;
end $$;

revoke all on function design_steps_log() from public, anon, authenticated;

drop trigger if exists design_steps_log on design_steps;
create trigger design_steps_log
  after insert or update on design_steps
  for each row execute function design_steps_log();

-- ---------------------------------------------------------------------
-- 4b. The people guard and its log
-- ---------------------------------------------------------------------
-- Only someone on design_team() goes on a step. A session with no
-- auth.uid() (db:apply, a script) passes, as 0121's guard lets it.

create or replace function design_step_people_guard()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.added_by := coalesce(auth.uid(), new.added_by);
  if auth.uid() is not null
     and not exists (select 1 from design_team() t where t.id = new.profile_id) then
    raise exception 'That person does not hold Design Management, so they cannot be put on a stage';
  end if;
  return new;
end $$;

revoke all on function design_step_people_guard() from public, anon, authenticated;

drop trigger if exists design_step_people_guard on design_step_people;
create trigger design_step_people_guard
  before insert on design_step_people
  for each row execute function design_step_people_guard();

create or replace function design_step_people_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into design_step_events (step_id, unit_id, design_stage_id, kind, person_id, actor_id)
    select s.id, s.unit_id, s.design_stage_id, 'person_added', new.profile_id, auth.uid()
      from design_steps s where s.id = new.step_id;
  else
    insert into design_step_events (step_id, unit_id, design_stage_id, kind, person_id, actor_id)
    select s.id, s.unit_id, s.design_stage_id, 'person_removed', old.profile_id, auth.uid()
      from design_steps s where s.id = old.step_id;
  end if;
  return null;
end $$;

revoke all on function design_step_people_log() from public, anon, authenticated;

drop trigger if exists design_step_people_log on design_step_people;
create trigger design_step_people_log
  after insert or delete on design_step_people
  for each row execute function design_step_people_log();

-- ---------------------------------------------------------------------
-- 6. The two moves that touch several rows
-- ---------------------------------------------------------------------
-- Each in one transaction, so a villa is never left half-passed. Both run
-- as the caller: RLS and the guards above still apply, and the has_app
-- check only says it in a sentence first (the issue_transmittal shape).

-- Pass on: this stage is done, the next is Working with these people.
-- Any stage can be passed to — the board is not a straight line.
create or replace function design_pass_step(
  p_unit uuid,
  p_from uuid,
  p_to uuid,
  p_people uuid[],
  p_note text
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_step uuid;
begin
  if not has_app('/design-management') then
    raise exception 'You need the Design Management app to move a villa';
  end if;
  if p_from = p_to then
    raise exception 'Pick a different stage to pass it to';
  end if;
  if not exists (
    select 1 from design_steps
     where unit_id = p_unit and design_stage_id = p_from and status <> 'not_started'
  ) then
    raise exception 'That stage has not started on this villa';
  end if;

  update design_steps set status = 'done'
   where unit_id = p_unit and design_stage_id = p_from and status <> 'done';

  insert into design_steps (unit_id, design_stage_id, status, note)
  values (p_unit, p_to, 'working', nullif(trim(p_note), ''))
  on conflict (unit_id, design_stage_id) do update
    set status = 'working',
        note = coalesce(excluded.note, design_steps.note)
  returning id into v_step;

  insert into design_step_people (step_id, profile_id)
  select v_step, person from unnest(coalesce(p_people, '{}'::uuid[])) as person
  on conflict (step_id, profile_id) do nothing;
end $$;

revoke all on function design_pass_step(uuid, uuid, uuid, uuid[], text) from public, anon;
grant execute on function design_pass_step(uuid, uuid, uuid, uuid[], text) to authenticated;

-- Bringing a villa in: work under way before the board existed. Only on a
-- villa with nothing started — every board stage before this one is Done,
-- this one Working with these people.
create or replace function design_set_where(
  p_unit uuid,
  p_stage uuid,
  p_people uuid[]
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_order int;
  v_name text;
  v_step uuid;
begin
  if not has_app('/design-management') then
    raise exception 'You need the Design Management app to move a villa';
  end if;
  if exists (
    select 1 from design_steps where unit_id = p_unit and status <> 'not_started'
  ) then
    raise exception 'This villa has already started. Move it from its stages instead';
  end if;

  select s.sort_order, s.name into v_order, v_name
    from design_stages s
   where s.id = p_stage and s.on_board and s.is_active;
  if not found then
    raise exception 'That stage is not on the design board. Switch it on in Design stages first';
  end if;

  insert into design_steps (unit_id, design_stage_id, status)
  select p_unit, s.id, 'done'
    from design_stages s
   where s.on_board and s.is_active and (s.sort_order, s.name) < (v_order, v_name)
  on conflict (unit_id, design_stage_id) do update set status = 'done';

  insert into design_steps (unit_id, design_stage_id, status)
  values (p_unit, p_stage, 'working')
  on conflict (unit_id, design_stage_id) do update set status = 'working'
  returning id into v_step;

  insert into design_step_people (step_id, profile_id)
  select v_step, person from unnest(coalesce(p_people, '{}'::uuid[])) as person
  on conflict (step_id, profile_id) do nothing;
end $$;

revoke all on function design_set_where(uuid, uuid, uuid[]) from public, anon;
grant execute on function design_set_where(uuid, uuid, uuid[]) to authenticated;

-- ---------------------------------------------------------------------
-- 7. design_actions — the design team's to-do list
-- ---------------------------------------------------------------------
-- client_actions' shape after 0121, its own copy (one tool never leans on
-- another's tables): a villa (or none, a general to-do), the stage it
-- belongs to (optional), an owner, a date, a status. Never deleted —
-- marked done, with Undo. Whoever set it closes it, or an admin; its
-- owner marks it finished for them (founder: the plan's recommendation,
-- Client Relations' rule).

create table if not exists design_actions (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid references units (id),
  design_stage_id uuid references design_stages (id),
  action text not null,
  owner_id uuid not null references profiles (id),
  due_on date,
  status text not null default 'open',
  notes text,
  done_on date,
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint design_actions_action_check
    check (length(trim(action)) between 1 and 500),
  constraint design_actions_notes_check
    check (notes is null or length(notes) <= 4000),
  constraint design_actions_status_check
    check (status in (
      'open', 'waiting_client', 'waiting_management', 'awaiting_confirmation', 'done')),
  constraint design_actions_done_on_check
    check ((status = 'done') = (done_on is not null))
);

create index if not exists design_actions_unit_idx on design_actions (unit_id);
create index if not exists design_actions_open_owner_idx
  on design_actions (owner_id, due_on) where status <> 'done';

drop trigger if exists audit_design_actions on design_actions;
create trigger audit_design_actions
  after insert or update or delete on design_actions
  for each row execute function audit_row();

drop trigger if exists set_updated_at on design_actions;
create trigger set_updated_at
  before update on design_actions
  for each row execute function set_updated_at();

alter table design_actions enable row level security;

drop policy if exists "design_actions readable by design management app" on design_actions;
create policy "design_actions readable by design management app"
  on design_actions for select to authenticated
  using (has_app('/design-management'));

drop policy if exists "design_actions insertable by design management app" on design_actions;
create policy "design_actions insertable by design management app"
  on design_actions for insert to authenticated
  with check (has_app('/design-management'));

drop policy if exists "design_actions updatable by design management app" on design_actions;
create policy "design_actions updatable by design management app"
  on design_actions for update to authenticated
  using (has_app('/design-management'))
  with check (has_app('/design-management'));

-- The setter is whoever inserts it and never changes; closing or
-- reopening is the setter's or an admin's (0121's rule); the owner is on
-- the design team, on the way in and whenever it changes; done_on follows
-- the status. A session with no auth.uid() passes, as 0121's does.
create or replace function design_actions_guard()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(v_me, new.created_by, new.owner_id);
  elsif v_me is not null then
    if new.created_by is distinct from old.created_by then
      raise exception 'Who set an action cannot be changed';
    end if;
    if (new.status = 'done') <> (old.status = 'done')
       and v_me is distinct from coalesce(old.created_by, old.owner_id)
       and not is_admin() then
      raise exception 'Only whoever set this action, or a manager, can close it or open it again';
    end if;
  end if;

  if v_me is not null
     and (tg_op = 'INSERT' or new.owner_id is distinct from old.owner_id)
     and not exists (select 1 from design_team() t where t.id = new.owner_id) then
    raise exception 'That person does not hold Design Management, so they cannot own an action';
  end if;

  if new.status <> 'done' then
    new.done_on := null;
  elsif tg_op = 'UPDATE' and old.status = 'done' then
    new.done_on := old.done_on;
  else
    new.done_on := (now() at time zone 'Asia/Kolkata')::date;
  end if;

  return new;
end $$;

revoke all on function design_actions_guard() from public, anon, authenticated;

drop trigger if exists design_actions_guard on design_actions;
create trigger design_actions_guard
  before insert or update on design_actions
  for each row execute function design_actions_guard();

-- ---------------------------------------------------------------------
-- Prove it landed
-- ---------------------------------------------------------------------

do $$
declare
  t text;
  f text;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'design_stages' and column_name = 'on_board'
  ) then
    raise exception '0126: design_stages.on_board is missing';
  end if;

  foreach t in array array['design_steps', 'design_step_people', 'design_step_events', 'design_actions']
  loop
    if not (select relrowsecurity from pg_class where oid = t::regclass) then
      raise exception '0126: RLS is off on %', t;
    end if;
    -- Exactly one SELECT policy on each (SECURITY.md: never a second).
    if (select count(*) from pg_policies
        where schemaname = 'public' and tablename = t and cmd = 'SELECT') <> 1 then
      raise exception '0126: % should have exactly one SELECT policy', t;
    end if;
    if exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = t
        and (coalesce(qual, '') || coalesce(with_check, ''))
            not like '%has_app(''/design-management''::text)%'
    ) then
      raise exception '0126: a % policy is not gated on /design-management', t;
    end if;
    if exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = t and ('anon' = any (roles) or cmd = 'ALL')
    ) then
      raise exception '0126: a % policy admits anon or every command', t;
    end if;
  end loop;

  -- Steps and actions: read, add, change — never delete.
  foreach t in array array['design_steps', 'design_actions'] loop
    if (select count(*) from pg_policies where schemaname = 'public' and tablename = t) <> 3
       or exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = t and cmd = 'DELETE') then
      raise exception '0126: % should have SELECT, INSERT and UPDATE policies and no DELETE', t;
    end if;
  end loop;

  -- People: read, put on, take off — never edited.
  if (select count(*) from pg_policies
      where schemaname = 'public' and tablename = 'design_step_people') <> 3
     or exists (select 1 from pg_policies
                where schemaname = 'public' and tablename = 'design_step_people' and cmd = 'UPDATE') then
    raise exception '0126: design_step_people should have SELECT, INSERT and DELETE and no UPDATE';
  end if;

  -- History: read only. Only the log triggers write it.
  if (select count(*) from pg_policies
      where schemaname = 'public' and tablename = 'design_step_events') <> 1 then
    raise exception '0126: design_step_events must have its SELECT policy and nothing else';
  end if;

  -- The team: a definer whose grant check is its boundary.
  if not (select prosecdef from pg_proc where oid = 'design_team()'::regprocedure) then
    raise exception '0126: design_team must be security definer';
  end if;
  if position('has_app(''/design-management'')' in
       pg_get_functiondef('design_team()'::regprocedure)) = 0 then
    raise exception '0126: design_team has lost its grant check';
  end if;
  if has_function_privilege('anon', 'design_team()', 'execute')
     or not has_function_privilege('authenticated', 'design_team()', 'execute') then
    raise exception '0126: design_team must be executable by authenticated and not anon';
  end if;

  -- The two moves run as the caller.
  foreach f in array array[
    'design_pass_step(uuid, uuid, uuid, uuid[], text)', 'design_set_where(uuid, uuid, uuid[])'
  ] loop
    if (select prosecdef from pg_proc where oid = f::regprocedure) then
      raise exception '0126: % must run as the caller', f;
    end if;
    if has_function_privilege('anon', f, 'execute')
       or not has_function_privilege('authenticated', f, 'execute') then
      raise exception '0126: % must be executable by authenticated and not anon', f;
    end if;
  end loop;

  -- The two logs are definers no client role may call; the guards run as the caller.
  foreach f in array array['design_steps_log()', 'design_step_people_log()'] loop
    if not (select prosecdef from pg_proc where oid = f::regprocedure) then
      raise exception '0126: % must be security definer', f;
    end if;
  end loop;
  foreach f in array array['design_steps_guard()', 'design_step_people_guard()', 'design_actions_guard()'] loop
    if (select prosecdef from pg_proc where oid = f::regprocedure) then
      raise exception '0126: % must run as the caller', f;
    end if;
  end loop;
  foreach f in array array[
    'design_steps_log()', 'design_step_people_log()',
    'design_steps_guard()', 'design_step_people_guard()', 'design_actions_guard()'
  ] loop
    if has_function_privilege('authenticated', f, 'execute')
       or has_function_privilege('anon', f, 'execute') then
      raise exception '0126: a client role can execute %', f;
    end if;
  end loop;
end $$;
