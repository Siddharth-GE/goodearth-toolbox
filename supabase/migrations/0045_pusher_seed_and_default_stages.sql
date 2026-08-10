-- 0045 — the starting vocabulary, and a schedule every project is born with
--
-- FOUNDER, 2026-08-10: "let each project when added to master or however
-- just have a default stages and schedule set (roughly, editable)" —
-- Masterplan, Approvals, Design, Technical Drawings, Construction,
-- Finishing, Interiors, Handover, over three years.
--
-- Three things here:
--   1. A starter set of ACTIVITIES — the vocabulary a trail is built from.
--   2. Three TRAIL TYPES built out of them.
--   3. The eight default stages, backfilled onto every project that
--      exists and given to every project created from now on.
--
-- WHAT IS DELIBERATELY NOT SEEDED: trails, people on legs, progress.
-- Nothing here invents work that did not happen. A seeded trail would
-- put a fake baton in a real person's court and a fake number on the
-- project picture, and the whole value of this tool is that its numbers
-- are true. The vocabulary is safe to guess at; the work is not.
--
-- Everything below is renameable, re-orderable and switchable off from
-- the app. `on conflict do nothing` throughout, so re-running is safe.

-- ---------------------------------------------------------------------
-- 1. Activities — the steps a trail is made of
-- ---------------------------------------------------------------------
-- Drawn from the work the toolbox already tracks and the eight stages
-- below, roughly in the order a house meets them. sort_order leaves gaps
-- of 10 so one can be slipped in between without renumbering.

insert into pusher_activities (name, sort_order) values
  ('Masterplan drawings',   10),
  ('Site survey',           20),
  ('Local body approval',   30),
  ('Fire NOC',              40),
  ('Environmental clearance', 50),
  ('Concept design',        60),
  ('Client sign-off',       70),
  ('Structural drawings',   80),
  ('MEP drawings',          90),
  ('Working drawings',     100),
  ('Selections handoff',   110),
  ('Budget approval',      120),
  ('Foundation',           130),
  ('Structure',            140),
  ('Roofing',              150),
  ('Plastering',           160),
  ('Waterproofing',        170),
  ('Flooring',             180),
  ('Painting',             190),
  ('Interiors install',    200),
  ('Snagging',             210),
  ('Site handover',        220)
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 2. Trail types — a named trail with its activities fixed
-- ---------------------------------------------------------------------
-- "Standard villa" is the full run of a house. The other two are short
-- repeatable trails that happen many times per project, which is the
-- other thing a type is good for.

insert into pusher_trail_sets (name, sort_order) values
  ('Standard villa',    10),
  ('Drawing approval',  20),
  ('Statutory approval', 30)
on conflict do nothing;

-- Items are inserted by NAME lookup rather than hard-coded uuids, so
-- this migration does not care what ids the inserts above produced and
-- stays re-runnable.
insert into pusher_trail_set_items (set_id, activity_id, sort_order, expected_days)
select s.id, a.id, v.sort_order, v.expected_days
from (values
  -- Standard villa: concept through to handover.
  ('Standard villa', 'Concept design',      10,  10),
  ('Standard villa', 'Client sign-off',     20,   5),
  ('Standard villa', 'Structural drawings', 30,  10),
  ('Standard villa', 'MEP drawings',        40,   8),
  ('Standard villa', 'Working drawings',    50,  10),
  ('Standard villa', 'Selections handoff',  60,   5),
  ('Standard villa', 'Budget approval',     70,   5),
  ('Standard villa', 'Foundation',          80,  21),
  ('Standard villa', 'Structure',           90,  60),
  ('Standard villa', 'Roofing',            100,  21),
  ('Standard villa', 'Plastering',         110,  21),
  ('Standard villa', 'Flooring',           120,  21),
  ('Standard villa', 'Painting',           130,  14),
  ('Standard villa', 'Interiors install',  140,  21),
  ('Standard villa', 'Snagging',           150,  10),
  ('Standard villa', 'Site handover',      160,   3),
  -- Drawing approval: the short loop that runs over and over.
  ('Drawing approval', 'Concept design',   10,   7),
  ('Drawing approval', 'Client sign-off',  20,   5),
  ('Drawing approval', 'Working drawings', 30,  10),
  -- Statutory approval: the outside-the-office waits.
  ('Statutory approval', 'Local body approval',     10, 30),
  ('Statutory approval', 'Fire NOC',                20, 21),
  ('Statutory approval', 'Environmental clearance', 30, 30)
) as v(set_name, activity_name, sort_order, expected_days)
join pusher_trail_sets s on s.name = v.set_name
join pusher_activities a on a.name = v.activity_name
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 3. The default schedule — eight stages, 156 weeks, three years
-- ---------------------------------------------------------------------
-- 156 weeks is three years exactly. Construction is a third of it, so it
-- moves the progress number by a third — which is the whole reason 0039
-- weights stages by length instead of counting them.
--
-- A FUNCTION rather than a copied list, because it is needed in two
-- places: backfilling the projects that already exist, and the trigger
-- that gives every future project the same start.

create or replace function seed_default_project_stages(p_project_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Never overwrite a schedule someone has already worked on. This makes
  -- the function safe to call again and safe to call from a trigger that
  -- might fire on a project restored from a backup.
  if exists (select 1 from project_stages where project_id = p_project_id) then
    return;
  end if;

  insert into project_stages (project_id, name, weeks, sort_order)
  values
    (p_project_id, 'Masterplan',         12,  10),
    (p_project_id, 'Approvals',          16,  20),
    (p_project_id, 'Design',             20,  30),
    (p_project_id, 'Technical Drawings', 16,  40),
    (p_project_id, 'Construction',       52,  50),
    (p_project_id, 'Finishing',          16,  60),
    (p_project_id, 'Interiors',          16,  70),
    (p_project_id, 'Handover',            8,  80)
  on conflict do nothing;
end $$;

-- SECURITY DEFINER is load-bearing here, and worth saying why. Creating a
-- project happens in MASTERS, which needs the /masters grant. The stage
-- tables are written by the relay's grant. Without definer rights a
-- master-data person would create a project and silently get no
-- schedule — the failure would be invisible, which is the worst kind.
revoke execute on function seed_default_project_stages(uuid) from public;

-- ---------------------------------------------------------------------
-- 4. Every new project starts with one
-- ---------------------------------------------------------------------
-- The plan's start date defaults to the day the project was created.
-- It is the only date anyone types in this whole tool (0039), and being
-- roughly right beats being empty — an empty start date means no
-- schedule renders at all.

create or replace function projects_seed_schedule()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform seed_default_project_stages(new.id);

  insert into pusher_project_plans (project_id, start_date, created_by, updated_by)
  values (new.id, current_date, auth.uid(), auth.uid())
  on conflict (project_id) do nothing;

  return new;
end $$;

drop trigger if exists projects_seed_schedule on projects;
create trigger projects_seed_schedule
  after insert on projects
  for each row execute function projects_seed_schedule();

-- ---------------------------------------------------------------------
-- 5. Backfill the projects that already exist
-- ---------------------------------------------------------------------
-- Their start date is the day they were created, which for a project
-- already under way is a guess — but a visible, editable one, and the
-- founder asked for "roughly, editable". A wrong start date shows up
-- immediately as a wrong-looking slip; a missing one shows nothing at
-- all and looks like the feature is broken.

do $$
declare
  r record;
begin
  for r in select id, created_at from projects
  loop
    perform seed_default_project_stages(r.id);
    insert into pusher_project_plans (project_id, start_date)
    values (r.id, r.created_at::date)
    on conflict (project_id) do nothing;
  end loop;
end $$;
