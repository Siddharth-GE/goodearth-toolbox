-- Phase 2 (M2) — issuing a revision, and branching the next one.
--
-- Both operations are multi-statement and must not half-happen, so they
-- live in the database rather than in the client. Issuing writes to two
-- rows (this revision becomes issued, the previous one becomes
-- superseded); branching writes a header and then copies every line. A
-- PostgREST client cannot wrap those in a transaction, and a failure
-- halfway through either would leave a unit with two issued revisions or
-- a revision with half its lines.
--
-- security invoker on purpose: RLS still applies, so these are not a way
-- to bypass the /selections grant. They only make the steps atomic.

-- ---------------------------------------------------------------------
-- Issue
-- ---------------------------------------------------------------------
create function issue_selection(p_selection_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_unit_id uuid;
  v_line_count int;
begin
  -- Lock the row so two people pressing Issue at once can't both proceed.
  select unit_id into v_unit_id
  from selections
  where id = p_selection_id and status = 'draft'
  for update;

  if not found then
    raise exception 'Only a draft revision can be issued';
  end if;

  select count(*) into v_line_count from selection_lines where selection_id = p_selection_id;
  if v_line_count = 0 then
    -- An empty revision would hand the budget team nothing to price.
    raise exception 'Add at least one item before issuing';
  end if;

  update selections
  set status = 'issued', issued_at = now(), issued_by = auth.uid(), updated_at = now()
  where id = p_selection_id;

  -- Whatever was issued before is now history. Ordering matters: this runs
  -- after the line above, so the unit is never left with zero issued
  -- revisions, and `superseded_by` points at what replaced it.
  update selections
  set status = 'superseded', superseded_by = p_selection_id, updated_at = now()
  where unit_id = v_unit_id and status = 'issued' and id <> p_selection_id;
end $$;

-- ---------------------------------------------------------------------
-- Branch the next revision
-- ---------------------------------------------------------------------
-- Copies every line forward CARRYING ITS line_key. That is the entire
-- point: Budgets keys its pricing to line_key, so a line that didn't
-- change keeps the price it was already given, and only genuinely new or
-- changed lines land in the budget team's queue. Copy with fresh keys and
-- issuing R1 would silently ask them to re-price all 200 lines.
create function create_next_revision(p_from_selection_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_unit_id uuid;
  v_revision_no int;
  v_new_id uuid;
begin
  select unit_id, revision_no into v_unit_id, v_revision_no
  from selections
  where id = p_from_selection_id and status in ('issued', 'superseded');

  if not found then
    raise exception 'A new revision can only be based on one that has been issued';
  end if;

  if exists (select 1 from selections where unit_id = v_unit_id and status = 'draft') then
    raise exception 'This unit already has an open draft revision';
  end if;

  -- Numbered from the unit's highest revision, not from the source, so
  -- branching an older revision can't collide with an existing number.
  select coalesce(max(revision_no), -1) + 1 into v_revision_no
  from selections where unit_id = v_unit_id;

  insert into selections (unit_id, revision_no, status, created_by)
  values (v_unit_id, v_revision_no, 'draft', auth.uid())
  returning id into v_new_id;

  insert into selection_lines (
    selection_id, unit_id, line_key, unit_space_id, item_id,
    quantity, uom, indicative_rate_snapshot, designer_note, sort_order, created_by
  )
  select
    v_new_id, unit_id, line_key, unit_space_id, item_id,
    quantity, uom, indicative_rate_snapshot, designer_note, sort_order, auth.uid()
  from selection_lines
  where selection_id = p_from_selection_id;

  return v_new_id;
end $$;

revoke execute on function issue_selection(uuid) from public;
revoke execute on function create_next_revision(uuid) from public;
grant execute on function issue_selection(uuid) to authenticated;
grant execute on function create_next_revision(uuid) to authenticated;
