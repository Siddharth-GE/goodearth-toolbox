-- 0113 — A purchase order line always comes from an indent, and an
--        indent line outside the estimate waits for the estimator
--
-- FOUNDER, 2026-10-11: "a po can only be made from an indent … indents
-- can be made direct but has to be first thing that is reconciled in the
-- estimate". Asked whether the indent waits: "indent should wait for
-- estimator approval for sure" — and a bulk buy is one PO gathering
-- several villas' indents, never a purchase made directly.
--
-- 1. purchase_order_lines_from_an_indent ends 0079's direct lines. NOT
--    VALID: the direct lines already made stay as history (an issued
--    PO's lines are frozen by po_lines_draft_only anyway). A draft still
--    holding one cannot save it again — the line is removed and the item
--    ordered from an indent. po_lines_qty_guard's early return for a null
--    indent line stays: unreachable for new rows, and additive-only
--    leaves the function as it is.
--
-- 2. Indent lines carry why they are needed and the estimator's answer.
--    A DIRECT line (no budget, construction or estimate anchor) is by
--    definition outside every estimate: a catalogue pick that the villa's
--    official estimate lists is filed as an estimate line by the app, and
--    §4 keeps that honest. So the rule is structural, never a read of the
--    estimate at approval time:
--      - submitting needs off_estimate_reason on every direct line;
--      - approving needs estimator_decision = 'approved' on every one.
--    An indent for no villa has no estimate behind it, so every line it
--    asks for directly waits too — "no villa" is not a way around the
--    estimator. Interiors lines answer to their approved budget and
--    estimate lines to the estimate; neither waits.
--
-- 3. decide_indent_line() — the Estimator writing Indents' table, the
--    cross-tool write SECURITY.md lists. Definer, because the estimator
--    holds /estimator, not /indents, and the line is locked (its indent
--    is submitted). Its has_app('/estimator') check is its whole
--    boundary; no trigger reaches it, so auth.uid() is the estimator
--    (BUGCATCHER #11). It raises a transaction-local flag only it sets
--    (0106's labour_billing pattern), and indent_lines_draft_only lets
--    exactly the four answer columns move under it, on a submitted
--    indent. In a draft those columns can only be emptied — and a change
--    to what a line asks for (item, quantity, unit, reason) empties them,
--    so an answer never outlives its question.
--
-- 4. indent_lines_estimate_anchor — an estimate anchor must be true: the
--    estimate is the CURRENT official one for the indent's villa, and its
--    takeoff lists the item. Read through estimate_takeoff_facts, which
--    every /indents writer can read (invoker, BUGCATCHER #19). Checked
--    when the anchor is written or moved, never when an old line's
--    quantity is edited — a line pulled from a since-superseded official
--    stays valid.
--
-- Re-runnable throughout; asserts at the end.

-- ---------------------------------------------------------------------
-- 1. A PO line comes from an indent
-- ---------------------------------------------------------------------

alter table purchase_order_lines
  drop constraint if exists purchase_order_lines_from_an_indent;
alter table purchase_order_lines
  add constraint purchase_order_lines_from_an_indent
  check (indent_line_id is not null) not valid;

-- ---------------------------------------------------------------------
-- 2. Why a line is needed, and the estimator's answer
-- ---------------------------------------------------------------------

alter table indent_lines add column if not exists off_estimate_reason text;
alter table indent_lines add column if not exists estimator_decision text;
alter table indent_lines
  add column if not exists estimator_decided_by uuid references profiles (id);
alter table indent_lines add column if not exists estimator_decided_at timestamptz;
alter table indent_lines add column if not exists estimator_note text;

alter table indent_lines drop constraint if exists indent_lines_estimator_answer;
alter table indent_lines
  add constraint indent_lines_estimator_answer
  check (
    (estimator_decision is null
      and estimator_decided_by is null
      and estimator_decided_at is null
      and estimator_note is null)
    or (estimator_decision in ('approved', 'refused')
      and estimator_decided_at is not null
      and (estimator_decision = 'approved' or length(trim(coalesce(estimator_note, ''))) > 0))
  );

-- ---------------------------------------------------------------------
-- 3. The estimator answers, and the line lock lets exactly that through
-- ---------------------------------------------------------------------

create or replace function decide_indent_line(p_line_id uuid, p_decision text, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_indent uuid;
  v_direct boolean;
  v_status text;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  if not has_app('/estimator') then
    raise exception 'Only someone with the Estimator can answer for an indent line';
  end if;
  if p_decision is null or p_decision not in ('approved', 'refused') then
    raise exception 'The estimator either approves a line or refuses it';
  end if;
  if p_decision = 'refused' and v_note is null then
    raise exception 'Say why it is refused — the indent''s approver reads this';
  end if;

  select il.indent_id,
         il.budget_id is null and il.construction_line_id is null and il.estimate_id is null
    into v_indent, v_direct
    from indent_lines il
   where il.id = p_line_id;
  if v_indent is null then
    raise exception 'That indent line no longer exists';
  end if;

  -- FOR SHARE, like every line write (0019): serialises this answer
  -- against the approval, which takes the indent's row lock.
  select status into v_status from indents where id = v_indent for share;
  if v_status is distinct from 'submitted' then
    raise exception 'The estimator answers while the indent waits for approval — this one is %',
      coalesce(v_status, 'missing');
  end if;
  if not v_direct then
    raise exception 'This line comes from an estimate or a budget — it does not wait for the estimator';
  end if;

  perform set_config('toolbox.estimator_deciding', 'on', true);
  update indent_lines
     set estimator_decision = p_decision,
         estimator_decided_by = auth.uid(),
         estimator_decided_at = now(),
         estimator_note = v_note
   where id = p_line_id;
  perform set_config('toolbox.estimator_deciding', '', true);
end $$;

revoke execute on function decide_indent_line(uuid, text, text) from public, anon;
grant execute on function decide_indent_line(uuid, text, text) to authenticated;

-- 0019's line lock, plus the estimator's answer. Everything 0019 refused
-- it still refuses.
create or replace function indent_lines_draft_only()
returns trigger
language plpgsql
as $$
declare
  target_indent uuid;
  parent_status text;
  answer_columns constant text[] := array[
    'estimator_decision', 'estimator_decided_by', 'estimator_decided_at', 'estimator_note',
    'updated_at'
  ];
begin
  if tg_op = 'DELETE' then
    target_indent := old.indent_id;
  else
    target_indent := new.indent_id;
  end if;

  select status into parent_status
  from indents where id = target_indent
  for share;

  -- 0113: the estimator's answer, raised only inside decide_indent_line()
  -- — on a submitted indent, those columns and nothing else.
  if tg_op = 'UPDATE' and current_setting('toolbox.estimator_deciding', true) = 'on' then
    if parent_status is distinct from 'submitted' then
      raise exception 'The estimator answers while the indent waits for approval';
    end if;
    if (to_jsonb(new) - answer_columns) is distinct from (to_jsonb(old) - answer_columns) then
      raise exception 'The estimator''s answer changes nothing else on the line';
    end if;
    return new;
  end if;

  if parent_status is distinct from 'draft' then
    raise exception 'Indent % is % — lines can only be changed while it is a draft',
      target_indent, coalesce(parent_status, 'missing');
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  -- 0113: in a draft the answer can only be emptied, never written…
  if tg_op = 'INSERT' then
    if new.estimator_decision is not null or new.estimator_decided_by is not null
       or new.estimator_decided_at is not null or new.estimator_note is not null then
      raise exception 'Only the estimator answers for an indent line';
    end if;
    return new;
  end if;

  if (new.estimator_decision, new.estimator_decided_by, new.estimator_decided_at, new.estimator_note)
       is distinct from
     (old.estimator_decision, old.estimator_decided_by, old.estimator_decided_at, old.estimator_note)
     and (new.estimator_decision is not null or new.estimator_decided_by is not null
          or new.estimator_decided_at is not null or new.estimator_note is not null) then
    raise exception 'Only the estimator answers for an indent line';
  end if;

  -- …and a change to what the line asks for empties it.
  if (new.item_id, new.quantity, new.uom, new.off_estimate_reason)
       is distinct from (old.item_id, old.quantity, old.uom, old.off_estimate_reason) then
    new.estimator_decision := null;
    new.estimator_decided_by := null;
    new.estimator_decided_at := null;
    new.estimator_note := null;
  end if;

  return new;
end $$;

-- 0034's indents_guard verbatim, plus the two 0113 checks: a reason on
-- every direct line to submit, the estimator's yes on every one to
-- approve.
create or replace function indents_guard()
returns trigger
language plpgsql
as $$
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

  raise exception 'Invalid indent status change: % -> %', old.status, new.status;
end $$;

-- ---------------------------------------------------------------------
-- 4. An estimate anchor must be true
-- ---------------------------------------------------------------------

create or replace function indent_lines_estimate_anchor()
returns trigger
language plpgsql
as $$
declare
  v_unit uuid;
begin
  if new.estimate_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and (new.estimate_id, new.item_id) is not distinct from (old.estimate_id, old.item_id) then
    return new;
  end if;

  -- The indent's villa: its unit, or the plot's unit (1:1 since 0029).
  select coalesce(i.unit_id, u.id) into v_unit
    from indents i
    left join units u on u.plot_id = i.plot_id
   where i.id = new.indent_id;

  if v_unit is null or not exists (
    select 1 from estimate_takeoff_facts f
     where f.estimate_id = new.estimate_id
       and f.unit_id = v_unit
       and f.item_id = new.item_id
  ) then
    raise exception 'That material is not on this villa''s official estimate — reload and look again';
  end if;
  return new;
end $$;

revoke execute on function indent_lines_estimate_anchor() from public, anon;

drop trigger if exists indent_lines_estimate_anchor on indent_lines;
create trigger indent_lines_estimate_anchor
  before insert or update on indent_lines
  for each row execute function indent_lines_estimate_anchor();

-- ---------------------------------------------------------------------
-- 5. Prove it all landed
-- ---------------------------------------------------------------------

do $$
declare
  c text;
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'purchase_order_lines_from_an_indent'
       and conrelid = 'public.purchase_order_lines'::regclass
  ) then
    raise exception '0113: purchase_order_lines_from_an_indent is missing';
  end if;

  foreach c in array array[
    'off_estimate_reason', 'estimator_decision', 'estimator_decided_by',
    'estimator_decided_at', 'estimator_note'
  ]
  loop
    if not exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'indent_lines' and column_name = c
    ) then
      raise exception '0113: indent_lines.% is missing', c;
    end if;
  end loop;

  if not exists (
    select 1 from pg_constraint
     where conname = 'indent_lines_estimator_answer'
       and conrelid = 'public.indent_lines'::regclass
  ) then
    raise exception '0113: indent_lines_estimator_answer is missing';
  end if;

  if not exists (
    select 1 from pg_proc
     where proname = 'decide_indent_line' and prosecdef
  ) then
    raise exception '0113: decide_indent_line is missing or not security definer';
  end if;
  if has_function_privilege('anon', 'decide_indent_line(uuid, text, text)', 'execute') then
    raise exception '0113: anon can execute decide_indent_line';
  end if;
  if has_function_privilege('anon', 'indent_lines_estimate_anchor()', 'execute') then
    raise exception '0113: anon can execute indent_lines_estimate_anchor';
  end if;

  if not exists (
    select 1 from pg_proc
     where proname = 'indent_lines_draft_only'
       and prosrc like '%toolbox.estimator_deciding%'
  ) then
    raise exception '0113: indent_lines_draft_only does not carry the estimator''s answer';
  end if;
  if not exists (
    select 1 from pg_proc
     where proname = 'indents_guard'
       and prosrc like '%estimator_decision%'
       and prosrc like '%can_approve_indents%'
  ) then
    raise exception '0113: indents_guard does not wait for the estimator';
  end if;

  if not exists (
    select 1 from pg_trigger
     where tgname = 'indent_lines_estimate_anchor'
       and tgrelid = 'public.indent_lines'::regclass
  ) then
    raise exception '0113: the indent_lines_estimate_anchor trigger is missing';
  end if;
end $$;
