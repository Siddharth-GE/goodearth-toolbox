-- 0147 — Delete or Cancel, step D1 (plan.md, Piece 4): a payment, an advance or a recovery is reversed, never deleted.
--
-- A reversal is a second row in the same table: the original's amount the other way, pointing at it, with a reason. Every
-- sum over these tables nets by itself, so no reader needs to learn a filter, and the tables stay append-only (no update
-- or delete policy, as 0107 asserts). One reversal per row, never a reversal of a reversal, by a bill approver or an
-- admin (money, the founder's rule 2026-10-23). An advance is reversed only once nothing is left recovered from it.
--
-- A paid bill that falls below its total goes back to approved, and one whose money nets to nothing may be sent back,
-- so a bill paid in error can be put right. It still never deletes: its rows point at it, and delete_recorded_bill
-- says so. An advance reversed in full no longer holds its work order (labour_contracts_guard).

-- ---------------------------------------------------------------------
-- 1. The reversal columns
-- ---------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['bill_payments', 'contractor_advances', 'advance_recoveries'] loop
    execute format('alter table %I add column if not exists reverses_id uuid references %I (id)', t, t);
    execute format('alter table %I add column if not exists reverse_reason text', t);
    execute format('create unique index if not exists %I on %I (reverses_id) where reverses_id is not null',
                   t || '_reversed_once', t);
    execute format('alter table %I drop constraint if exists %I', t, t || '_amount_check');
    execute format('alter table %I drop constraint if exists %I', t, t || '_reversal_shape');
    execute format(
      'alter table %I add constraint %I check ('
      '(reverses_id is null and amount > 0 and reverse_reason is null) '
      'or (reverses_id is not null and amount < 0 and length(trim(coalesce(reverse_reason, ''''))) > 0))',
      t, t || '_reversal_shape');
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 2. The reversal guard: everything but the reason comes from the original
-- ---------------------------------------------------------------------
-- Invoker: a /bills holder reads all three tables and may update bills, so the row lock below is theirs to take. The
-- advisory lock on the original's id is the one a recovery takes on its advance (0107), so an advance cannot be
-- reversed while a recovery from it is being saved.

create or replace function money_reversal_guard()
returns trigger
language plpgsql
as $$
declare
  v_of uuid;
  v_amount numeric;
  v_bill uuid;
  v_status text;
  v_recovered numeric;
  v_done boolean;
  v_payment bill_payments%rowtype;
  v_advance contractor_advances%rowtype;
  v_recovery advance_recoveries%rowtype;
begin
  if not is_bill_approver() then
    raise exception 'Only a bill approver or an admin can reverse money';
  end if;
  if length(trim(coalesce(new.reverse_reason, ''))) = 0 then
    raise exception 'Say why it is reversed';
  end if;
  new.reverse_reason := trim(new.reverse_reason);
  perform pg_advisory_xact_lock(hashtextextended(new.reverses_id::text, 0));

  if tg_table_name = 'bill_payments' then
    select * into v_payment from bill_payments where id = new.reverses_id;
    if not found then raise exception 'That payment is not on record'; end if;
    v_of := v_payment.reverses_id;
    v_amount := v_payment.amount;
    v_bill := v_payment.bill_id;
    new.bill_id := v_payment.bill_id;
    new.payment_ref := v_payment.payment_ref;
    new.cash_request_item_id := v_payment.cash_request_item_id;
  elsif tg_table_name = 'advance_recoveries' then
    select * into v_recovery from advance_recoveries where id = new.reverses_id;
    if not found then raise exception 'That recovery is not on record'; end if;
    v_of := v_recovery.reverses_id;
    v_amount := v_recovery.amount;
    v_bill := v_recovery.bill_id;
    new.bill_id := v_recovery.bill_id;
    new.advance_id := v_recovery.advance_id;
  else
    select * into v_advance from contractor_advances where id = new.reverses_id;
    if not found then raise exception 'That advance is not on record'; end if;
    v_of := v_advance.reverses_id;
    v_amount := v_advance.amount;
    new.vendor_id := v_advance.vendor_id;
    new.project_id := v_advance.project_id;
    new.labour_contract_id := v_advance.labour_contract_id;
    new.payment_ref := v_advance.payment_ref;
    new.cash_request_item_id := v_advance.cash_request_item_id;
    select coalesce(sum(amount), 0) into v_recovered from advance_recoveries where advance_id = new.reverses_id;
    if v_recovered > 0.005 then
      raise exception '₹% of this advance has been recovered from bills — reverse those recoveries first',
        round(v_recovered, 2);
    end if;
  end if;

  if v_of is not null then
    raise exception 'A reversal is never itself reversed';
  end if;
  execute format('select exists (select 1 from %I where reverses_id = $1)', tg_table_name)
    into strict v_done using new.reverses_id;
  if v_done then
    raise exception 'This was reversed already';
  end if;

  if v_bill is not null then
    select status into v_status from bills where id = v_bill for update;
    if v_status not in ('approved', 'paid') then
      raise exception 'Money is reversed only on an approved or paid bill (this one is %)', coalesce(v_status, 'gone');
    end if;
  end if;

  new.amount := -v_amount;
  -- Dated today in India and signed by whoever reverses, whatever an insert says.
  if tg_table_name = 'advance_recoveries' then
    new.recovered_on := (now() at time zone 'Asia/Kolkata')::date;
  else
    new.paid_on := (now() at time zone 'Asia/Kolkata')::date;
  end if;
  new.created_by := auth.uid();
  new.updated_by := auth.uid();
  new.note := null;
  return new;
end $$;

revoke execute on function money_reversal_guard() from public, anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['bill_payments', 'contractor_advances', 'advance_recoveries'] loop
    execute format('drop trigger if exists %I on %I', t || '_reversal_guard', t);
    execute format(
      'create trigger %I before insert on %I for each row when (new.reverses_id is not null) '
      'execute function money_reversal_guard()', t || '_reversal_guard', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 3. 0107's settlement guard: a reversal is the guard above's; a recovery
--    never comes from a reversed advance
-- ---------------------------------------------------------------------

create or replace function bill_settlement_guard()
returns trigger
language plpgsql
as $$
declare
  v_status text;
  v_total numeric;
  v_vendor uuid;
  v_settled numeric;
  v_advance_amount numeric;
  v_advance_vendor uuid;
  v_advance_of uuid;
  v_recovered numeric;
begin
  if new.reverses_id is not null then
    return new;
  end if;

  select status, total_amount, vendor_id into v_status, v_total, v_vendor
    from bills where id = new.bill_id for update;
  if v_status is distinct from 'approved' then
    raise exception 'Money goes out only against an approved bill (this one is %)', coalesce(v_status, 'gone');
  end if;

  select coalesce((select sum(amount) from bill_payments where bill_id = new.bill_id), 0)
       + coalesce((select sum(amount) from advance_recoveries where bill_id = new.bill_id), 0)
    into v_settled;
  if v_settled + new.amount > v_total + 0.005 then
    raise exception 'That is more than this bill has pending (₹% left)', round(v_total - v_settled, 2);
  end if;

  if tg_table_name = 'advance_recoveries' then
    -- An advisory lock, not FOR UPDATE: a row lock needs an UPDATE policy,
    -- and advances have none by design (append-only) — the 0021 §7 lesson.
    perform pg_advisory_xact_lock(hashtextextended(new.advance_id::text, 0));
    select amount, vendor_id, reverses_id into v_advance_amount, v_advance_vendor, v_advance_of
      from contractor_advances where id = new.advance_id;
    if v_advance_of is not null
       or exists (select 1 from contractor_advances where reverses_id = new.advance_id) then
      raise exception 'That advance was reversed, so nothing is left to recover from it';
    end if;
    if v_advance_vendor is distinct from v_vendor then
      raise exception 'An advance is recovered only from the same contractor''s bills';
    end if;
    select coalesce(sum(amount), 0) into v_recovered
      from advance_recoveries where advance_id = new.advance_id;
    if v_recovered + new.amount > v_advance_amount + 0.005 then
      raise exception 'Only ₹% of that advance is still to recover', round(v_advance_amount - v_recovered, 2);
    end if;
  end if;

  return new;
end $$;

-- ---------------------------------------------------------------------
-- 4. Paid follows the money both ways
-- ---------------------------------------------------------------------

create or replace function bill_settlement_marks_paid()
returns trigger
language plpgsql
as $$
declare
  v_total numeric;
  v_status text;
  v_settled numeric;
  v_ref text;
begin
  select total_amount, status into v_total, v_status from bills where id = new.bill_id;
  if v_status not in ('approved', 'paid') then
    return null;
  end if;
  select coalesce((select sum(amount) from bill_payments where bill_id = new.bill_id), 0)
       + coalesce((select sum(amount) from advance_recoveries where bill_id = new.bill_id), 0)
    into v_settled;

  if v_status = 'approved' and v_settled >= v_total - 0.005 then
    select p.payment_ref into v_ref from bill_payments p
     where p.bill_id = new.bill_id and p.reverses_id is null
       and not exists (select 1 from bill_payments r where r.reverses_id = p.id)
     order by p.paid_on desc, p.created_at desc limit 1;
    update bills set
      status = 'paid',
      payment_ref = coalesce(v_ref, 'Settled from advances'),
      paid_by = auth.uid(),
      paid_at = now()
    where id = new.bill_id;
  elsif v_status = 'paid' and v_settled < v_total - 0.005 then
    update bills set status = 'approved', payment_ref = null, paid_by = null, paid_at = null
     where id = new.bill_id;
  end if;
  return null;
end $$;

-- ---------------------------------------------------------------------
-- 5. bills_guard: 0107's, carried forward whole, with two changes —
--    paid → approved once the money says so, and a send-back refused
--    while money is out (net), not once any ever was
-- ---------------------------------------------------------------------

create or replace function bills_guard()
returns trigger
language plpgsql
as $$
declare
  v_cap numeric;
  v_settled numeric;
begin
  if (new.project_id, new.plot_id, new.unit_id, new.scope_code, new.vendor_id,
      new.po_id, new.labour_contract_id, new.kind, new.bill_no, new.reference)
     is distinct from
     (old.project_id, old.plot_id, old.unit_id, old.scope_code, old.vendor_id,
      old.po_id, old.labour_contract_id, old.kind, old.bill_no, old.reference) then
    raise exception 'A bill''s anchor, vendor, scope and number are permanent';
  end if;

  if new.status = old.status then
    if old.status <> 'recorded' then
      raise exception 'A % bill can no longer be edited', old.status;
    end if;
    return new;
  end if;

  select coalesce((select sum(amount) from bill_payments where bill_id = old.id), 0)
       + coalesce((select sum(amount) from advance_recoveries where bill_id = old.id), 0)
    into v_settled;

  if old.status = 'recorded' and new.status = 'approved' then
    -- Self-approval allowed (founder decision): the recorder may sit on
    -- this list — no recorder <> approver check, deliberately.
    if not (is_admin() or can_approve_bills(auth.uid())) then
      raise exception 'Only a named bill approver or an admin can approve a bill';
    end if;
    if not is_admin() then
      v_cap := bill_approval_cap(auth.uid());
      if v_cap is not null and new.total_amount > v_cap then
        raise exception 'This bill is above your approval limit of %', v_cap;
      end if;
    end if;
    if new.approved_by is null or new.approved_at is null then
      raise exception 'Approving must record who approved and when';
    end if;
    if new.rejection_note is not null then
      raise exception 'Approving must clear the rejection note';
    end if;
    return new;
  end if;

  if old.status = 'approved' and new.status = 'recorded' then
    if abs(v_settled) > 0.005 then
      raise exception 'Money has gone out against this bill — reverse it before sending the bill back';
    end if;
    if not (is_admin() or can_approve_bills(auth.uid())) then
      raise exception 'Only a named bill approver or an admin can send a bill back';
    end if;
    if new.rejection_note is null or length(trim(new.rejection_note)) = 0 then
      raise exception 'Say what needs changing — a send-back needs a note';
    end if;
    if new.approved_by is not null or new.approved_at is not null then
      raise exception 'Sending back must clear the approval fields';
    end if;
    return new;
  end if;

  if old.status = 'approved' and new.status = 'paid' then
    if v_settled < old.total_amount - 0.005 then
      raise exception 'Record the payments first — ₹% of this bill is still pending',
        round(old.total_amount - v_settled, 2);
    end if;
    if new.payment_ref is null or length(trim(new.payment_ref)) = 0 then
      raise exception 'Record the payment reference before marking this bill paid';
    end if;
    if new.paid_by is null or new.paid_at is null then
      raise exception 'Marking paid must record who paid and when';
    end if;
    return new;
  end if;

  -- Only a reversal brings a bill below its total, and its trigger is the one caller that passes.
  if old.status = 'paid' and new.status = 'approved' then
    if v_settled >= old.total_amount - 0.005 then
      raise exception 'This bill is still paid in full — reverse a payment first';
    end if;
    if new.payment_ref is not null or new.paid_by is not null or new.paid_at is not null then
      raise exception 'Reopening a bill must clear its payment fields';
    end if;
    return new;
  end if;

  raise exception 'Invalid bill status change: % -> %', old.status, new.status;
end $$;

-- ---------------------------------------------------------------------
-- 5b. 0106's delete_recorded_bill, carried forward whole: a bill sent
--     back after a reversal keeps its money rows, so it says so
-- ---------------------------------------------------------------------

create or replace function delete_recorded_bill(p_bill_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_created_by uuid;
begin
  if not has_app('/bills') then
    raise exception 'Only the Bills tool can delete a bill';
  end if;
  select status, created_by into v_status, v_created_by from bills where id = p_bill_id for update;
  if not found then
    raise exception 'That bill no longer exists';
  end if;
  if v_status <> 'recorded' or not (is_admin() or v_created_by = auth.uid()) then
    raise exception 'Only a recorded bill can be deleted, by whoever recorded it or an admin';
  end if;
  if exists (select 1 from bill_payments where bill_id = p_bill_id)
     or exists (select 1 from advance_recoveries where bill_id = p_bill_id) then
    raise exception 'Money was paid and reversed on this bill, so it stays on record — correct it and approve it again';
  end if;

  perform set_config('toolbox.labour_billing', 'on', true);
  update labour_logs set bill_id = null where bill_id = p_bill_id;
  perform set_config('toolbox.labour_billing', '', true);
  delete from bill_lines where bill_id = p_bill_id;
  delete from bills where id = p_bill_id;
end $$;

revoke execute on function delete_recorded_bill(uuid) from public, anon;
grant execute on function delete_recorded_bill(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 5c. 0144's labour_contracts_guard, carried forward whole: an advance
--     reversed in full no longer holds its work order
-- ---------------------------------------------------------------------

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
    select count(*) into v_advances from contractor_advances a
     where a.labour_contract_id = new.id and a.reverses_id is null
       and not exists (select 1 from contractor_advances r where r.reverses_id = a.id);
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

-- ---------------------------------------------------------------------
-- 6. The one door the screens use
-- ---------------------------------------------------------------------
-- Copies the original's keys so the insert can be written; the guard above re-reads and overwrites them, so a direct
-- insert can fake nothing either. Dated today in India, as the screens date a payment.

create or replace function reverse_bill_money(p_kind text, p_id uuid, p_reason text)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_id uuid;
begin
  if p_kind = 'payment' then
    insert into bill_payments (bill_id, amount, paid_on, payment_ref, reverses_id, reverse_reason, created_by, updated_by)
    select bill_id, -amount, v_today, payment_ref, id, p_reason, auth.uid(), auth.uid()
      from bill_payments where id = p_id
    returning id into v_id;
  elsif p_kind = 'recovery' then
    insert into advance_recoveries (advance_id, bill_id, amount, recovered_on, reverses_id, reverse_reason, created_by, updated_by)
    select advance_id, bill_id, -amount, v_today, id, p_reason, auth.uid(), auth.uid()
      from advance_recoveries where id = p_id
    returning id into v_id;
  elsif p_kind = 'advance' then
    insert into contractor_advances (vendor_id, project_id, amount, paid_on, payment_ref, reverses_id, reverse_reason,
                                     created_by, updated_by)
    select vendor_id, project_id, -amount, v_today, payment_ref, id, p_reason, auth.uid(), auth.uid()
      from contractor_advances where id = p_id
    returning id into v_id;
  else
    raise exception 'Only a payment, a recovery or an advance is reversed';
  end if;
  if v_id is null then
    raise exception 'That entry is not on record';
  end if;
  return v_id;
end $$;

revoke execute on function reverse_bill_money(text, uuid, text) from public, anon;
grant execute on function reverse_bill_money(text, uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 7. Prove it landed
-- ---------------------------------------------------------------------

do $$
declare
  t text;
  c text;
begin
  foreach t in array array['bill_payments', 'contractor_advances', 'advance_recoveries'] loop
    foreach c in array array['reverses_id', 'reverse_reason'] loop
      if not exists (select 1 from information_schema.columns
                      where table_schema = 'public' and table_name = t and column_name = c) then
        raise exception '0147: %.% is missing', t, c;
      end if;
    end loop;
    if not exists (select 1 from pg_constraint where conname = t || '_reversal_shape' and conrelid = t::regclass) then
      raise exception '0147: %_reversal_shape is missing', t;
    end if;
    if exists (select 1 from pg_constraint where conname = t || '_amount_check' and conrelid = t::regclass) then
      raise exception '0147: %_amount_check still refuses a reversal', t;
    end if;
    if not exists (select 1 from pg_indexes where indexname = t || '_reversed_once' and indexdef ilike '%unique%') then
      raise exception '0147: %_reversed_once is missing', t;
    end if;
    if not exists (select 1 from pg_trigger where tgname = t || '_reversal_guard' and tgrelid = t::regclass
                    and not tgisinternal and tgenabled <> 'D') then
      raise exception '0147: %_reversal_guard is missing or off', t;
    end if;
    if exists (select 1 from pg_policies where schemaname = 'public' and tablename = t
                and cmd in ('UPDATE', 'DELETE', 'ALL')) then
      raise exception '0147: % must stay append-only', t;
    end if;
  end loop;

  foreach c in array array['bill_approval_cap', 'can_approve_bills', 'bill_payments', 'advance_recoveries',
                           'still paid in full', 'reverse it before sending']
  loop
    if position(c in pg_get_functiondef('bills_guard()'::regprocedure)) = 0 then
      raise exception '0147: bills_guard lost its % check', c;
    end if;
  end loop;
  foreach c in array array['bill_approval_cap', 'can_approve_bills', 'contractor_advances', 'cash_request_items', 'reverses_id']
  loop
    if position(c in pg_get_functiondef('labour_contracts_guard()'::regprocedure)) = 0 then
      raise exception '0147: labour_contracts_guard lost its % check', c;
    end if;
  end loop;
  foreach c in array array['has_app', 'is_admin', 'labour_billing', 'bill_payments', 'advance_recoveries']
  loop
    if position(c in pg_get_functiondef('delete_recorded_bill(uuid)'::regprocedure)) = 0 then
      raise exception '0147: delete_recorded_bill lost its % check', c;
    end if;
  end loop;
  if not (select prosecdef from pg_proc where oid = 'delete_recorded_bill(uuid)'::regprocedure)
     or has_function_privilege('anon', 'delete_recorded_bill(uuid)', 'execute') then
    raise exception '0147: delete_recorded_bill must stay a definer, signed-in only';
  end if;

  foreach c in array array['more than this bill has pending', 'same contractor', 'still to recover', 'was reversed']
  loop
    if position(c in pg_get_functiondef('bill_settlement_guard()'::regprocedure)) = 0 then
      raise exception '0147: bill_settlement_guard lost its % check', c;
    end if;
  end loop;

  foreach c in array array['money_reversal_guard()', 'bill_settlement_guard()', 'bill_settlement_marks_paid()',
                           'bills_guard()', 'labour_contracts_guard()', 'reverse_bill_money(text, uuid, text)']
  loop
    if (select prosecdef from pg_proc where oid = c::regprocedure) then
      raise exception '0147: % must run as the caller', c;
    end if;
  end loop;
  if has_function_privilege('authenticated', 'money_reversal_guard()', 'execute') then
    raise exception '0147: money_reversal_guard is executable by a client role';
  end if;
  if has_function_privilege('anon', 'reverse_bill_money(text, uuid, text)', 'execute')
     or not has_function_privilege('authenticated', 'reverse_bill_money(text, uuid, text)', 'execute') then
    raise exception '0147: reverse_bill_money must be signed-in only';
  end if;
end $$;
