-- 0122 — Transmittals the design team can use
--
-- FOUNDER, 2026-10-17, after the design team's first day on staging:
--
--   1. "just make a tool box id addition, since we had an already ongoing
--      series from excel". Issue mints TB-0003 where it minted the old
--      TR- series: still counted per villa (0092), each villa's counter
--      carrying on. The numbers already issued stay as they are — an
--      issued transmittal never changes (0092's precedent).
--   2. The revision number is the designer's to set while the revision is
--      a draft — any number above every revision the set already has on
--      that villa, so a set the team had at R2 in Excel starts here at
--      R3. Once it has gone to site it never moves, and a number is still
--      never re-used.
--   3. "lets not get into file handling, new transmittal is created and
--      they paste a link of our drive into it". A revision's drawings are
--      a Zoho WorkDrive share link ("anyone can view"). The release gate
--      (0093: no drawing goes to site without a file) becomes a link OR an
--      uploaded sheet. The link is frozen once released, like the note.
--   4. "is there a way that an uploaded link autocounts and extracts the
--      name": the server reads the shared folder's list and keeps it per
--      revision in drawing_revision_folder_sheets — written while draft,
--      fixed on release by the same draft-only trigger as the sheets, so
--      the record says what site had, whatever later happens in the folder.
--
-- Restated WHOLE (a create-or-replace is a full replacement, never a
-- patch): drawing_revisions_guard (0093's), issue_transmittal (0093's) and
-- delete_draft_revision (0091's — it must clear the new table before the
-- revision; there is no cascade anywhere in this tool).
--
-- Re-runnable throughout.

-- ---------------------------------------------------------------------
-- 1. The link on the revision
-- ---------------------------------------------------------------------
-- Only a WorkDrive share link, rebuilt by the app from its id
-- (lib/design-management/workdrive-link.ts) — so this is a backstop, and
-- the server never fetches anything a person typed.

alter table drawing_revisions add column if not exists drawings_url text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'drawing_revisions_drawings_url_shape'
  ) then
    alter table drawing_revisions
      add constraint drawing_revisions_drawings_url_shape
      check (
        drawings_url is null
        or drawings_url ~ '^https://workdrive\.zohoexternal\.com/external/[0-9A-Za-z]{16,128}$'
      );
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2. The folder's list, kept per revision
-- ---------------------------------------------------------------------
-- Names, sizes and times only — never a file. Replaced whole on each read
-- while the revision is a draft (delete, then insert: no UPDATE policy),
-- and fixed once it is released.

create table if not exists drawing_revision_folder_sheets (
  id uuid primary key default gen_random_uuid(),
  drawing_revision_id uuid not null references drawing_revisions (id),
  workdrive_id text not null check (length(trim(workdrive_id)) > 0),
  name text not null check (length(trim(name)) > 0),
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  modified_at timestamptz,
  sort_order int not null default 0,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  unique (drawing_revision_id, workdrive_id)
);

create index if not exists drawing_revision_folder_sheets_revision_idx
  on drawing_revision_folder_sheets (drawing_revision_id, sort_order);

alter table drawing_revision_folder_sheets enable row level security;

-- The same reach as the uploaded sheets (0091): the design team, or site
-- once the revision is no longer a draft. One SELECT policy only.
drop policy if exists "drawing_revision_folder_sheets readable by design and site"
  on drawing_revision_folder_sheets;
create policy "drawing_revision_folder_sheets readable by design and site"
  on drawing_revision_folder_sheets
  for select to authenticated using (
    exists (
      select 1 from drawing_revisions r
      where r.id = drawing_revision_folder_sheets.drawing_revision_id
        and (
          has_app('/design-management')
          or (has_app('/supervisors') and r.status <> 'draft')
        )
    )
  );

drop policy if exists "drawing_revision_folder_sheets writable by design management app"
  on drawing_revision_folder_sheets;
create policy "drawing_revision_folder_sheets writable by design management app"
  on drawing_revision_folder_sheets
  for insert to authenticated with check (has_app('/design-management'));

drop policy if exists "drawing_revision_folder_sheets deletable by design management app"
  on drawing_revision_folder_sheets;
create policy "drawing_revision_folder_sheets deletable by design management app"
  on drawing_revision_folder_sheets
  for delete to authenticated using (has_app('/design-management'));

-- Fixed once the revision leaves draft — 0091's trigger function, as on
-- the uploaded sheets and the work links.
drop trigger if exists drawing_revision_folder_sheets_draft_only on drawing_revision_folder_sheets;
create trigger drawing_revision_folder_sheets_draft_only
  before insert or update or delete on drawing_revision_folder_sheets
  for each row execute function drawing_revision_child_draft_only();

drop trigger if exists audit_drawing_revision_folder_sheets on drawing_revision_folder_sheets;
create trigger audit_drawing_revision_folder_sheets
  after insert or update or delete on drawing_revision_folder_sheets
  for each row execute function audit_row();

-- ---------------------------------------------------------------------
-- 3. The guard — 0093's, with the number movable while draft, the link
--    frozen with the note, and the release gate taking a link
-- ---------------------------------------------------------------------

create or replace function drawing_revisions_guard()
returns trigger
language plpgsql
as $$
declare
  v_top int;
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'R% has already gone to site — it cannot be deleted. Start the next revision instead.',
        old.revision_no;
    end if;
    return old;
  end if;

  -- Identity is permanent in every status: a revision is a fact about one
  -- villa and one set.
  if (new.unit_id, new.drawing_set_id, new.created_by, new.created_at)
     is distinct from (old.unit_id, old.drawing_set_id, old.created_by, old.created_at) then
    raise exception 'A revision''s villa and drawing set never change.';
  end if;

  -- The number (0122): the designer's while draft, and only above every
  -- other revision of this set on this villa, so none is ever re-used or
  -- undercut. Fixed for good once the revision has gone to site.
  if new.revision_no is distinct from old.revision_no then
    if old.status <> 'draft' or new.status <> 'draft' then
      raise exception 'R% has gone to site — its number never changes.', old.revision_no;
    end if;
    select max(revision_no) into v_top
    from drawing_revisions
    where unit_id = new.unit_id
      and drawing_set_id = new.drawing_set_id
      and id <> new.id;
    if v_top is not null and new.revision_no <= v_top then
      raise exception 'Pick a number above R% — R% has already been used for this set.',
        v_top, v_top;
    end if;
  end if;

  -- Once released, only the status and the supersede pointer may move.
  -- released_at and released_by are the record of WHEN and BY WHOM it went
  -- to site, and the note and the link of WHAT went — rewriting any of
  -- them after the fact is the history-edit this tool exists to refuse.
  -- They are set on draft -> released, where old.status = 'draft' skips
  -- this check. (Fable review, 0091.)
  if old.status <> 'draft'
     and (new.note, new.released_at, new.released_by, new.drawings_url)
         is distinct from (old.note, old.released_at, old.released_by, old.drawings_url) then
    raise exception 'R% is % — a drawing that has gone to site never changes. Start the next revision instead.',
      old.revision_no, old.status;
  end if;

  if new.status = old.status then
    return new;
  end if;
  if old.status = 'draft' and new.status = 'released' then
    -- The release gate (0093, widened by 0122): the drawings are a
    -- WorkDrive link or an uploaded sheet; a change needs its reason.
    if new.drawings_url is null
       and not exists (
         select 1 from drawing_revision_files f where f.drawing_revision_id = new.id
       ) then
      raise exception 'R% has no drawings — paste the WorkDrive link before it can go to site.',
        new.revision_no;
    end if;
    if new.revision_no >= 1 and (new.note is null or length(trim(new.note)) = 0) then
      raise exception 'R% needs a note saying what changed before it can go to site.',
        new.revision_no;
    end if;
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

-- ---------------------------------------------------------------------
-- 4. issue_transmittal() — 0093's, with the link gate and the TB mint
-- ---------------------------------------------------------------------

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
  v_offender record;
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

  -- The pre-checks, named after the set so the fix is obvious. EVERY line
  -- needs its drawings — a WorkDrive link or an uploaded sheet; a draft
  -- revision past R0 also needs its reason typed.
  select s.name, r.revision_no
  into v_offender
  from transmittal_lines l
  join drawing_revisions r on r.id = l.drawing_revision_id
  join drawing_sets s on s.id = r.drawing_set_id
  where l.transmittal_id = p_transmittal_id
    and r.drawings_url is null
    and not exists (
      select 1 from drawing_revision_files f where f.drawing_revision_id = r.id
    )
  order by l.sort_order limit 1;
  if found then
    raise exception '"%" R% has no drawings — paste its WorkDrive link before issuing.',
      v_offender.name, v_offender.revision_no;
  end if;

  select s.name, r.revision_no
  into v_offender
  from transmittal_lines l
  join drawing_revisions r on r.id = l.drawing_revision_id
  join drawing_sets s on s.id = r.drawing_set_id
  where l.transmittal_id = p_transmittal_id
    and r.status = 'draft'
    and r.revision_no >= 1
    and (r.note is null or length(trim(r.note)) = 0)
  order by l.sort_order limit 1;
  if found then
    raise exception '"%" R% needs a note saying what changed before it can go to site.',
      v_offender.name, v_offender.revision_no;
  end if;

  for v_rev in
    select r.id, r.unit_id, r.drawing_set_id, r.status
    from transmittal_lines l
    join drawing_revisions r on r.id = l.drawing_revision_id
    where l.transmittal_id = p_transmittal_id
    order by l.sort_order, l.created_at
    for update of r
  loop
    -- A line may carry an ALREADY-RELEASED revision (from before 0099,
    -- which allows one line per transmittal). Nothing to do for those.
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

  -- Minted here and nowhere else — per villa (0092), as the toolbox's
  -- own series (0122: TB, so it is never mistaken for the Excel one).
  -- greatest() because lpad TRUNCATES a string longer than its target —
  -- lpad('12345', 4) is '1234' (0019).
  insert into transmittal_counters (scope, last_no)
  values (v_unit_id::text, 1)
  on conflict (scope) do update set last_no = transmittal_counters.last_no + 1
  returning last_no into v_no;

  v_number := 'TB-' || lpad(v_no::text, greatest(4, length(v_no::text)), '0');

  update transmittals
  set status = 'issued',
      number = v_number,
      issued_at = now(),
      issued_by = auth.uid(),
      updated_at = now()
  where id = p_transmittal_id;

  return v_number;
end $$;

-- `revoke ... from public` does NOT remove anon — Supabase grants EXECUTE
-- to anon and authenticated by name, so both are named (0071 / SEC-03).
revoke execute on function issue_transmittal(uuid) from public, anon;
grant execute on function issue_transmittal(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 5. delete_draft_revision() — 0091's, clearing the kept list too
-- ---------------------------------------------------------------------

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

  delete from drawing_revision_folder_sheets where drawing_revision_id = p_revision_id;
  delete from drawing_revision_files where drawing_revision_id = p_revision_id;
  delete from drawing_revision_works where drawing_revision_id = p_revision_id;
  delete from drawing_revisions where id = p_revision_id;
end $$;

revoke execute on function delete_draft_revision(uuid) from public, anon;
grant execute on function delete_draft_revision(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 6. Prove it landed
-- ---------------------------------------------------------------------

do $$
declare
  v int;
  t text;
  v_guard text := pg_get_functiondef('drawing_revisions_guard()'::regprocedure);
  v_issue text := pg_get_functiondef('issue_transmittal(uuid)'::regprocedure);
begin
  if not exists (
    select 1 from pg_constraint where conname = 'drawing_revisions_drawings_url_shape'
  ) then
    raise exception '0122: the drawings_url shape check is missing';
  end if;

  -- The new table: RLS on, three policies, exactly one SELECT, site kept
  -- off drafts, and fixed once released.
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'drawing_revision_folder_sheets'
      and c.relrowsecurity
  ) then
    raise exception '0122: drawing_revision_folder_sheets is missing or has RLS off';
  end if;
  select count(*) into v from pg_policies
    where schemaname = 'public' and tablename = 'drawing_revision_folder_sheets';
  if v <> 3 then
    raise exception '0122: drawing_revision_folder_sheets has % policies, expected 3', v;
  end if;
  select count(*) into v from pg_policies
    where schemaname = 'public' and tablename = 'drawing_revision_folder_sheets'
      and cmd = 'SELECT' and qual like '%/supervisors%' and qual like '%draft%';
  if v <> 1 then
    raise exception '0122: drawing_revision_folder_sheets needs exactly one SELECT policy that keeps site off drafts';
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'drawing_revision_folder_sheets'
      and cmd in ('UPDATE', 'ALL')
  ) then
    raise exception '0122: drawing_revision_folder_sheets must have no UPDATE policy';
  end if;
  foreach t in array array[
    'drawing_revision_folder_sheets_draft_only', 'audit_drawing_revision_folder_sheets'
  ]
  loop
    if not exists (
      select 1 from pg_trigger
      where tgname = t and tgrelid = 'drawing_revision_folder_sheets'::regclass
        and not tgisinternal and tgenabled <> 'D'
    ) then
      raise exception '0122: the % trigger is missing or disabled', t;
    end if;
  end loop;

  if position('new.drawings_url is null' in v_guard) = 0
     or position('old.drawings_url' in v_guard) = 0 then
    raise exception '0122: the guard is missing the link gate or the link freeze';
  end if;
  if position('v_top' in v_guard) = 0 then
    raise exception '0122: the guard is missing the movable-number rule';
  end if;
  if position('new.released_at' in v_guard) = 0 then
    raise exception '0122: the guard lost the released_at freeze (0091 Fable review)';
  end if;
  if not exists (
    select 1 from pg_trigger
    where tgname = 'drawing_revisions_guard' and not tgisinternal and tgenabled <> 'D'
  ) then
    raise exception '0122: the drawing_revisions_guard trigger is missing or disabled';
  end if;

  if position('''TB-''' in v_issue) = 0 or position('''TR-''' in v_issue) > 0 then
    raise exception '0122: issue_transmittal does not mint TB';
  end if;
  if position('r.drawings_url is null' in v_issue) = 0 then
    raise exception '0122: issue_transmittal is missing the link gate';
  end if;
  if position('v_unit_id::text' in v_issue) = 0 then
    raise exception '0122: issue_transmittal lost the per-villa mint (0092)';
  end if;
  if position('drawing_revision_folder_sheets'
       in pg_get_functiondef('delete_draft_revision(uuid)'::regprocedure)) = 0 then
    raise exception '0122: delete_draft_revision does not clear the kept list';
  end if;

  if has_function_privilege('anon', 'public.issue_transmittal(uuid)', 'execute')
     or has_function_privilege('anon', 'public.delete_draft_revision(uuid)', 'execute') then
    raise exception '0122: anon can execute a Design Management function';
  end if;
end $$;
