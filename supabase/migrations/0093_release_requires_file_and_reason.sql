-- 0093 — A release needs a file, and a revision needs its reason
--
-- FOUNDER, 2026-08-22, vetting on staging: "drawing revision cannot
-- happen without typing the reasons and uploading a file thats
-- mandatory no transmittal can be released without a file."
--
-- Two rules, enforced where rules live — the database, not the button:
--
--   1. NO revision goes to site without at least one sheet file.
--   2. A revision AFTER the first (R1, R2, …) cannot go to site without
--      a note saying what changed. R0 is the first issue — there is no
--      change to explain yet, so its note stays optional.
--
-- Both land twice, deliberately:
--   - issue_transmittal() pre-checks every line and refuses with the
--     SET'S NAME in the message — the sentence a person acts on.
--   - drawing_revisions_guard() refuses the draft -> released
--     transition itself — the boundary that holds even for a write that
--     never came through the function.
--
-- Both functions are restated WHOLE (the pusher_chain_state lesson: a
-- create-or-replace is a full replacement, never a patch). The guard is
-- 0091's plus the Fable-review freeze of released_at/released_by plus
-- the new release gate; the function is 0092's per-villa version plus
-- the pre-checks.
--
-- Re-runnable throughout.

-- ---------------------------------------------------------------------
-- 1. The guard — the boundary
-- ---------------------------------------------------------------------

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
  -- released_at and released_by are the record of WHEN and BY WHOM it went
  -- to site — rewriting them after the fact is the history-edit this tool
  -- exists to refuse. They are set exactly once, on draft -> released,
  -- where old.status = 'draft' skips this check. (Fable review.)
  if old.status <> 'draft'
     and (new.note, new.released_at, new.released_by)
         is distinct from (old.note, old.released_at, old.released_by) then
    raise exception 'R% is % — a drawing that has gone to site never changes. Start the next revision instead.',
      old.revision_no, old.status;
  end if;

  if new.status = old.status then
    return new;
  end if;
  if old.status = 'draft' and new.status = 'released' then
    -- The release gate (0093). A drawing with no sheet is not a
    -- drawing; a change with no reason is not a record.
    if not exists (
      select 1 from drawing_revision_files f where f.drawing_revision_id = new.id
    ) then
      raise exception 'R% has no drawing file — upload the sheet before it can go to site.',
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
-- 2. issue_transmittal() — the sentence a person acts on
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

  -- The 0093 pre-checks, named after the set so the fix is obvious.
  -- EVERY line needs a file — a re-sent released revision included; a
  -- draft revision past R0 also needs its reason typed.
  select s.name, r.revision_no
  into v_offender
  from transmittal_lines l
  join drawing_revisions r on r.id = l.drawing_revision_id
  join drawing_sets s on s.id = r.drawing_set_id
  where l.transmittal_id = p_transmittal_id
    and not exists (
      select 1 from drawing_revision_files f where f.drawing_revision_id = r.id
    )
  order by l.sort_order limit 1;
  if found then
    raise exception '"%" R% has no drawing file — upload the sheet or take it off before issuing.',
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

  -- Minted here and nowhere else — PER VILLA since 0092 (founder:
  -- "each house should have transmittals starting from 1"). greatest()
  -- because lpad TRUNCATES a string longer than its target —
  -- lpad('12345', 4) is '1234' (0019).
  insert into transmittal_counters (scope, last_no)
  values (v_unit_id::text, 1)
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

revoke execute on function issue_transmittal(uuid) from public, anon;
grant execute on function issue_transmittal(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 3. Prove it landed
-- ---------------------------------------------------------------------

do $$
begin
  if position('has no drawing file' in pg_get_functiondef('issue_transmittal(uuid)'::regprocedure)) = 0 then
    raise exception '0093: issue_transmittal is missing the file gate';
  end if;
  if position('has no drawing file' in pg_get_functiondef('drawing_revisions_guard()'::regprocedure)) = 0 then
    raise exception '0093: drawing_revisions_guard is missing the file gate';
  end if;
  if position('v_unit_id::text' in pg_get_functiondef('issue_transmittal(uuid)'::regprocedure)) = 0 then
    raise exception '0093: issue_transmittal lost the per-villa mint (0092)';
  end if;
  if position('new.released_at' in pg_get_functiondef('drawing_revisions_guard()'::regprocedure)) = 0 then
    raise exception '0093: the guard lost the released_at freeze (0091 Fable review)';
  end if;
  if not exists (
    select 1 from pg_trigger where tgname = 'drawing_revisions_guard' and not tgisinternal
  ) then
    raise exception '0093: the drawing_revisions_guard trigger is missing';
  end if;
  if has_function_privilege('anon', 'public.issue_transmittal(uuid)', 'execute') then
    raise exception '0093: anon can execute issue_transmittal';
  end if;
end $$;
