-- 0144 — Delete or Cancel, step B2 (plan.md, Piece 4; the founder waived Fable's review, 2026-10-23).
--
-- 1. An official estimate is withdrawn (status cancelled) with a reason while no live indent draws on it. The villa then
--    has no official estimate until the working one is made official again. Every view reads status = 'submitted', so
--    a withdrawn estimate leaves them all by itself.
-- 2. A work order waiting for approval is deleted whole. An approved one is cancelled with a reason, by a bill approver
--    or an admin, while no bill, advance or cash request line rests on it; with one, it is switched off as before.
--    villa_cost_facts counts approved orders only. A new bill, advance or cash request line takes a share lock on its
--    work order, so it waits for a cancel in flight and then finds it cancelled.
-- 3. A draft cash request is deleted whole. A submitted one already goes back to draft through its approver.
--
-- Bills need nothing: an approved bill with no money out is sent back to recorded by an approver, and a recorded bill
-- is deleted as before.

-- ---------------------------------------------------------------------
-- 1. Withdrawing an official estimate
-- ---------------------------------------------------------------------

alter table estimator_estimates add column if not exists cancelled_at timestamptz;
alter table estimator_estimates add column if not exists cancelled_by uuid references profiles (id);
alter table estimator_estimates add column if not exists cancel_reason text;

alter table estimator_estimates drop constraint if exists estimator_estimates_status_known;
alter table estimator_estimates
  add constraint estimator_estimates_status_known
  check (status = any (array['draft', 'submitted', 'superseded', 'cancelled']));

alter table estimator_estimates drop constraint if exists estimator_estimates_cancel_shape;
alter table estimator_estimates
  add constraint estimator_estimates_cancel_shape
  check (
    (status = 'cancelled' and cancelled_at is not null and length(trim(coalesce(cancel_reason, ''))) > 0)
    or (status <> 'cancelled' and cancelled_at is null and cancelled_by is null and cancel_reason is null)
  );

create or replace function estimator_estimates_guard()
returns trigger
language plpgsql
as $$
declare
  v_indents int;
begin
  -- What the paper says is permanent once it says it.
  if old.est_no is not null
     and (new.est_no, new.reference) is distinct from (old.est_no, old.reference) then
    raise exception 'An estimate''s number and reference are permanent';
  end if;
  if old.submitted_at is not null
     and (new.submitted_by, new.submitted_at)
         is distinct from (old.submitted_by, old.submitted_at) then
    raise exception 'Who submitted an estimate, and when, is permanent';
  end if;
  if old.status <> 'draft'
     and (new.project_id, new.unit_id, new.is_template)
         is distinct from (old.project_id, old.unit_id, old.is_template) then
    raise exception 'A submitted estimate''s project and villa are permanent';
  end if;

  if new.status = old.status then
    if old.status <> 'draft' then
      raise exception
        'A % estimate can no longer be edited — revise it instead', old.status;
    end if;
    return new;
  end if;

  if old.status = 'draft' and new.status = 'submitted' then
    if new.is_template then
      raise exception 'A template cannot be submitted — copy it onto a villa first';
    end if;
    if new.unit_id is null then
      raise exception 'Only a villa''s estimate can be submitted';
    end if;
    if new.est_no is null or new.reference is null
       or new.submitted_by is null or new.submitted_at is null then
      raise exception 'Submitting must mint a number and record who submitted and when';
    end if;
    return new;
  end if;

  if old.status = 'submitted' and new.status = 'superseded' then
    if new.superseded_at is null then
      raise exception 'Superseding must record when';
    end if;
    if (new.name, new.note) is distinct from (old.name, old.note) then
      raise exception 'Superseding changes the status and nothing else';
    end if;
    return new;
  end if;

  if old.status = 'submitted' and new.status = 'cancelled' then
    if length(trim(coalesce(new.cancel_reason, ''))) = 0 then
      raise exception 'Say why this estimate is withdrawn';
    end if;
    if (to_jsonb(new) - array['status', 'cancelled_at', 'cancelled_by', 'cancel_reason', 'updated_at', 'updated_by'])
       is distinct from
       (to_jsonb(old) - array['status', 'cancelled_at', 'cancelled_by', 'cancel_reason', 'updated_at', 'updated_by']) then
      raise exception 'Withdrawing an estimate changes nothing else on it';
    end if;
    -- Indents are readable by every signed-in person, so an /estimator holder sees them all.
    select count(distinct i.id) into v_indents
      from indent_lines il
      join indents i on i.id = il.indent_id
     where il.estimate_id = new.id
       and i.status <> 'cancelled';
    if v_indents > 0 then
      raise exception '% on this estimate — cancel % first',
        case when v_indents = 1 then 'An indent draws' else v_indents || ' indents draw' end,
        case when v_indents = 1 then 'it' else 'them' end;
    end if;
    new.cancelled_at := now();
    new.cancelled_by := auth.uid();
    new.cancel_reason := trim(new.cancel_reason);
    return new;
  end if;

  raise exception 'Invalid estimate status change: % -> %', old.status, new.status;
end $$;

-- ---------------------------------------------------------------------
-- 2. Work orders: deleted while pending, cancelled once approved
-- ---------------------------------------------------------------------

alter table labour_contracts add column if not exists cancelled_at timestamptz;
alter table labour_contracts add column if not exists cancelled_by uuid references profiles (id);
alter table labour_contracts add column if not exists cancel_reason text;

alter table labour_contracts drop constraint if exists labour_contracts_status_known;
alter table labour_contracts
  add constraint labour_contracts_status_known
  check (status = any (array['pending_approval', 'approved', 'cancelled']));

alter table labour_contracts drop constraint if exists labour_contracts_cancel_shape;
alter table labour_contracts
  add constraint labour_contracts_cancel_shape
  check (
    (status = 'cancelled' and cancelled_at is not null and length(trim(coalesce(cancel_reason, ''))) > 0)
    or (status <> 'cancelled' and cancelled_at is null and cancelled_by is null and cancel_reason is null)
  );

create or replace function labour_contracts_guard()
returns trigger
language plpgsql
as $$
declare
  v_cap numeric;
  v_bills int;
  v_advances int;
  v_lines int;
  v_what text[] := '{}';
begin
  if (new.wo_no, new.reference) is distinct from (old.wo_no, old.reference)
     and old.reference is not null then
    raise exception 'A work order''s number is permanent';
  end if;

  if new.status = old.status then
    if old.status = 'approved'
       and (new.vendor_id, new.project_id, new.plot_id, new.unit_id,
            new.description, new.contract_value, new.terms)
           is distinct from
           (old.vendor_id, old.project_id, old.plot_id, old.unit_id,
            old.description, old.contract_value, old.terms) then
      raise exception 'An approved work order''s terms are permanent — deactivate it and make a new one';
    end if;
    if old.status = 'cancelled' and to_jsonb(new) - array['updated_at', 'updated_by']
                                    is distinct from to_jsonb(old) - array['updated_at', 'updated_by'] then
      raise exception 'A cancelled work order can no longer be changed';
    end if;
    return new;
  end if;

  if old.status = 'pending_approval' and new.status = 'approved' then
    if not (is_admin() or can_approve_bills(auth.uid())) then
      raise exception 'Only a named bill approver or an admin can approve a work order';
    end if;
    if not is_admin() then
      v_cap := bill_approval_cap(auth.uid());
      if v_cap is not null and new.contract_value > v_cap then
        raise exception 'This work order is above your approval limit of %', v_cap;
      end if;
    end if;
    if new.approved_by is null or new.approved_at is null then
      raise exception 'Approving must record who approved and when';
    end if;
    return new;
  end if;

  if old.status = 'approved' and new.status = 'cancelled' then
    if not (is_admin() or can_approve_bills(auth.uid())) then
      raise exception 'Only a named bill approver or an admin can cancel a work order';
    end if;
    if length(trim(coalesce(new.cancel_reason, ''))) = 0 then
      raise exception 'Say why this work order is cancelled';
    end if;
    if (to_jsonb(new) - array['status', 'cancelled_at', 'cancelled_by', 'cancel_reason', 'updated_at', 'updated_by'])
       is distinct from
       (to_jsonb(old) - array['status', 'cancelled_at', 'cancelled_by', 'cancel_reason', 'updated_at', 'updated_by']) then
      raise exception 'Cancelling a work order changes nothing else on it';
    end if;
    -- Every one of these is /bills on SELECT, the grant the update policy already asked for.
    select count(*) into v_bills from bills where labour_contract_id = new.id;
    select count(*) into v_advances from contractor_advances where labour_contract_id = new.id;
    select count(*) into v_lines from cash_request_items where labour_contract_id = new.id;
    if v_bills > 0 then
      v_what := v_what || case when v_bills = 1 then 'a bill' else v_bills || ' bills' end;
    end if;
    if v_advances > 0 then
      v_what := v_what || case when v_advances = 1 then 'an advance' else v_advances || ' advances' end;
    end if;
    if v_lines > 0 then
      v_what := v_what || case when v_lines = 1 then 'a cash request line' else v_lines || ' cash request lines' end;
    end if;
    if cardinality(v_what) > 0 then
      raise exception 'It has %, so it cannot be cancelled — switch it off instead', array_to_string(v_what, ', ');
    end if;
    new.cancelled_at := now();
    new.cancelled_by := auth.uid();
    new.cancel_reason := trim(new.cancel_reason);
    return new;
  end if;

  raise exception 'Invalid work order status change: % -> %', old.status, new.status;
end $$;

-- A new bill, advance or cash request line on a work order waits for a cancel in flight, then finds it cancelled.
-- Invoker: each writer holds /bills, whose update policy on labour_contracts admits the share lock.
create or replace function work_order_not_cancelled()
returns trigger
language plpgsql
as $$
begin
  if new.labour_contract_id is null then
    return new;
  end if;
  perform 1 from labour_contracts
   where id = new.labour_contract_id and status <> 'cancelled'
     for share;
  if not found then
    raise exception 'That work order is cancelled';
  end if;
  return new;
end $$;

revoke execute on function work_order_not_cancelled() from public, anon, authenticated;

drop trigger if exists bills_work_order_not_cancelled on bills;
create trigger bills_work_order_not_cancelled
  before insert on bills
  for each row execute function work_order_not_cancelled();
drop trigger if exists contractor_advances_work_order_not_cancelled on contractor_advances;
create trigger contractor_advances_work_order_not_cancelled
  before insert on contractor_advances
  for each row execute function work_order_not_cancelled();
drop trigger if exists cash_request_items_work_order_not_cancelled on cash_request_items;
create trigger cash_request_items_work_order_not_cancelled
  before insert on cash_request_items
  for each row execute function work_order_not_cancelled();

drop policy if exists "pending work orders deletable by bills app" on labour_contracts;
create policy "pending work orders deletable by bills app"
  on labour_contracts for delete to authenticated
  using ((select has_app('/bills')) and status = 'pending_approval');

create or replace function delete_pending_work_order(p_contract_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  perform 1 from labour_contracts
   where id = p_contract_id and status = 'pending_approval'
     for update;
  if not found then
    raise exception 'Only a work order waiting for approval can be deleted';
  end if;

  begin
    delete from labour_contract_lines where contract_id = p_contract_id;
    delete from labour_contracts where id = p_contract_id;
  exception when foreign_key_violation then
    raise exception 'An advance or a cash request names this work order, so it cannot be deleted';
  end;
end $$;

revoke execute on function delete_pending_work_order(uuid) from public, anon;
grant execute on function delete_pending_work_order(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 3. A draft cash request is deleted whole
-- ---------------------------------------------------------------------

drop policy if exists "draft cash requests deletable by bills app" on cash_requests;
create policy "draft cash requests deletable by bills app"
  on cash_requests for delete to authenticated
  using ((select has_app('/bills')) and status = 'draft');

create or replace function delete_draft_cash_request(p_request_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  perform 1 from cash_requests
   where id = p_request_id and status = 'draft'
     for update;
  if not found then
    raise exception 'Only a draft cash request can be deleted — a submitted one goes back through its approver';
  end if;

  delete from cash_request_items where cash_request_id = p_request_id;
  delete from cash_requests where id = p_request_id;
end $$;

revoke execute on function delete_draft_cash_request(uuid) from public, anon;
grant execute on function delete_draft_cash_request(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Prove it landed
-- ---------------------------------------------------------------------

do $$
declare
  t text;
  c text;
begin
  foreach t in array array['estimator_estimates', 'labour_contracts']
  loop
    foreach c in array array['cancelled_at', 'cancelled_by', 'cancel_reason']
    loop
      if not exists (
        select 1 from information_schema.columns
         where table_schema = 'public' and table_name = t and column_name = c
      ) then
        raise exception '0144: %.% is missing', t, c;
      end if;
    end loop;
    if not exists (
      select 1 from pg_constraint where conname = t || '_cancel_shape' and conrelid = ('public.' || t)::regclass
    ) then
      raise exception '0144: %_cancel_shape is missing', t;
    end if;
    if position('cancelled' in (
      select pg_get_constraintdef(oid) from pg_constraint
       where conname = t || '_status_known' and conrelid = ('public.' || t)::regclass
    )) = 0 then
      raise exception '0144: %_status_known does not admit cancelled', t;
    end if;
  end loop;

  foreach c in array array['superseded_at', 'is_template', 'indent_lines', 'submitted_by']
  loop
    if position(c in pg_get_functiondef('estimator_estimates_guard()'::regprocedure)) = 0 then
      raise exception '0144: estimator_estimates_guard lost its % check', c;
    end if;
  end loop;
  foreach c in array array['bill_approval_cap', 'can_approve_bills', 'contractor_advances', 'cash_request_items']
  loop
    if position(c in pg_get_functiondef('labour_contracts_guard()'::regprocedure)) = 0 then
      raise exception '0144: labour_contracts_guard lost its % check', c;
    end if;
  end loop;

  foreach t in array array['estimator_estimates_guard', 'labour_contracts_guard', 'bills_work_order_not_cancelled',
                           'contractor_advances_work_order_not_cancelled', 'cash_request_items_work_order_not_cancelled']
  loop
    if not exists (select 1 from pg_trigger where tgname = t and not tgisinternal and tgenabled <> 'D') then
      raise exception '0144: trigger % is missing or off', t;
    end if;
  end loop;

  foreach c in array array['estimator_estimates_guard()', 'labour_contracts_guard()', 'work_order_not_cancelled()',
                           'delete_pending_work_order(uuid)', 'delete_draft_cash_request(uuid)']
  loop
    if (select prosecdef from pg_proc where oid = c::regprocedure) then
      raise exception '0144: % must run as the caller', c;
    end if;
  end loop;
  foreach c in array array['delete_pending_work_order(uuid)', 'delete_draft_cash_request(uuid)']
  loop
    if has_function_privilege('anon', c, 'execute') then
      raise exception '0144: anon can execute %', c;
    end if;
    if not has_function_privilege('authenticated', c, 'execute') then
      raise exception '0144: signed-in people cannot execute %', c;
    end if;
  end loop;
  if has_function_privilege('authenticated', 'work_order_not_cancelled()', 'execute') then
    raise exception '0144: work_order_not_cancelled is executable by a client role';
  end if;

  foreach t in array array['labour_contracts', 'cash_requests']
  loop
    if (select count(*) from pg_policies where schemaname = 'public' and tablename = t and cmd = 'DELETE') <> 1 then
      raise exception '0144: % should have exactly one delete policy', t;
    end if;
  end loop;
end $$;
