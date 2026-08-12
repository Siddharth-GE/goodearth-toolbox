-- 0053 — Construction stages become a managed list
--
-- FOUNDER, 2026-08-12, on seeing Reporter group indents by stage:
-- "Foundation" and "foundation" and "interior" and "interiors" were all
-- living side by side, because the indent form and the construction
-- budget's stage tree both take stage as free-typed text. The decision:
-- stages come from a master list (managed in Projects & Masters), the
-- Indent app and the construction budget pick from it, and the handful
-- of existing rows are tidied to the list now.
--
-- Close to gst_rates (0021) in spirit — an operable value list with
-- `is_active` stopping new picks without touching history — but with
-- the standard uuid id alongside the unique name, because unlike a GST
-- slab a stage can be RENAMED (cascading to every indent), and that is
-- exactly the kind of change audit_row() should record; audit_row()
-- requires an `id`. The FKs below reference the unique name, so the
-- data keeps reading as words.
--
-- Re-runnable throughout.

-- ---------------------------------------------------------------------
-- 1. The list
-- ---------------------------------------------------------------------

create table if not exists construction_stages (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(trim(name)) > 0),
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists audit_construction_stages on construction_stages;
create trigger audit_construction_stages
  after insert or update or delete on construction_stages
  for each row execute function audit_row();

drop trigger if exists set_updated_at on construction_stages;
create trigger set_updated_at
  before update on construction_stages
  for each row execute function set_updated_at();

alter table construction_stages enable row level security;

-- Reference data: readable by any signed-in member of staff, like the
-- rest of Masters. Writes are Masters' job.
drop policy if exists "construction_stages readable by authenticated" on construction_stages;
create policy "construction_stages readable by authenticated"
  on construction_stages for select to authenticated
  using (true);

drop policy if exists "construction_stages writable by masters app" on construction_stages;
create policy "construction_stages writable by masters app"
  on construction_stages for insert to authenticated
  with check (has_app('/masters'));

drop policy if exists "construction_stages updatable by masters app" on construction_stages;
create policy "construction_stages updatable by masters app"
  on construction_stages for update to authenticated
  using (has_app('/masters')) with check (has_app('/masters'));

drop policy if exists "construction_stages deletable by masters app" on construction_stages;
create policy "construction_stages deletable by masters app"
  on construction_stages for delete to authenticated
  using (has_app('/masters'));

-- ---------------------------------------------------------------------
-- 2. Seed — the full build sequence, founder-approved 2026-08-12
-- ---------------------------------------------------------------------
-- Editable in Masters afterwards; this is a starting vocabulary, not a
-- cage. sort_order steps by 10 so a new stage can slot between two.

insert into construction_stages (name, sort_order) values
  ('Foundation', 10),
  ('Plinth', 20),
  ('Ledge', 30),
  ('Lintel', 40),
  ('Roof', 50),
  ('Plastering', 60),
  ('Flooring', 70),
  ('Joinery', 80),
  ('Painting', 90),
  ('Interiors', 100),
  ('Handover', 110)
on conflict (name) do nothing;

-- ---------------------------------------------------------------------
-- 3. Tidy the rows that exist (founder: "tidy them now")
-- ---------------------------------------------------------------------
-- Nine indents carry typed spellings; construction lines are already
-- clean. The singular/plural fix runs first, then a case-insensitive
-- canonicalisation against the list. Anything matching nothing stays
-- exactly as typed — see the NOT VALID note below.
--
-- indents_guard() refuses edits to submitted/approved indents, which is
-- exactly right for the app and exactly wrong for this one founder-
-- sanctioned spelling fix — so the guard alone steps aside for it.
-- audit_indents stays ON: every row this touches is recorded.

alter table indents disable trigger indents_guard;

update indents set stage = 'Interiors' where lower(stage) = 'interior';

update indents i
set stage = cs.name
from construction_stages cs
where i.stage is not null
  and lower(i.stage) = lower(cs.name)
  and i.stage <> cs.name;

alter table indents enable trigger indents_guard;

update construction_budget_lines l
set stage = cs.name
from construction_stages cs
where lower(l.stage) = lower(cs.name)
  and l.stage <> cs.name;

-- ---------------------------------------------------------------------
-- 4. New writes must come from the list; old rows are excused
-- ---------------------------------------------------------------------
-- NOT VALID is the founder's "existing entries can be excused" made
-- literal: Postgres enforces the reference on every INSERT and UPDATE
-- from now on but never re-checks rows already there — so a restore of
-- an old backup with stray spellings still restores, and nothing old
-- breaks. After the tidy above, today's data happens to be fully valid
-- anyway.
--
-- ON UPDATE CASCADE makes a rename in Masters follow through to every
-- indent and budget line carrying the stage — a rename is a business
-- decision, not a data migration. DELETE stays RESTRICT: a stage in use
-- is refused, per the house rule; deactivate it instead.

alter table indents drop constraint if exists indents_stage_fkey;
alter table indents
  add constraint indents_stage_fkey
  foreign key (stage) references construction_stages (name)
  on update cascade
  not valid;

alter table construction_budget_lines drop constraint if exists construction_budget_lines_stage_fkey;
alter table construction_budget_lines
  add constraint construction_budget_lines_stage_fkey
  foreign key (stage) references construction_stages (name)
  on update cascade
  not valid;

-- ---------------------------------------------------------------------
-- 5. Prove the tidy landed
-- ---------------------------------------------------------------------
-- Refuse to commit if any current indent stage still fails to match the
-- list — the whole point was one spelling per stage, and a silent miss
-- here would surface as a mystery group in a report weeks later.

do $$
declare
  v_stray int;
begin
  select count(*) into v_stray
  from indents i
  where i.stage is not null
    and not exists (select 1 from construction_stages cs where cs.name = i.stage);

  if v_stray > 0 then
    raise exception 'Tidy incomplete: % indents still carry a stage not on the list', v_stray;
  end if;
end $$;
