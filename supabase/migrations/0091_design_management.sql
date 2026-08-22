-- 0091 — Design Management: the drawings themselves
--
-- FOUNDER, 2026-08-22 (plan.md): the design team issues drawings to site
-- outside the toolbox today. Nothing records which revision a supervisor
-- is building from, and there is no transmittal trail. Relay deliberately
-- refuses this territory — it tracks who holds the baton, never what is
-- on the paper. This migration builds what Relay refuses.
--
-- The boundary, restated because it partially reverses a settled
-- decision: RELAY KEEPS WHO-HAS-THE-BATON; DESIGN MANAGEMENT KEEPS THE
-- DRAWINGS. STATUS.md's settled-decisions line moves in the same commit.
--
-- Four founder decisions, each visible below:
--
--   1. Its own customisable design-stage list, coexisting with Relay's
--      project stages — the works-vs-construction-stages precedent from
--      0073 §3. Concept, Approvals, Working Drawings, Structural, MEP,
--      Interiors, seeded and editable.
--   2. Revisions live PER DRAWING SET PER VILLA (R0, R1, … with a note)
--      — the Selections model from 0006, not a single per-villa revision.
--   3. A revision may hold SEVERAL FILES. One drawing set serves many
--      works, and a big set arrives as several sheets.
--   4. Sharing is in-app plus a letterhead PDF cover sheet, forwarded by
--      hand. No outbound email anywhere in this file.
--
-- Anchoring: the design side anchors unit_id, like Selections and the
-- Estimator. Supervisors stands on a plot and bridges to the unit through
-- the 0029 1:1, exactly as lib/supervisors/queries.ts already does.
--
-- NO MONEY, anywhere. There is no fact view here and no view at all, so
-- scripts/view-manifest.ts does not move.
--
-- '/design-management' has been a legal slug in both user_apps_app_known
-- and role_apps_app_known since 0030 (restated through 0084), so there is
-- deliberately no CHECK change in this file.
--
-- Re-runnable throughout.

-- ---------------------------------------------------------------------
-- 1. design_stages — the tool's own stage list
-- ---------------------------------------------------------------------
-- Reference data in the 0073 masters shape: readable by any signed-in
-- member of staff (names only, no money, nothing private), written by
-- the tool that owns it.

create table if not exists design_stages (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Case-insensitive: "Working drawings" and "Working Drawings" are one
-- stage, and a duplicate would split a villa's board in two.
create unique index if not exists design_stages_name_key
  on design_stages (lower(name));

-- ---------------------------------------------------------------------
-- 2. drawing_sets — the drawing master
-- ---------------------------------------------------------------------
-- "Working Drawings — Ground Floor" as a thing that exists once, not once
-- per villa. The per-villa artefact is a revision of it (section 4).

create table if not exists drawing_sets (
  id uuid primary key default gen_random_uuid(),
  -- Optional: the design team's own sheet code where they have one.
  code text check (code is null or length(trim(code)) > 0),
  name text not null check (length(trim(name)) > 0),
  description text,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists drawing_sets_code_key
  on drawing_sets (lower(code)) where code is not null;

-- ---------------------------------------------------------------------
-- 3. drawing_set_works — which works the master serves, by default
-- ---------------------------------------------------------------------
-- The DEFAULT links. A revision copies them at creation (section 5) and
-- may then differ — a villa where the set covers one extra work does not
-- rewrite the master for every other villa.
--
-- No `on delete cascade`, here or anywhere below: 0019:230's lesson is
-- that a cascaded child delete fires the child's guard AFTER the parent
-- row is gone, so the guard reads the status as 'missing' and raises. The
-- sanctioned delete paths are the two functions in section 10.

create table if not exists drawing_set_works (
  id uuid primary key default gen_random_uuid(),
  drawing_set_id uuid not null references drawing_sets (id),
  work_item_id uuid not null references work_items (id),
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  unique (drawing_set_id, work_item_id)
);

create index if not exists drawing_set_works_set_idx
  on drawing_set_works (drawing_set_id);
create index if not exists drawing_set_works_work_idx
  on drawing_set_works (work_item_id);

-- ---------------------------------------------------------------------
-- 4. drawing_revisions — R0, R1, … per villa per set
-- ---------------------------------------------------------------------
-- The 0006 selections shape, one level finer: a selection revision covers
-- a whole unit, a drawing revision covers one set within one unit.
--
-- Lifecycle: draft -> released -> superseded. A draft is the design
-- team's workspace and is invisible to site. Releasing happens by issuing
-- a transmittal that carries it (section 10) — never by hand, so a
-- released drawing always has a paper trail saying who was told.

create table if not exists drawing_revisions (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references units (id),
  drawing_set_id uuid not null references drawing_sets (id),
  revision_no int not null check (revision_no >= 0),
  -- What changed, in the designer's own words. This is what a supervisor
  -- reads first, so it is on the revision and not buried in a file.
  note text,
  status text not null default 'draft'
    check (status in ('draft', 'released', 'superseded')),
  released_at timestamptz,
  released_by uuid references profiles (id),
  superseded_by uuid references drawing_revisions (id),
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (unit_id, drawing_set_id, revision_no),
  -- The composite-FK target that makes a cross-villa transmittal line
  -- impossible (section 8) — the 0006 selections trick.
  unique (id, unit_id),
  -- A draft has never been released; anything else has. Superseded rows
  -- keep the date they went out, which is what history means.
  constraint drawing_revisions_release_shape
    check ((status = 'draft') = (released_at is null)),
  constraint drawing_revisions_superseded_shape
    check (superseded_by is null or status = 'superseded')
);

create index if not exists drawing_revisions_unit_idx
  on drawing_revisions (unit_id);
create index if not exists drawing_revisions_set_idx
  on drawing_revisions (drawing_set_id);
-- What Supervisors reads, and the only rows that matter to site.
create index if not exists drawing_revisions_released_idx
  on drawing_revisions (unit_id, drawing_set_id) where status = 'released';

-- At most one editable revision per villa per set, enforced by the
-- database rather than by remembering to check in every code path.
create unique index if not exists drawing_revisions_one_draft
  on drawing_revisions (unit_id, drawing_set_id) where status = 'draft';

-- ---------------------------------------------------------------------
-- 5. drawing_revision_works — what THIS revision serves
-- ---------------------------------------------------------------------
-- Copied from drawing_set_works when the revision is created, editable
-- while it is a draft, frozen on release. This is the "customisable on
-- release" the plan asks for, and it is what puts the "Drawing · R2" chip
-- against the right work in the Supervisors app.

create table if not exists drawing_revision_works (
  id uuid primary key default gen_random_uuid(),
  drawing_revision_id uuid not null references drawing_revisions (id),
  work_item_id uuid not null references work_items (id),
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  unique (drawing_revision_id, work_item_id)
);

create index if not exists drawing_revision_works_revision_idx
  on drawing_revision_works (drawing_revision_id);
create index if not exists drawing_revision_works_work_idx
  on drawing_revision_works (work_item_id);

-- ---------------------------------------------------------------------
-- 6. drawing_revision_files — the sheets themselves
-- ---------------------------------------------------------------------
-- The object KEY, never a URL: the bucket is private, so a URL would be
-- either wrong or a signed thing that expires. The route handler streams
-- it under the reader's own grant.
--
-- Server actions cap at 4 MB (next.config.ts) and Vercel caps a request
-- body at roughly 4.5 MB, so one file is 4 MB and a big set arrives as
-- several sheets. The bucket in section 12 holds the same limit, so a
-- file that slips past the form is still refused by the database.

create table if not exists drawing_revision_files (
  id uuid primary key default gen_random_uuid(),
  drawing_revision_id uuid not null references drawing_revisions (id),
  storage_path text not null unique,
  file_name text not null check (length(trim(file_name)) > 0),
  content_type text not null
    check (content_type in ('application/pdf', 'image/jpeg', 'image/png')),
  sort_order int not null default 0,
  uploaded_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

create index if not exists drawing_revision_files_revision_idx
  on drawing_revision_files (drawing_revision_id, sort_order);

-- ---------------------------------------------------------------------
-- 7. transmittals — the record of what was sent, and when
-- ---------------------------------------------------------------------
-- One villa, one design stage, one date, a list of drawings. Draft while
-- it is being assembled; issuing it is the act that releases the drawings
-- on it. An issued transmittal is immutable and cannot be deleted — it is
-- the answer to "what did site have on the 22nd", and an answer that can
-- be edited afterwards is not one.
--
-- The number is minted ON ISSUE, not on create: a draft that is abandoned
-- must not burn TR-0003 and leave a hole nobody can explain.

create table if not exists transmittal_counters (
  scope text primary key,
  last_no int not null default 0
);

create table if not exists transmittals (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references units (id),
  design_stage_id uuid not null references design_stages (id),
  -- TR-0001. Null until issued; unique across the company, because a
  -- transmittal is quoted on its own in an email or a phone call.
  number text unique,
  note text,
  status text not null default 'draft' check (status in ('draft', 'issued')),
  issued_at timestamptz,
  issued_by uuid references profiles (id),
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Target of transmittal_lines' composite FK.
  unique (id, unit_id),
  constraint transmittals_issue_shape
    check ((status = 'issued') = (number is not null and issued_at is not null))
);

create index if not exists transmittals_unit_idx on transmittals (unit_id);
create index if not exists transmittals_stage_idx on transmittals (design_stage_id);
create index if not exists transmittals_issued_idx
  on transmittals (issued_at) where status = 'issued';

-- ---------------------------------------------------------------------
-- 8. transmittal_lines — which revisions went out on it
-- ---------------------------------------------------------------------
-- unit_id is denormalised ON PURPOSE. The two composite foreign keys
-- below then make a cross-villa line impossible in the database: a
-- transmittal for villa A cannot carry a drawing revision of villa B, and
-- no code path can bypass that rule (the 0006 selection_lines trick).

create table if not exists transmittal_lines (
  id uuid primary key default gen_random_uuid(),
  transmittal_id uuid not null,
  unit_id uuid not null,
  drawing_revision_id uuid not null,
  sort_order int not null default 0,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  unique (transmittal_id, drawing_revision_id),
  foreign key (transmittal_id, unit_id) references transmittals (id, unit_id),
  foreign key (drawing_revision_id, unit_id) references drawing_revisions (id, unit_id)
);

create index if not exists transmittal_lines_transmittal_idx
  on transmittal_lines (transmittal_id, sort_order);
create index if not exists transmittal_lines_revision_idx
  on transmittal_lines (drawing_revision_id);

-- ---------------------------------------------------------------------
-- 9. Guards — the rules RLS cannot express
-- ---------------------------------------------------------------------
-- Invoker context throughout, and every one of these sits on a DIRECT
-- write path — a person pressing a button in this tool. None is reached
-- from a cross-tool trigger, so the 0071 / BUGCATCHER #11 trap (has_app()
-- answering for the requester however deep the nesting) does not apply
-- here. The messages are written for a designer to read.

create or replace function drawing_revisions_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'R% has already gone to site — it cannot be deleted. Start the next revision instead.',
        old.revision_no;
    end if;
    return old;
  end if;

  -- Identity is permanent in every status: a revision is a fact about one
  -- villa, one set and one number.
  if (new.unit_id, new.drawing_set_id, new.revision_no, new.created_by, new.created_at)
     is distinct from (old.unit_id, old.drawing_set_id, old.revision_no, old.created_by, old.created_at) then
    raise exception 'A revision''s villa, drawing set and number never change.';
  end if;

  -- Once released, only the status and the supersede pointer may move.
  if old.status <> 'draft' and new.note is distinct from old.note then
    raise exception 'R% is % — a drawing that has gone to site never changes. Start the next revision instead.',
      old.revision_no, old.status;
  end if;

  if new.status = old.status then
    return new;
  end if;
  if old.status = 'draft' and new.status = 'released' then
    return new;
  end if;
  if old.status = 'released' and new.status = 'superseded' then
    return new;
  end if;

  raise exception 'A drawing revision cannot go from % to %.', old.status, new.status;
end $$;

drop trigger if exists drawing_revisions_guard on drawing_revisions;
create trigger drawing_revisions_guard
  before update or delete on drawing_revisions
  for each row execute function drawing_revisions_guard();

-- Files and work links belong to the revision's draft. Once it is
-- released, what went to site is what stays on the record.
create or replace function drawing_revision_child_draft_only()
returns trigger
language plpgsql
as $$
declare
  v_revision uuid;
  v_status text;
  v_no int;
begin
  if tg_op = 'DELETE' then
    v_revision := old.drawing_revision_id;
  else
    v_revision := new.drawing_revision_id;
  end if;

  select status, revision_no into v_status, v_no
  from drawing_revisions where id = v_revision;

  if v_status is distinct from 'draft' then
    raise exception 'R% is % — its drawings and work links are fixed. Start the next revision instead.',
      coalesce(v_no::text, '?'), coalesce(v_status, 'missing');
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end $$;

drop trigger if exists drawing_revision_works_draft_only on drawing_revision_works;
create trigger drawing_revision_works_draft_only
  before insert or update or delete on drawing_revision_works
  for each row execute function drawing_revision_child_draft_only();

drop trigger if exists drawing_revision_files_draft_only on drawing_revision_files;
create trigger drawing_revision_files_draft_only
  before insert or update or delete on drawing_revision_files
  for each row execute function drawing_revision_child_draft_only();

create or replace function transmittals_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'Transmittal % has been issued — it stays on the record. Issue a new one instead.',
        old.number;
    end if;
    return old;
  end if;

  if (new.unit_id, new.created_by, new.created_at)
     is distinct from (old.unit_id, old.created_by, old.created_at) then
    raise exception 'A transmittal''s villa and who raised it never change.';
  end if;

  if old.status = 'issued' then
    if (new.design_stage_id, new.number, new.note, new.issued_at, new.issued_by, new.status)
       is distinct from (old.design_stage_id, old.number, old.note, old.issued_at, old.issued_by, old.status) then
      raise exception 'Transmittal % has been issued — an issued transmittal never changes.', old.number;
    end if;
  end if;

  return new;
end $$;

drop trigger if exists transmittals_guard on transmittals;
create trigger transmittals_guard
  before update or delete on transmittals
  for each row execute function transmittals_guard();

create or replace function transmittal_lines_draft_only()
returns trigger
language plpgsql
as $$
declare
  v_transmittal uuid;
  v_status text;
  v_number text;
begin
  if tg_op = 'DELETE' then
    v_transmittal := old.transmittal_id;
  else
    v_transmittal := new.transmittal_id;
  end if;

  select status, number into v_status, v_number
  from transmittals where id = v_transmittal;

  if v_status is distinct from 'draft' then
    raise exception 'Transmittal % is % — what was sent cannot be changed afterwards.',
      coalesce(v_number, 'this'), coalesce(v_status, 'missing');
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end $$;

drop trigger if exists transmittal_lines_draft_only on transmittal_lines;
create trigger transmittal_lines_draft_only
  before insert or update or delete on transmittal_lines
  for each row execute function transmittal_lines_draft_only();

-- ---------------------------------------------------------------------
-- 10. The three multi-statement operations
-- ---------------------------------------------------------------------
-- security invoker throughout: RLS still applies, so none of these is a
-- way around the /design-management grant. They exist only to make the
-- steps atomic — the 0007 and 0017 §8 shape.

-- Issuing: the one act that puts a drawing in front of site.
create or replace function issue_transmittal(p_transmittal_id uuid)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_unit_id uuid;
  v_line_count int;
  v_no int;
  v_number text;
  v_rev record;
begin
  -- Lock the row so two people pressing Issue at once cannot both go on.
  select unit_id into v_unit_id
  from transmittals
  where id = p_transmittal_id and status = 'draft'
  for update;

  if not found then
    raise exception 'Only a draft transmittal can be issued.';
  end if;

  select count(*) into v_line_count
  from transmittal_lines where transmittal_id = p_transmittal_id;
  if v_line_count = 0 then
    raise exception 'Add at least one drawing before issuing this transmittal.';
  end if;

  for v_rev in
    select r.id, r.unit_id, r.drawing_set_id, r.status
    from transmittal_lines l
    join drawing_revisions r on r.id = l.drawing_revision_id
    where l.transmittal_id = p_transmittal_id
    order by l.sort_order, l.created_at
    for update of r
  loop
    -- A line may carry an ALREADY-RELEASED revision: the same set going
    -- out again at a new stage, which is normal — one set serves many
    -- activities. Nothing to do for those; they stay current.
    if v_rev.status = 'draft' then
      -- Release first, then retire the old one. In that order the villa
      -- is never momentarily left with no released drawing for this set,
      -- and superseded_by points at what replaced it (0007's ordering).
      update drawing_revisions
      set status = 'released',
          released_at = now(),
          released_by = auth.uid(),
          updated_at = now()
      where id = v_rev.id;

      update drawing_revisions
      set status = 'superseded',
          superseded_by = v_rev.id,
          updated_at = now()
      where unit_id = v_rev.unit_id
        and drawing_set_id = v_rev.drawing_set_id
        and status = 'released'
        and id <> v_rev.id;
    end if;
  end loop;

  -- Minted here and nowhere else. greatest() because lpad TRUNCATES a
  -- string longer than its target — lpad('12345', 4) is '1234' (0019).
  insert into transmittal_counters (scope, last_no)
  values ('global', 1)
  on conflict (scope) do update set last_no = transmittal_counters.last_no + 1
  returning last_no into v_no;

  v_number := 'TR-' || lpad(v_no::text, greatest(4, length(v_no::text)), '0');

  update transmittals
  set status = 'issued',
      number = v_number,
      issued_at = now(),
      issued_by = auth.uid(),
      updated_at = now()
  where id = p_transmittal_id;

  return v_number;
end $$;

-- Deleting a draft is atomic. Two requests — children, then parent — can
-- fail in between and strand a header with its lines gone (0017 §8).
create or replace function delete_draft_transmittal(p_transmittal_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  perform 1 from transmittals
  where id = p_transmittal_id and status = 'draft'
  for update;

  if not found then
    raise exception 'Only a draft transmittal can be deleted.';
  end if;

  delete from transmittal_lines where transmittal_id = p_transmittal_id;
  delete from transmittals where id = p_transmittal_id;
end $$;

-- The same, for a draft revision raised by mistake. The caller removes
-- the storage objects AFTER this returns — rows first, then objects, so a
-- failure leaves an orphan file and never a row pointing at nothing.
create or replace function delete_draft_revision(p_revision_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  perform 1 from drawing_revisions
  where id = p_revision_id and status = 'draft'
  for update;

  if not found then
    raise exception 'Only a draft revision can be deleted. A drawing that has gone to site stays on the record.';
  end if;

  if exists (
    select 1 from transmittal_lines where drawing_revision_id = p_revision_id
  ) then
    raise exception 'This revision is on a transmittal — take it off that transmittal first.';
  end if;

  delete from drawing_revision_files where drawing_revision_id = p_revision_id;
  delete from drawing_revision_works where drawing_revision_id = p_revision_id;
  delete from drawing_revisions where id = p_revision_id;
end $$;

-- `revoke ... from public` does NOT remove anon — Supabase grants EXECUTE
-- to anon and authenticated by name, so both are named (0071 / SEC-03).
revoke execute on function issue_transmittal(uuid) from public, anon;
grant execute on function issue_transmittal(uuid) to authenticated;
revoke execute on function delete_draft_transmittal(uuid) from public, anon;
grant execute on function delete_draft_transmittal(uuid) to authenticated;
revoke execute on function delete_draft_revision(uuid) from public, anon;
grant execute on function delete_draft_revision(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 11. Audit, updated_at, RLS
-- ---------------------------------------------------------------------

do $$
declare
  t text;
begin
  for t in select unnest(array[
    'design_stages', 'drawing_sets', 'drawing_set_works',
    'drawing_revisions', 'drawing_revision_works', 'drawing_revision_files',
    'transmittals', 'transmittal_lines'
  ])
  loop
    execute format('drop trigger if exists audit_%I on %I', t, t);
    execute format(
      'create trigger audit_%I after insert or update or delete on %I
         for each row execute function audit_row()', t, t);
  end loop;

  -- Only the four tables that carry updated_at.
  for t in select unnest(array[
    'design_stages', 'drawing_sets', 'drawing_revisions', 'transmittals'
  ])
  loop
    execute format('drop trigger if exists set_updated_at on %I', t);
    execute format(
      'create trigger set_updated_at before update on %I
         for each row execute function set_updated_at()', t);
  end loop;

  -- The counter is machinery, not a record: no audit, no updated_at.
  for t in select unnest(array[
    'design_stages', 'drawing_sets', 'drawing_set_works',
    'drawing_revisions', 'drawing_revision_works', 'drawing_revision_files',
    'transmittals', 'transmittal_lines', 'transmittal_counters'
  ])
  loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- --- The two masters: read by anyone signed in, written by this tool ---
-- Names of stages and drawing sets carry nothing private and no money,
-- and Supervisors needs to read the set's name to label a drawing.

do $$
declare
  t text;
begin
  for t in select unnest(array['design_stages', 'drawing_sets'])
  loop
    execute format('drop policy if exists "%s readable by authenticated" on %I', t, t);
    execute format(
      'create policy "%s readable by authenticated" on %I
         for select to authenticated using (true)', t, t);

    execute format('drop policy if exists "%s writable by design management app" on %I', t, t);
    execute format(
      'create policy "%s writable by design management app" on %I
         for insert to authenticated with check (has_app(''/design-management''))', t, t);

    execute format('drop policy if exists "%s updatable by design management app" on %I', t, t);
    execute format(
      'create policy "%s updatable by design management app" on %I
         for update to authenticated
         using (has_app(''/design-management'')) with check (has_app(''/design-management''))', t, t);

    execute format('drop policy if exists "%s deletable by design management app" on %I', t, t);
    execute format(
      'create policy "%s deletable by design management app" on %I
         for delete to authenticated using (has_app(''/design-management''))', t, t);
  end loop;
end $$;

-- drawing_set_works: part of the master, so it reads like the master.
drop policy if exists "drawing_set_works readable by authenticated" on drawing_set_works;
create policy "drawing_set_works readable by authenticated" on drawing_set_works
  for select to authenticated using (true);

drop policy if exists "drawing_set_works writable by design management app" on drawing_set_works;
create policy "drawing_set_works writable by design management app" on drawing_set_works
  for insert to authenticated with check (has_app('/design-management'));

drop policy if exists "drawing_set_works deletable by design management app" on drawing_set_works;
create policy "drawing_set_works deletable by design management app" on drawing_set_works
  for delete to authenticated using (has_app('/design-management'));

-- --- Revisions: the one widened qual ---
-- ONE SELECT policy, its qual widened — never a second policy, because
-- permissive policies OR together and the second one is invisible.
-- Site sees what has been released and never a draft; the drafts are the
-- design team's workspace, and this is the line that keeps them private.

drop policy if exists "drawing_revisions readable by design and site" on drawing_revisions;
create policy "drawing_revisions readable by design and site" on drawing_revisions
  for select to authenticated using (
    has_app('/design-management')
    or (has_app('/supervisors') and status <> 'draft')
  );

drop policy if exists "drawing_revisions writable by design management app" on drawing_revisions;
create policy "drawing_revisions writable by design management app" on drawing_revisions
  for insert to authenticated
  with check (has_app('/design-management') and status = 'draft');

drop policy if exists "drawing_revisions updatable by design management app" on drawing_revisions;
create policy "drawing_revisions updatable by design management app" on drawing_revisions
  for update to authenticated
  using (has_app('/design-management')) with check (has_app('/design-management'));

drop policy if exists "drawing_revisions deletable by design management app" on drawing_revisions;
create policy "drawing_revisions deletable by design management app" on drawing_revisions
  for delete to authenticated
  using (has_app('/design-management') and status = 'draft');

-- --- A revision's children inherit its visibility ---
-- The `exists` repeats the parent's qual rather than trusting the parent
-- policy alone, so the rule is stated where the rows are.

drop policy if exists "drawing_revision_works readable by design and site" on drawing_revision_works;
create policy "drawing_revision_works readable by design and site" on drawing_revision_works
  for select to authenticated using (
    exists (
      select 1 from drawing_revisions r
      where r.id = drawing_revision_works.drawing_revision_id
        and (
          has_app('/design-management')
          or (has_app('/supervisors') and r.status <> 'draft')
        )
    )
  );

drop policy if exists "drawing_revision_works writable by design management app" on drawing_revision_works;
create policy "drawing_revision_works writable by design management app" on drawing_revision_works
  for insert to authenticated with check (has_app('/design-management'));

drop policy if exists "drawing_revision_works deletable by design management app" on drawing_revision_works;
create policy "drawing_revision_works deletable by design management app" on drawing_revision_works
  for delete to authenticated using (has_app('/design-management'));

drop policy if exists "drawing_revision_files readable by design and site" on drawing_revision_files;
create policy "drawing_revision_files readable by design and site" on drawing_revision_files
  for select to authenticated using (
    exists (
      select 1 from drawing_revisions r
      where r.id = drawing_revision_files.drawing_revision_id
        and (
          has_app('/design-management')
          or (has_app('/supervisors') and r.status <> 'draft')
        )
    )
  );

drop policy if exists "drawing_revision_files writable by design management app" on drawing_revision_files;
create policy "drawing_revision_files writable by design management app" on drawing_revision_files
  for insert to authenticated with check (has_app('/design-management'));

-- No UPDATE policy: a replacement sheet is a new file at a new path, and
-- the old one is removed. There is nothing to edit in place.
drop policy if exists "drawing_revision_files deletable by design management app" on drawing_revision_files;
create policy "drawing_revision_files deletable by design management app" on drawing_revision_files
  for delete to authenticated using (has_app('/design-management'));

-- --- Transmittals: the same widening, on issued rather than released ---

drop policy if exists "transmittals readable by design and site" on transmittals;
create policy "transmittals readable by design and site" on transmittals
  for select to authenticated using (
    has_app('/design-management')
    or (has_app('/supervisors') and status = 'issued')
  );

drop policy if exists "transmittals writable by design management app" on transmittals;
create policy "transmittals writable by design management app" on transmittals
  for insert to authenticated
  with check (has_app('/design-management') and status = 'draft');

drop policy if exists "transmittals updatable by design management app" on transmittals;
create policy "transmittals updatable by design management app" on transmittals
  for update to authenticated
  using (has_app('/design-management')) with check (has_app('/design-management'));

drop policy if exists "transmittals deletable by design management app" on transmittals;
create policy "transmittals deletable by design management app" on transmittals
  for delete to authenticated
  using (has_app('/design-management') and status = 'draft');

drop policy if exists "transmittal_lines readable by design and site" on transmittal_lines;
create policy "transmittal_lines readable by design and site" on transmittal_lines
  for select to authenticated using (
    exists (
      select 1 from transmittals t
      where t.id = transmittal_lines.transmittal_id
        and (
          has_app('/design-management')
          or (has_app('/supervisors') and t.status = 'issued')
        )
    )
  );

drop policy if exists "transmittal_lines writable by design management app" on transmittal_lines;
create policy "transmittal_lines writable by design management app" on transmittal_lines
  for insert to authenticated with check (has_app('/design-management'));

drop policy if exists "transmittal_lines deletable by design management app" on transmittal_lines;
create policy "transmittal_lines deletable by design management app" on transmittal_lines
  for delete to authenticated using (has_app('/design-management'));

-- --- The counter ---
-- Readable so a screen can say what the next number will be; written
-- only through issue_transmittal(), which runs as the caller.

drop policy if exists "transmittal_counters readable by authenticated" on transmittal_counters;
create policy "transmittal_counters readable by authenticated" on transmittal_counters
  for select to authenticated using (true);

drop policy if exists "transmittal_counters writable by design management app" on transmittal_counters;
create policy "transmittal_counters writable by design management app" on transmittal_counters
  for insert to authenticated with check (has_app('/design-management'));

drop policy if exists "transmittal_counters updatable by design management app" on transmittal_counters;
create policy "transmittal_counters updatable by design management app" on transmittal_counters
  for update to authenticated
  using (has_app('/design-management')) with check (has_app('/design-management'));

-- ---------------------------------------------------------------------
-- 12. The `drawings` bucket
-- ---------------------------------------------------------------------
-- PRIVATE, like staff-photos and design-views. A drawing is a client's
-- house on paper; a public bucket would leave it at a guessable URL for
-- ever, and nothing revokes that.
--
-- 4 MB is the server-action body cap (next.config.ts), stated again here
-- so a file that gets past the form is still refused by the database.
--
-- Creating the bucket is infrastructure, like a migration, and not
-- something an upload should attempt at runtime (0010, 0061).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'drawings', 'drawings', false, 4194304,
  array['application/pdf', 'image/jpeg', 'image/png']
)
on conflict (id) do update
  set public = false,
      file_size_limit = 4194304,
      allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png'];

-- public.has_app is FULLY QUALIFIED — 0010's and 0061's lesson: policies
-- on storage.objects do not run with `public` on the search path, and an
-- unqualified call fails at UPLOAD TIME rather than at apply time, so the
-- migration's own assertions would pass and the first upload would not.

drop policy if exists "drawings readable by design and site" on storage.objects;
create policy "drawings readable by design and site"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'drawings'
    and (
      public.has_app('/design-management')
      or public.has_app('/supervisors')
    )
  );

-- Storage cannot see whether a revision is a draft, so this policy is
-- deliberately coarser than the table's. The narrow gate is the file
-- route: it looks the row up through the RLS-scoped client first, so a
-- supervisor never learns the path of a draft sheet in the first place.

drop policy if exists "drawings writable by design management app" on storage.objects;
create policy "drawings writable by design management app"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'drawings' and public.has_app('/design-management'));

drop policy if exists "drawings deletable by design management app" on storage.objects;
create policy "drawings deletable by design management app"
  on storage.objects for delete to authenticated
  using (bucket_id = 'drawings' and public.has_app('/design-management'));

-- No UPDATE policy, matching section 6: a replacement is a new object at
-- a new path (revisions/<revisionId>/<uuid>.<ext>).

-- ---------------------------------------------------------------------
-- 13. Seed the six design stages
-- ---------------------------------------------------------------------
-- The founder's vocabulary, 2026-08-22. Reference data, not a credential
-- — it passes the "what does this become on a database that is replayed"
-- test. sort_order steps by 10 so a stage can slot between two, and the
-- whole list is editable in the tool afterwards.
--
-- insert ... where not exists rather than `on conflict`, because the
-- uniqueness is a functional index on lower(name).

insert into design_stages (name, sort_order)
select v.name, v.sort_order
from (values
  ('Concept',           10),
  ('Approvals',         20),
  ('Working Drawings',  30),
  ('Structural',        40),
  ('MEP',               50),
  ('Interiors',         60)
) as v (name, sort_order)
where not exists (
  select 1 from design_stages s where lower(s.name) = lower(v.name)
);

-- ---------------------------------------------------------------------
-- 14. Prove it all landed
-- ---------------------------------------------------------------------

do $$
declare
  r record;
  t text;
  v int;
begin
  -- RLS on every table, and the policy count each one claimed.
  for r in
    select * from (values
      ('design_stages', 4),
      ('drawing_sets', 4),
      ('drawing_set_works', 3),
      ('drawing_revisions', 4),
      ('drawing_revision_works', 3),
      ('drawing_revision_files', 3),
      ('transmittals', 4),
      ('transmittal_lines', 3),
      ('transmittal_counters', 3)
    ) as x (name, expected)
  loop
    if not exists (
      select 1 from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = r.name and c.relrowsecurity
    ) then
      raise exception '0091: % is missing or has RLS off', r.name;
    end if;

    select count(*) into v from pg_policies
      where schemaname = 'public' and tablename = r.name;
    if v <> r.expected then
      raise exception '0091: % has % policies, expected %', r.name, v, r.expected;
    end if;
  end loop;

  -- Exactly one SELECT policy on each gated table — a second permissive
  -- one would OR itself in invisibly.
  foreach t in array array[
    'drawing_revisions', 'drawing_revision_works', 'drawing_revision_files',
    'transmittals', 'transmittal_lines'
  ]
  loop
    select count(*) into v from pg_policies
      where schemaname = 'public' and tablename = t and cmd = 'SELECT';
    if v <> 1 then
      raise exception '0091: % has % SELECT policies, expected exactly 1', t, v;
    end if;
  end loop;

  -- Site can see released work and never a draft.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'drawing_revisions'
      and cmd = 'SELECT' and qual like '%/supervisors%' and qual like '%draft%'
  ) then
    raise exception '0091: the drawing_revisions read policy does not admit site, or does not exclude drafts';
  end if;

  -- Every guard present.
  foreach t in array array[
    'drawing_revisions_guard', 'drawing_revision_works_draft_only',
    'drawing_revision_files_draft_only', 'transmittals_guard',
    'transmittal_lines_draft_only'
  ]
  loop
    if not exists (
      select 1 from pg_trigger where tgname = t and not tgisinternal
    ) then
      raise exception '0091: the % trigger is missing', t;
    end if;
  end loop;

  -- Audit on all eight records, updated_at on the four that carry it.
  select count(*) into v from pg_trigger
    where tgrelid in (
      'design_stages'::regclass, 'drawing_sets'::regclass,
      'drawing_set_works'::regclass, 'drawing_revisions'::regclass,
      'drawing_revision_works'::regclass, 'drawing_revision_files'::regclass,
      'transmittals'::regclass, 'transmittal_lines'::regclass)
    and tgname like 'audit\_%';
  if v <> 8 then
    raise exception '0091: expected 8 audit triggers, found %', v;
  end if;

  select count(*) into v from pg_trigger
    where tgrelid in (
      'design_stages'::regclass, 'drawing_sets'::regclass,
      'drawing_revisions'::regclass, 'transmittals'::regclass)
    and tgname = 'set_updated_at';
  if v <> 4 then
    raise exception '0091: expected 4 set_updated_at triggers, found %', v;
  end if;

  -- The three functions, reachable by a signed-in person and by nobody
  -- holding only the public anon key.
  foreach t in array array[
    'public.issue_transmittal(uuid)', 'public.delete_draft_transmittal(uuid)',
    'public.delete_draft_revision(uuid)'
  ]
  loop
    if has_function_privilege('anon', t, 'execute') then
      raise exception '0091: anon can execute %', t;
    end if;
    if not has_function_privilege('authenticated', t, 'execute') then
      raise exception '0091: authenticated cannot execute %', t;
    end if;
  end loop;

  -- The bucket, private and capped, with exactly its three policies.
  if not exists (
    select 1 from storage.buckets
    where id = 'drawings' and not public and file_size_limit = 4194304
  ) then
    raise exception '0091: the drawings bucket is missing, public, or not capped at 4 MB';
  end if;

  select count(*) into v from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname like 'drawings %';
  if v <> 3 then
    raise exception '0091: expected 3 drawings storage policies, found %', v;
  end if;

  -- NOT asserted, deliberately: whether the source text qualified
  -- has_app. Postgres resolves the function to an OID when the policy is
  -- created, so pg_policies renders both forms identically and a check
  -- here could only ever answer yes. The qualification above is held by
  -- reading it, and by the upload smoke test — a check that cannot fail
  -- is worse than no check, because the next person trusts it.

  -- The seeded stages.
  select count(*) into v from design_stages;
  if v < 6 then
    raise exception '0091: expected 6 design stages, found %', v;
  end if;
end $$;
