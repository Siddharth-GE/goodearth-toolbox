-- 0120 — Client Relations: next steps, Kaadal, build progress, the tracker's lists
--
-- FOUNDER, 2026-10-16, with the self-hosted Saarang Tracker: "i need to
-- add this module, with this kind of flow and ux for my CRM users on the
-- tool box" — and, on the plan's questions, "anyone with access can see
-- is ok, forget relay for this build do as needed". Root plan.md, seventh
-- piece; Client Relations' PLAN.md once vetted.
--
--   1. client_actions — the tracker's heart: every promise to a client
--      gets an owner, a date and a status. Prose, so it sits inside the
--      tool's gate like `details` (0050 §10) and joins no facts view.
--   2. client_engagements gains build progress (→ 0119's Masters list),
--      the three design checks as dates, and Kaadal interiors' stage,
--      owner and note. "Design and site status come from Relay only" was
--      Client Relations' decision 4; the founder amended it for these
--      (2026-10-16), because Relay knows whole trails, never "ground
--      floor slab".
--   3. Five vocabularies widen to the tracker's. Each CHECK is dropped
--      and re-added WIDER, so nothing stored becomes invalid.
--   4. client_relations_team() — who an action can be given to.
--
-- Everyone holding /client-relations sees every action, the same as every
-- plot (founder: "anyone with access can see is ok"). Who opens on whose
-- list is the screen's business, not a policy's.
--
-- Re-runnable throughout.

-- ---------------------------------------------------------------------
-- 1. client_actions
-- ---------------------------------------------------------------------
-- engagement_id null is a general action with no plot — the tracker
-- allows it, and refusing it is how a to-do ends up on a sticky note.
--
-- No delete, by the tracker's rule: "Actions are never deleted; they are
-- marked Done (with an Undo)". There is no DELETE policy below, so RLS
-- refuses every delete; audit_row() keeps every change.
--
-- done_on moves with status in one CHECK, so "done" and "done on" can
-- never disagree. due_assumed marks the 30 dates the old sheet never had
-- (the tracker set them to 29 Sep); it can only sit on a real date, and
-- the screen clears it the moment someone picks one.

create table if not exists client_actions (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid references client_engagements (id),
  action text not null,
  owner_id uuid not null references profiles (id),
  due_on date,
  due_assumed boolean not null default false,
  status text not null default 'open',
  track text not null default 'sales',
  notes text,
  done_on date,
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_actions_action_check
    check (length(trim(action)) between 1 and 500),
  constraint client_actions_notes_check
    check (notes is null or length(notes) <= 4000),
  constraint client_actions_status_check
    check (status in ('open', 'waiting_client', 'waiting_management', 'done')),
  constraint client_actions_track_check
    check (track in ('sales', 'kaadal')),
  constraint client_actions_done_on_check
    check ((status = 'done') = (done_on is not null)),
  constraint client_actions_assumed_check
    check (not due_assumed or due_on is not null)
);

create index if not exists client_actions_engagement_idx
  on client_actions (engagement_id);
create index if not exists client_actions_open_owner_idx
  on client_actions (owner_id, due_on) where status <> 'done';
create index if not exists client_actions_done_idx
  on client_actions (done_on desc) where status = 'done';

drop trigger if exists audit_client_actions on client_actions;
create trigger audit_client_actions
  after insert or update or delete on client_actions
  for each row execute function audit_row();

drop trigger if exists set_updated_at on client_actions;
create trigger set_updated_at
  before update on client_actions
  for each row execute function set_updated_at();

alter table client_actions enable row level security;

drop policy if exists "client_actions readable by client relations app" on client_actions;
create policy "client_actions readable by client relations app"
  on client_actions for select to authenticated
  using (has_app('/client-relations'));

drop policy if exists "client_actions insertable by client relations app" on client_actions;
create policy "client_actions insertable by client relations app"
  on client_actions for insert to authenticated
  with check (has_app('/client-relations'));

drop policy if exists "client_actions updatable by client relations app" on client_actions;
create policy "client_actions updatable by client relations app"
  on client_actions for update to authenticated
  using (has_app('/client-relations'))
  with check (has_app('/client-relations'));

-- ---------------------------------------------------------------------
-- 2. client_engagements grows
-- ---------------------------------------------------------------------
-- Build progress points at the Masters list by id (0119); deleting a
-- stage a plot sits on is refused, so Masters switches it off instead.
--
-- The three design checks are DATES, Client Relations' standing rule
-- (0050 §4, check_in_on): null is "not yet", and the chip stamps today.
-- A boolean beside a date is two columns that can disagree.
--
-- kaadal_owner_id is the FOURTH foreign key from this table to profiles
-- (crm_owner_id, created_by, updated_by), so every embed of profiles
-- through client_engagements already has to name its key, and still does
-- (BUGCATCHER #2).

alter table client_engagements
  add column if not exists progress_stage_id uuid references progress_stages (id),
  add column if not exists design_confirmed_on date,
  add column if not exists permit_on date,
  add column if not exists working_drawing_on date,
  add column if not exists kaadal_stage text,
  add column if not exists kaadal_owner_id uuid references profiles (id),
  add column if not exists kaadal_note text;

alter table client_engagements drop constraint if exists client_engagements_kaadal_stage_check;
alter table client_engagements add constraint client_engagements_kaadal_stage_check
  check (kaadal_stage in (
    'to_pitch', 'pitch_done', 'retainer_pending', 'retainer_paid',
    'in_design', 'execution', 'closed'));

alter table client_engagements drop constraint if exists client_engagements_kaadal_note_check;
alter table client_engagements add constraint client_engagements_kaadal_note_check
  check (kaadal_note is null or length(kaadal_note) <= 500);

create index if not exists client_engagements_progress_stage_idx
  on client_engagements (progress_stage_id) where progress_stage_id is not null;

-- ---------------------------------------------------------------------
-- 3. The tracker's lists — every CHECK only ever wider
-- ---------------------------------------------------------------------
-- Sale deed and CA: + not_started, drafting. The default stays
--   'not_signed', so no existing row changes meaning.
-- The original is with: + sreejayan, tarana.
-- Acknowledgement: + with_sreejayan, requested_from_client, pending.
-- Bottlenecks: + legal, bank_loan (the array's second CHECK, against a
--   NULL element, is untouched).
-- 0050's "a custodian only on a signed document" CHECKs are untouched.

alter table client_engagements drop constraint if exists client_engagements_sale_deed_status_check;
alter table client_engagements add constraint client_engagements_sale_deed_status_check
  check (sale_deed_status in ('not_started', 'drafting', 'not_signed', 'signed'));

alter table client_engagements drop constraint if exists client_engagements_ca_status_check;
alter table client_engagements add constraint client_engagements_ca_status_check
  check (ca_status in ('not_started', 'drafting', 'not_signed', 'signed'));

alter table client_engagements drop constraint if exists client_engagements_sale_deed_original_with_check;
alter table client_engagements add constraint client_engagements_sale_deed_original_with_check
  check (sale_deed_original_with in ('chess_cafe', 'client', 'bank', 'sreejayan', 'tarana'));

alter table client_engagements drop constraint if exists client_engagements_ca_original_with_check;
alter table client_engagements add constraint client_engagements_ca_original_with_check
  check (ca_original_with in ('chess_cafe', 'client', 'bank', 'sreejayan', 'tarana'));

alter table client_engagements drop constraint if exists client_engagements_sale_deed_ack_check;
alter table client_engagements add constraint client_engagements_sale_deed_ack_check
  check (sale_deed_ack in (
    'with_bank', 'received', 'with_sreejayan', 'requested_from_client', 'pending'));

alter table client_engagements drop constraint if exists client_engagements_ca_ack_check;
alter table client_engagements add constraint client_engagements_ca_ack_check
  check (ca_ack in (
    'with_bank', 'received', 'with_sreejayan', 'requested_from_client', 'pending'));

alter table client_engagements drop constraint if exists client_engagements_bottlenecks_known;
alter table client_engagements add constraint client_engagements_bottlenecks_known
  check (bottlenecks <@ array[
    'design', 'client', 'payments', 'management', 'interiors', 'legal', 'bank_loan']::text[]);

-- ---------------------------------------------------------------------
-- 4. client_relations_team() — who an action can be given to
-- ---------------------------------------------------------------------
-- Active people holding /client-relations, personally or through their
-- role bundle — admins left out, because an admin is a manager here, and
-- the tracker's managers clear "waiting on management" rather than own
-- the list.
--
-- SECURITY DEFINER because a member cannot read anyone else's grants
-- (user_apps is own-row, 0003). THE has_app CHECK IN THE BODY IS THE
-- WHOLE BOUNDARY (SECURITY.md): it hands back ids and names only — never
-- an email, never which grant — and only to someone already inside Client
-- Relations. The actions check every owner against this list on every
-- write, so an action is never given to someone who could not see it.

create or replace function client_relations_team()
returns table (id uuid, full_name text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not has_app('/client-relations') then
    raise exception 'You need the Client Relations app to see its team';
  end if;

  return query
    select p.id, p.full_name
      from profiles p
     where p.is_active
       and p.role is distinct from 'admin'
       and (
         exists (
           select 1 from user_apps ua
           where ua.user_id = p.id and ua.app = '/client-relations'
         )
         or exists (
           select 1 from role_apps ra
           where ra.role_id = p.role_id and ra.app = '/client-relations'
         )
       )
     order by p.full_name, p.id;
end $$;

revoke all on function client_relations_team() from public, anon;
grant execute on function client_relations_team() to authenticated;

-- ---------------------------------------------------------------------
-- Prove it landed
-- ---------------------------------------------------------------------

do $$
declare
  c text;
begin
  if not (select relrowsecurity from pg_class where oid = 'client_actions'::regclass) then
    raise exception '0120: RLS is off on client_actions';
  end if;

  -- One SELECT, one INSERT, one UPDATE — and no DELETE, ever.
  if (select count(*) from pg_policies
      where schemaname = 'public' and tablename = 'client_actions') <> 3 then
    raise exception '0120: client_actions should have exactly 3 policies';
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'client_actions' and cmd in ('DELETE', 'ALL')
  ) then
    raise exception '0120: client_actions must have no delete policy';
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'client_actions'
      and (coalesce(qual, '') || coalesce(with_check, '')) not like '%has_app(''/client-relations''::text)%'
  ) then
    raise exception '0120: a client_actions policy is not gated on /client-relations';
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'client_actions' and 'anon' = any (roles)
  ) then
    raise exception '0120: a client_actions policy admits anon';
  end if;

  foreach c in array array[
    'progress_stage_id', 'design_confirmed_on', 'permit_on', 'working_drawing_on',
    'kaadal_stage', 'kaadal_owner_id', 'kaadal_note'
  ] loop
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'client_engagements' and column_name = c
    ) then
      raise exception '0120: client_engagements.% is missing', c;
    end if;
  end loop;

  -- client_engagements' policies are 0050's, untouched: three, no delete.
  if (select count(*) from pg_policies
      where schemaname = 'public' and tablename = 'client_engagements') <> 3 then
    raise exception '0120: client_engagements should still have 3 policies';
  end if;

  if not (select prosecdef from pg_proc where oid = 'client_relations_team()'::regprocedure) then
    raise exception '0120: client_relations_team must be security definer';
  end if;
  if position('has_app(''/client-relations'')' in
       pg_get_functiondef('client_relations_team()'::regprocedure)) = 0 then
    raise exception '0120: client_relations_team has lost its grant check';
  end if;
  if has_function_privilege('anon', 'client_relations_team()', 'execute') then
    raise exception '0120: anon can execute client_relations_team';
  end if;
  if not has_function_privilege('authenticated', 'client_relations_team()', 'execute') then
    raise exception '0120: authenticated cannot execute client_relations_team';
  end if;
end $$;
