-- 0099 — A drawing set belongs to a stage; a transmittal sends one set
--
-- FOUNDER, 2026-09-27, on staging: "why are [sets] from different stages
-- available everywhere … if i choose concept … i can put anything? …
-- one transmittal contains only one stage and you upload a drawing set
-- and inside that sheets … so each time a full set gets to site". And:
-- "each sheet gets renamed with the code, project name, villa name,
-- category, transmittal number and sheet name … when uploading a sheet
-- user has to enter it". Several named sets may share a stage.
--
--   1. design_stages.code — the short stage code a sheet's file name
--      carries (WD, STR, …). Seeded for the stages that exist; editable
--      on the Design stages screen.
--   2. drawing_sets.design_stage_id — the stage a set belongs to. Nullable
--      only because sets made before today have none; the app always sets
--      it, and §5 refuses to send a set that has none.
--   3. drawing_revision_files.sheet_code — the sheet's own short name
--      (GFP for ground floor plan), typed at upload. Unique within a
--      revision, so two sheets of one set never download under one name.
--   4. transmittal_lines: one line per transmittal — a transmittal sends
--      exactly one drawing set.
--   5. transmittal_lines_stage_match() — the set on a transmittal is a
--      set of that transmittal's stage.
--   6. transmittals_stage_locked() — a draft's stage cannot move out from
--      under the set already on it.
--   7. drawing_sets_stage_locked() — a set's stage, once given, is fixed.
--
-- The file name itself is NOT stored: the transmittal number is minted on
-- Issue, so the name is built when the sheet is downloaded
-- (lib/drawings/sheet-name.ts) from what these columns hold.
--
-- Additive throughout and re-runnable. No policy changes: every column
-- rides the existing RLS on its table.

-- ---------------------------------------------------------------------
-- 1. Stage codes
-- ---------------------------------------------------------------------

alter table design_stages add column if not exists code text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'design_stages_code_shape') then
    alter table design_stages
      add constraint design_stages_code_shape check (code is null or code ~ '^[A-Z0-9]{1,6}$');
  end if;
end $$;

create unique index if not exists design_stages_code_key on design_stages (code) where code is not null;

update design_stages s
set code = v.code
from (values
  ('concept', 'CON'),
  ('approvals', 'APP'),
  ('working drawings', 'WD'),
  ('structural', 'STR'),
  ('mep', 'MEP'),
  ('interiors', 'INT'),
  ('typical details', 'TD'),
  ('landscape', 'LND')
) as v (name, code)
where lower(s.name) = v.name
  and s.code is null
  and not exists (select 1 from design_stages o where o.code = v.code);

-- ---------------------------------------------------------------------
-- 2. A set's stage
-- ---------------------------------------------------------------------

alter table drawing_sets
  add column if not exists design_stage_id uuid references design_stages (id);

create index if not exists drawing_sets_stage_idx on drawing_sets (design_stage_id);

-- ---------------------------------------------------------------------
-- 3. Sheet codes
-- ---------------------------------------------------------------------

alter table drawing_revision_files add column if not exists sheet_code text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'drawing_revision_files_sheet_code_shape'
  ) then
    alter table drawing_revision_files
      add constraint drawing_revision_files_sheet_code_shape
      check (sheet_code is null or sheet_code ~ '^[A-Z0-9][A-Z0-9-]{0,19}$');
  end if;
end $$;

create unique index if not exists drawing_revision_files_sheet_code_key
  on drawing_revision_files (drawing_revision_id, sheet_code)
  where sheet_code is not null;

-- ---------------------------------------------------------------------
-- 4. One set per transmittal
-- ---------------------------------------------------------------------

do $$
begin
  if exists (
    select transmittal_id from transmittal_lines group by transmittal_id having count(*) > 1
  ) then
    raise exception
      '0099: a transmittal carries more than one drawing set — wipe or split those before applying (scripts/wipe-drawings.ts)';
  end if;
end $$;

create unique index if not exists transmittal_lines_one_per_transmittal
  on transmittal_lines (transmittal_id);

-- ---------------------------------------------------------------------
-- 5. The set matches the transmittal's stage
-- ---------------------------------------------------------------------

create or replace function transmittal_lines_stage_match()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_set_name text;
  v_set_stage uuid;
  v_set_stage_name text;
  v_transmittal_stage uuid;
  v_transmittal_stage_name text;
begin
  select s.name, s.design_stage_id, st.name
  into v_set_name, v_set_stage, v_set_stage_name
  from drawing_revisions r
  join drawing_sets s on s.id = r.drawing_set_id
  left join design_stages st on st.id = s.design_stage_id
  where r.id = new.drawing_revision_id;

  select t.design_stage_id, st.name
  into v_transmittal_stage, v_transmittal_stage_name
  from transmittals t
  join design_stages st on st.id = t.design_stage_id
  where t.id = new.transmittal_id;

  if v_set_stage is null then
    raise exception '"%" has no design stage, so it cannot be sent. Start a new set under the right stage.',
      v_set_name;
  end if;
  if v_set_stage is distinct from v_transmittal_stage then
    raise exception '"%" is a % set — it cannot go on a % transmittal.',
      v_set_name, v_set_stage_name, v_transmittal_stage_name;
  end if;
  return new;
end $$;

drop trigger if exists transmittal_lines_stage_match on transmittal_lines;
create trigger transmittal_lines_stage_match
  before insert or update on transmittal_lines
  for each row execute function transmittal_lines_stage_match();

-- ---------------------------------------------------------------------
-- 6. A draft's stage stays with the set on it
-- ---------------------------------------------------------------------

create or replace function transmittals_stage_locked()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.design_stage_id is distinct from old.design_stage_id
     and exists (select 1 from transmittal_lines l where l.transmittal_id = new.id) then
    raise exception 'This transmittal already carries a drawing set of its stage — the stage cannot change. Delete the draft and start again.';
  end if;
  return new;
end $$;

drop trigger if exists transmittals_stage_locked on transmittals;
create trigger transmittals_stage_locked
  before update of design_stage_id on transmittals
  for each row execute function transmittals_stage_locked();

-- ---------------------------------------------------------------------
-- 7. A set's stage is fixed once given
-- ---------------------------------------------------------------------

create or replace function drawing_sets_stage_locked()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.design_stage_id is not null
     and new.design_stage_id is distinct from old.design_stage_id then
    raise exception 'A drawing set''s stage never changes. Start a new set under the other stage.';
  end if;
  return new;
end $$;

drop trigger if exists drawing_sets_stage_locked on drawing_sets;
create trigger drawing_sets_stage_locked
  before update of design_stage_id on drawing_sets
  for each row execute function drawing_sets_stage_locked();

-- Plain (invoker) trigger functions, never called directly: named roles,
-- not public (the 0096 shape).
revoke execute on function transmittal_lines_stage_match() from public, anon, authenticated;
revoke execute on function transmittals_stage_locked() from public, anon, authenticated;
revoke execute on function drawing_sets_stage_locked() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 8. Prove it landed
-- ---------------------------------------------------------------------

do $$
declare
  fn text;
begin
  if not exists (
    select 1 from pg_indexes where indexname = 'transmittal_lines_one_per_transmittal'
  ) then
    raise exception '0099: the one-set-per-transmittal index is missing';
  end if;
  if not exists (
    select 1 from pg_indexes where indexname = 'drawing_revision_files_sheet_code_key'
  ) then
    raise exception '0099: the sheet-code index is missing';
  end if;

  foreach fn in array array[
    'transmittal_lines_stage_match()',
    'transmittals_stage_locked()',
    'drawing_sets_stage_locked()'
  ] loop
    if (select prosecdef from pg_proc where oid = fn::regprocedure) then
      raise exception '0099: % must be security invoker', fn;
    end if;
    if has_function_privilege('anon', fn, 'execute')
       or has_function_privilege('authenticated', fn, 'execute') then
      raise exception '0099: % is executable directly', fn;
    end if;
  end loop;

  if not exists (
    select 1 from pg_trigger where tgname = 'transmittal_lines_stage_match' and not tgisinternal
  ) then
    raise exception '0099: the stage-match trigger is missing';
  end if;
end $$;
