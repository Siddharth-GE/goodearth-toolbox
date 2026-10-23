-- 0143 — Delete or Cancel, step B1 (plan.md, Piece 4; the founder waived Fable's review, 2026-10-23).
--
-- A record nothing uses yet really deletes; a record something depends on is cancelled instead, with a reason, and
-- leaves every list, count and total. Three documents here:
--
-- 1. Indents: a submitted or approved indent is cancelled while no live PO orders from it. Cancelled is final and
--    frees what it asked for, so the budget and estimate pulls can ask again. POs already refuse a line from an
--    indent that is not approved (po_lines_qty_guard).
-- 2. A budget still in its first pricing is deleted whole (lines first). Once approved, indents may hang off it, so a
--    re-opened budget is approved again, never deleted.
-- 3. A draft selection revision is deleted whole. Nothing points at a draft: the revision before it is superseded only
--    when this one is issued.
--
-- No policy, view or definer changes: the cancel is an update the /indents grant already has, and both deletes are
-- invoker functions inside the /budgets and /selections delete policies that already exist.

-- ---------------------------------------------------------------------
-- 1. Indents can be cancelled
-- ---------------------------------------------------------------------

alter table indents add column if not exists cancelled_at timestamptz;
alter table indents add column if not exists cancelled_by uuid references profiles (id);
alter table indents add column if not exists cancel_reason text;

alter table indents drop constraint if exists indents_status_check;
alter table indents
  add constraint indents_status_check
  check (status = any (array['draft', 'submitted', 'approved', 'cancelled']));

alter table indents drop constraint if exists indents_cancel_shape;
alter table indents
  add constraint indents_cancel_shape
  check (
    (status = 'cancelled' and cancelled_at is not null and length(trim(coalesce(cancel_reason, ''))) > 0)
    or (status <> 'cancelled' and cancelled_at is null and cancelled_by is null and cancel_reason is null)
  );

create or replace function indents_guard()
returns trigger
language plpgsql
as $$
declare
  v_orders int;
begin
  -- The number on the paper is permanent.
  if (new.project_id, new.indent_no, new.reference)
     is distinct from (old.project_id, old.indent_no, old.reference) then
    raise exception 'An indent''s project, number and reference are permanent';
  end if;

  if new.status = old.status then
    -- Header edits (plot, unit, stage, required_by, note) only while
    -- it's a draft.
    if old.status <> 'draft' then
      raise exception 'A % indent can no longer be edited', old.status;
    end if;
    return new;
  end if;

  if old.status = 'draft' and new.status = 'submitted' then
    -- The UPDATE's row lock serialises this count against concurrent
    -- line writes, which take FOR SHARE on this row (0019).
    if not exists (select 1 from indent_lines where indent_id = new.id) then
      raise exception 'Add at least one line before submitting this indent';
    end if;
    if new.submitted_by is null or new.submitted_at is null then
      raise exception 'Submitting must record who submitted and when';
    end if;
    if new.rejection_note is not null then
      raise exception 'Resubmitting must clear the rejection note';
    end if;
    -- 0113: a line outside the estimate says why it is needed.
    if exists (
      select 1 from indent_lines
       where indent_id = new.id
         and budget_id is null and construction_line_id is null and estimate_id is null
         and length(trim(coalesce(off_estimate_reason, ''))) = 0
    ) then
      raise exception 'Say why each line outside the estimate is needed before submitting';
    end if;
    return new;
  end if;

  if old.status = 'submitted' and new.status = 'approved' then
    if not (is_admin() or can_approve_indents(auth.uid())) then
      raise exception 'Only a named indent approver or an admin can approve an indent';
    end if;
    if new.approved_by is null or new.approved_at is null then
      raise exception 'Approving must record who approved and when';
    end if;
    -- 0113: a line outside the estimate waits for the estimator's yes.
    if exists (
      select 1 from indent_lines
       where indent_id = new.id
         and budget_id is null and construction_line_id is null and estimate_id is null
         and estimator_decision is distinct from 'approved'
    ) then
      raise exception 'The estimator has not approved every line outside the estimate yet';
    end if;
    return new;
  end if;

  if old.status = 'submitted' and new.status = 'draft' then
    -- A rejection: the reason is mandatory, and the submission record is
    -- cleared so a resubmit stamps fresh.
    if new.rejection_note is null or length(trim(new.rejection_note)) = 0 then
      raise exception 'Say what needs changing — a rejection needs a note';
    end if;
    if new.submitted_by is not null or new.submitted_at is not null
       or new.approved_by is not null or new.approved_at is not null then
      raise exception 'Rejecting must clear the submission and approval fields';
    end if;
    return new;
  end if;

  if old.status in ('submitted', 'approved') and new.status = 'cancelled' then
    if length(trim(coalesce(new.cancel_reason, ''))) = 0 then
      raise exception 'Say why this indent is cancelled';
    end if;
    if (new.plot_id, new.unit_id, new.stage, new.required_by, new.note, new.rejection_note, new.work_item_id,
        new.is_urgent, new.created_by, new.submitted_by, new.submitted_at, new.approved_by, new.approved_at)
       is distinct from
       (old.plot_id, old.unit_id, old.stage, old.required_by, old.note, old.rejection_note, old.work_item_id,
        old.is_urgent, old.created_by, old.submitted_by, old.submitted_at, old.approved_by, old.approved_at) then
      raise exception 'Cancelling an indent changes nothing else on it';
    end if;
    -- po_lines_qty_guard takes this lock per indent line before it reads the indent's status, so a PO line written
    -- at the same moment either lands first and is counted below, or waits and then finds the indent cancelled.
    perform pg_advisory_xact_lock(hashtextextended(il.id::text, 0))
       from indent_lines il
      where il.indent_id = new.id
      order by il.id;
    -- po_line_facts, not the PO tables: an /indents holder without /purchase-orders reads no PO table (BUGCATCHER #19).
    select count(distinct f.po_id) into v_orders
      from po_line_facts f
      join indent_lines il on il.id = f.indent_line_id
     where il.indent_id = new.id
       and f.po_status <> 'cancelled';
    if v_orders > 0 then
      raise exception '% from this indent — cancel % first',
        case when v_orders = 1 then 'A purchase order orders' else v_orders || ' purchase orders order' end,
        case when v_orders = 1 then 'it' else 'them' end;
    end if;
    new.cancelled_at := now();
    new.cancelled_by := auth.uid();
    new.cancel_reason := trim(new.cancel_reason);
    return new;
  end if;

  raise exception 'Invalid indent status change: % -> %', old.status, new.status;
end $$;

-- ---------------------------------------------------------------------
-- 2. A budget in its first pricing is deleted whole
-- ---------------------------------------------------------------------

create or replace function delete_pricing_budget(p_budget_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_version int;
begin
  select version into v_version
    from budgets
   where id = p_budget_id and status = 'pricing'
     for update;
  if not found then
    raise exception 'Only a budget still being priced can be deleted';
  end if;
  if v_version > 1 then
    raise exception 'This budget was approved before, so indents may rest on it — approve it again instead';
  end if;
  if exists (select 1 from indent_lines where budget_id = p_budget_id) then
    raise exception 'An indent asks for lines from this budget, so it cannot be deleted';
  end if;

  delete from budget_lines where budget_id = p_budget_id;
  delete from budgets where id = p_budget_id;
end $$;

revoke execute on function delete_pricing_budget(uuid) from public, anon;
grant execute on function delete_pricing_budget(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 3. A draft selection revision is deleted whole
-- ---------------------------------------------------------------------

create or replace function delete_draft_selection(p_selection_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  perform 1 from selections
   where id = p_selection_id and status = 'draft'
     for update;
  if not found then
    raise exception 'Only a draft revision can be deleted — an issued one is replaced by the next revision';
  end if;
  -- A /selections holder cannot read budgets, so a budget hung on a draft is found by its foreign key, not a read.
  begin
    delete from selection_lines where selection_id = p_selection_id;
    delete from selections where id = p_selection_id;
  exception when foreign_key_violation then
    raise exception 'A budget prices this revision, so it cannot be deleted';
  end;
end $$;

revoke execute on function delete_draft_selection(uuid) from public, anon;
grant execute on function delete_draft_selection(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Prove it landed
-- ---------------------------------------------------------------------

do $$
declare
  c text;
begin
  foreach c in array array['cancelled_at', 'cancelled_by', 'cancel_reason']
  loop
    if not exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'indents' and column_name = c
    ) then
      raise exception '0143: indents.% is missing', c;
    end if;
  end loop;

  if not exists (
    select 1 from pg_constraint
     where conname = 'indents_cancel_shape' and conrelid = 'public.indents'::regclass
  ) then
    raise exception '0143: indents_cancel_shape is missing';
  end if;
  if position('cancelled' in (
    select pg_get_constraintdef(oid) from pg_constraint
     where conname = 'indents_status_check' and conrelid = 'public.indents'::regclass
  )) = 0 then
    raise exception '0143: indents_status_check does not admit cancelled';
  end if;

  foreach c in array array['po_line_facts', 'can_approve_indents', 'estimator_decision', 'off_estimate_reason',
                           'rejection_note', 'old.created_by']
  loop
    if position(c in pg_get_functiondef('indents_guard()'::regprocedure)) = 0 then
      raise exception '0143: indents_guard lost its % check', c;
    end if;
  end loop;
  if not exists (
    select 1 from pg_trigger
     where tgname = 'indents_guard' and tgrelid = 'public.indents'::regclass and tgenabled <> 'D'
  ) then
    raise exception '0143: the indents_guard trigger is missing or off';
  end if;
  if (select prosecdef from pg_proc where oid = 'indents_guard()'::regprocedure) then
    raise exception '0143: indents_guard must run as the caller';
  end if;

  foreach c in array array['delete_pricing_budget(uuid)', 'delete_draft_selection(uuid)']
  loop
    if (select prosecdef from pg_proc where oid = c::regprocedure) then
      raise exception '0143: % must run as the caller', c;
    end if;
    if has_function_privilege('anon', c, 'execute') then
      raise exception '0143: anon can execute %', c;
    end if;
    if not has_function_privilege('authenticated', c, 'execute') then
      raise exception '0143: signed-in people cannot execute %', c;
    end if;
  end loop;
end $$;
