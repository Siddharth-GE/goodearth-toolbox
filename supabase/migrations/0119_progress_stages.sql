-- 0119 — Build progress: how far a villa's build has got, a Masters list
--
-- FOUNDER, 2026-10-16, bringing the Saarang tracker into Client
-- Relations: "construction stage lets make a masters table that lists it
-- and then link it here". Root plan.md, seventh piece. 0120 points each
-- plot's Client Relations record at one of these stages.
--
-- NOT construction_stages (0053). That list began as a build sequence but
-- now holds the masters workbook's cost packages — Engineering
-- Consultation, Site Mobilisation, Foundation, Superstructure … Carpentry
-- — which indents and construction budget lines are tagged with BY NAME
-- (both FKs reference construction_stages(name), on update cascade). It
-- answers "what is this money for", not "how far has this villa got".
-- Renaming it to the tracker's steps would rename every indent's stage;
-- adding the tracker's steps to it would put "Ground floor slab" in the
-- indent form's picker. Two meanings, two lists, and Masters' labels say
-- which is which.
--
-- The shape is 0053's: a uuid id, a unique name, sort_order in steps of
-- 10 so a stage can slot between two, is_active stopping new picks
-- without touching a plot that already sits on it; read by every
-- signed-in person (reference data, like the rest of Masters), written by
-- /masters, audited. Two differences, both deliberate:
--
--   * The name is unique ignoring case and outer spaces (0114's
--     tool_teams rule) — "Floor laying" and "floor laying " side by side
--     is the mess 0053 was written to end.
--   * 0120's foreign key uses the id, not the name — a renamed stage
--     needs no cascade, and nothing stores the name as text.
--
-- No stage on a plot means "not started". The LAST active stage by
-- sort_order means "handed over" — the plot rail's last step. There is no
-- flag column for it: a list where two stages both claim to be the end is
-- a state nobody could explain.
--
-- Re-runnable throughout.

-- ---------------------------------------------------------------------
-- 1. The list
-- ---------------------------------------------------------------------

create table if not exists progress_stages (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists progress_stages_name_key
  on progress_stages (lower(trim(name)));
create index if not exists progress_stages_order_idx
  on progress_stages (sort_order, name);

drop trigger if exists audit_progress_stages on progress_stages;
create trigger audit_progress_stages
  after insert or update or delete on progress_stages
  for each row execute function audit_row();

drop trigger if exists set_updated_at on progress_stages;
create trigger set_updated_at
  before update on progress_stages
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- 2. RLS — read by everyone signed in, written by Masters
-- ---------------------------------------------------------------------
-- Deleting a stage a plot sits on is refused by 0120's foreign key, not
-- by a policy: the person sees "switch it off instead", and history is
-- never rewritten.

alter table progress_stages enable row level security;

drop policy if exists "progress_stages readable by authenticated" on progress_stages;
create policy "progress_stages readable by authenticated"
  on progress_stages for select to authenticated
  using (true);

drop policy if exists "progress_stages insertable by masters app" on progress_stages;
create policy "progress_stages insertable by masters app"
  on progress_stages for insert to authenticated
  with check (has_app('/masters'));

drop policy if exists "progress_stages updatable by masters app" on progress_stages;
create policy "progress_stages updatable by masters app"
  on progress_stages for update to authenticated
  using (has_app('/masters')) with check (has_app('/masters'));

drop policy if exists "progress_stages deletable by masters app" on progress_stages;
create policy "progress_stages deletable by masters app"
  on progress_stages for delete to authenticated
  using (has_app('/masters'));

-- ---------------------------------------------------------------------
-- 3. Seed — the tracker's steps, in its order
-- ---------------------------------------------------------------------
-- The tracker's tenth, "Not started", is no stage at all. Editable in
-- Masters afterwards: a starting vocabulary, not a cage. A seed name goes
-- in only where no stage already carries it, so a re-run never renames
-- or re-orders what is there.

insert into progress_stages (name, sort_order)
select s.name, s.sort_order
from (values
  ('Agreement',              10),
  ('Excavation & levelling', 20),
  ('Ground floor brickwork', 30),
  ('Ground floor slab',      40),
  ('First floor slab',       50),
  ('Internal plastering',    60),
  ('Floor laying',           70),
  ('Painting & polishing',   80),
  ('Final handover',         90)
) as s(name, sort_order)
where not exists (
  select 1 from progress_stages p where lower(trim(p.name)) = lower(trim(s.name))
);

-- ---------------------------------------------------------------------
-- Prove it landed
-- ---------------------------------------------------------------------

do $$
begin
  if not (select relrowsecurity from pg_class where oid = 'progress_stages'::regclass) then
    raise exception '0119: RLS is off on progress_stages';
  end if;

  if (select count(*) from pg_policies
      where schemaname = 'public' and tablename = 'progress_stages') <> 4 then
    raise exception '0119: progress_stages should have exactly 4 policies';
  end if;

  if (select count(*) from pg_policies
      where schemaname = 'public' and tablename = 'progress_stages' and cmd = 'SELECT') <> 1 then
    raise exception '0119: progress_stages should have exactly one SELECT policy';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'progress_stages'
      and 'anon' = any (roles)
  ) then
    raise exception '0119: a progress_stages policy admits anon';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'progress_stages'
      and cmd in ('INSERT', 'UPDATE', 'DELETE')
      and coalesce(qual, '') || coalesce(with_check, '') not like '%has_app(''/masters''::text)%'
  ) then
    raise exception '0119: a progress_stages write policy is not gated on /masters';
  end if;

  if (select count(*) from progress_stages where is_active) < 2 then
    raise exception '0119: progress_stages has fewer than two active stages';
  end if;
end $$;
