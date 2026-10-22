-- 0132 — Four small columns from the operations team's requests (plan.md, OS process updates, Wave 2).
--
-- 1. indents.is_urgent: an emergency request, sorted first for the approver. indents_guard already
--    freezes every header column once an indent leaves draft, so the mark is a draft's to set.
-- 2. estimator_estimate_line_measurements.is_deduction: a door or window measured as a positive row
--    and taken off the sheet's total (calc.ts sums; SQL never does). Every box stays above zero, so a
--    deduction reads "1 × 1.2 × 2.1, deduct" and a typed minus is still refused. The copy function
--    carries it, or an official would count every opening as wall.
-- 3. work_class on labour logs, store issues and site requests: standard work, additional work or
--    rework. A billed log is frozen with its class; resolving a request never rewrites it; an
--    issue's class can be corrected like its work. One entry per day per class, so a rework gang and
--    the standard gang on the same work log separately.
-- 4. goods_receipts.invoice_no / invoice_date: the supplier's invoice as it arrives with the goods,
--    offered when the bill is recorded. Editable like the challan.
--
-- No view, no definer, no policy and no money changes here.

-- 1 -------------------------------------------------------------------------------------------
alter table indents add column if not exists is_urgent boolean not null default false;

-- 2 -------------------------------------------------------------------------------------------
alter table estimator_estimate_line_measurements
  add column if not exists is_deduction boolean not null default false;

alter table estimator_estimate_line_measurements
  drop constraint if exists estimator_estimate_line_measurements_deduction_typed;
alter table estimator_estimate_line_measurements
  add constraint estimator_estimate_line_measurements_deduction_typed
  check (not (is_deduction and from_model));

create or replace function estimator_copy_estimate_contents(p_from uuid, p_to uuid, p_everything boolean)
returns void
language plpgsql
set search_path to 'public'
as $$
begin
  insert into estimator_estimate_lines
    (estimate_id, work_item_id, qty, note, labour_rate, created_by, updated_by)
  select p_to, l.work_item_id,
         case when p_everything then l.qty end,
         l.note,
         case when p_everything then l.labour_rate end,
         auth.uid(), auth.uid()
  from estimator_estimate_lines l
  where l.estimate_id = p_from;

  if not p_everything then
    return;
  end if;

  insert into estimator_estimate_line_components
    (line_id, item_id, mix_id, material_id, qty_per_unit, created_by, updated_by)
  select t.id, c.item_id, c.mix_id, c.material_id, c.qty_per_unit, auth.uid(), auth.uid()
  from estimator_estimate_line_components c
  join estimator_estimate_lines s on s.id = c.line_id and s.estimate_id = p_from
  join estimator_estimate_lines t on t.estimate_id = p_to and t.work_item_id = s.work_item_id;

  insert into estimator_estimate_line_measurements
    (line_id, description, nos, length, breadth, depth, sort_order, from_model, model_refs,
     is_deduction, created_by, updated_by)
  select t.id, m.description, m.nos, m.length, m.breadth, m.depth, m.sort_order,
         m.from_model, m.model_refs, m.is_deduction, auth.uid(), auth.uid()
  from estimator_estimate_line_measurements m
  join estimator_estimate_lines s on s.id = m.line_id and s.estimate_id = p_from
  join estimator_estimate_lines t on t.estimate_id = p_to and t.work_item_id = s.work_item_id;

  insert into estimator_estimate_item_rates
    (estimate_id, item_id, material_id, rate, note, created_by, updated_by)
  select p_to, r.item_id, r.material_id, r.rate, r.note, auth.uid(), auth.uid()
  from estimator_estimate_item_rates r
  where r.estimate_id = p_from;
end $$;


-- 3 -------------------------------------------------------------------------------------------
alter table labour_logs add column if not exists work_class text not null default 'standard';
alter table stock_issues add column if not exists work_class text not null default 'standard';
alter table issue_requests add column if not exists work_class text not null default 'standard';

alter table labour_logs drop constraint if exists labour_logs_work_class_known;
alter table labour_logs add constraint labour_logs_work_class_known
  check (work_class in ('standard', 'additional', 'rework'));
alter table stock_issues drop constraint if exists stock_issues_work_class_known;
alter table stock_issues add constraint stock_issues_work_class_known
  check (work_class in ('standard', 'additional', 'rework'));
alter table issue_requests drop constraint if exists issue_requests_work_class_known;
alter table issue_requests add constraint issue_requests_work_class_known
  check (work_class in ('standard', 'additional', 'rework'));

alter table labour_logs drop constraint if exists labour_logs_one_per_day;
alter table labour_logs add constraint labour_logs_one_per_day
  unique (plot_id, work_item_id, contractor_id, log_date, kind, work_class);

create or replace function labour_logs_billed_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if old.bill_id is not null then
      raise exception 'This entry has been billed and can no longer be removed.';
    end if;
    return old;
  end if;

  -- The stamp moves (set by Send to Bill, cleared when a recorded bill
  -- is deleted) only under the transaction-local flag that 0106's two
  -- definer functions raise; nothing a client can call sets it. And the
  -- stamp is all they move.
  if new.bill_id is distinct from old.bill_id then
    if coalesce(current_setting('toolbox.labour_billing', true), '') <> 'on' then
      raise exception 'Labour entries are billed from Bills → Labour, with Send to Bill.';
    end if;
    if (new.plot_id, new.work_item_id, new.contractor_id, new.log_date, new.kind,
        new.masons, new.helpers, new.others, new.quantity, new.description, new.note,
        new.work_class)
       is distinct from
       (old.plot_id, old.work_item_id, old.contractor_id, old.log_date, old.kind,
        old.masons, old.helpers, old.others, old.quantity, old.description, old.note,
        old.work_class) then
      raise exception 'Billing an entry does not rewrite it.';
    end if;
    return new;
  end if;

  -- uom is left out of the comparison: a unit renamed in Masters cascades
  -- here (0082) and must not be refused.
  if old.bill_id is not null
     and (new.plot_id, new.work_item_id, new.contractor_id, new.log_date, new.kind,
          new.masons, new.helpers, new.others, new.quantity, new.description, new.note,
          new.work_class)
         is distinct from
         (old.plot_id, old.work_item_id, old.contractor_id, old.log_date, old.kind,
          old.masons, old.helpers, old.others, old.quantity, old.description, old.note,
          old.work_class) then
    raise exception 'This entry has been billed and can no longer be changed.';
  end if;

  return new;
end $$;

create or replace function issue_requests_guard()
returns trigger
language plpgsql
as $$
begin
  if new.plot_id <> old.plot_id
    or new.work_item_id <> old.work_item_id
    or new.item_id <> old.item_id
    or new.created_by is distinct from old.created_by
    or new.created_at <> old.created_at then
    raise exception 'A request''s villa, work, item and requester never change — withdraw it and raise another.';
  end if;

  if old.status <> 'requested' then
    raise exception 'This request is already % — it cannot change.', old.status;
  end if;

  if new.status = 'requested' then
    if not has_app('/supervisors') then
      raise exception 'Only the supervisors app edits an open request.';
    end if;
  elsif new.status in ('fulfilled', 'declined') then
    if not has_app('/inventory') then
      raise exception 'Only the store can fulfil or decline a request.';
    end if;
    if new.quantity <> old.quantity or new.note is distinct from old.note
       or new.off_estimate_reason is distinct from old.off_estimate_reason
       or new.work_class <> old.work_class then
      raise exception 'Resolving a request does not rewrite it — the issue records what was actually given.';
    end if;
  end if;

  return new;
end;
$$;

-- 4 -------------------------------------------------------------------------------------------
alter table goods_receipts add column if not exists invoice_no text;
alter table goods_receipts add column if not exists invoice_date date;

alter table goods_receipts drop constraint if exists goods_receipts_invoice_no_typed;
alter table goods_receipts add constraint goods_receipts_invoice_no_typed
  check (invoice_no is null or length(trim(invoice_no)) > 0);

-- Checks ----------------------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'labour_logs_one_per_day'
                  and pg_get_constraintdef(oid) like '%work_class%') then
    raise exception '0132: one entry per day must count the work class';
  end if;
  if position('is_deduction' in pg_get_functiondef('estimator_copy_estimate_contents(uuid,uuid,boolean)'::regprocedure)) = 0 then
    raise exception '0132: the estimate copy must carry deductions';
  end if;
  if position('work_class' in pg_get_functiondef('labour_logs_billed_guard()'::regprocedure)) = 0
     or position('work_class' in pg_get_functiondef('issue_requests_guard()'::regprocedure)) = 0 then
    raise exception '0132: the labour and request guards must hold the work class';
  end if;
  if exists (select 1 from pg_proc where proname = 'estimator_copy_estimate_contents' and prosecdef) then
    raise exception '0132: the estimate copy must stay an invoker function';
  end if;
end $$;
