-- 0107 — Paying bills: part-payments, advances, the weekly cash request
--
-- FOUNDER, 2026-10-08 (plan.md, B8): "add a weekly cash request feature,
-- an advance summary, and payment tracking. Show any unpaid balance
-- against each contractor's bill … if a contractor receives ₹1 lakh
-- against a bill of ₹1.5 lakh, the remaining ₹50,000 should be shown as
-- pending." Decided: weekly request → release by a BILL APPROVER (who may
-- cut amounts) → payments recorded per bill, part-payments allowed;
-- advances are recovered by deduction from later bills.
--
--   * bill_payments — money out against a bill: amount, date, the UTR /
--     cheque / UPI reference, and the cash-request line it came from.
--   * contractor_advances — money out before any bill, to a contractor
--     on a project (optionally a work order).
--   * advance_recoveries — part of an advance set against a bill.
--   * A BILL IS SETTLED BY payments + recoveries. Neither may take it
--     past its total (checked under a row lock on the bill), and a
--     recovery never exceeds what is left of its advance, and only
--     against a bill of the same contractor. When the two reach the
--     total, the bill becomes paid — a trigger, so "paid" can never
--     disagree with the money. Only approved bills take money.
--   * cash_requests + cash_request_items — the week's list: bills with
--     what is asked for each, and advances. draft → submitted →
--     released (a bill approver or an admin; released amounts may be cut)
--     → closed. Sent back: submitted → draft.
--   * Append-only money: no update or delete policy on payments,
--     advances or recoveries — a mistake is a person's conversation with
--     accounts and an admin, not an edit (the inventory precedent).
--   * BACKFILL: every bill already paid gets one payment of its total on
--     the day and with the reference it was marked paid with, so history
--     reads the same through the new screens.
--   * All /bills on SELECT (with /reporter, as bills — 0055), /bills to
--     write. bill_money_facts and po_billing_totals keep their columns.
--
-- Re-runnable throughout.

-- ---------------------------------------------------------------------
-- 1. The weekly cash request
-- ---------------------------------------------------------------------

create table if not exists cash_requests (
  id uuid primary key default gen_random_uuid(),
  week_of date not null,
  status text not null default 'draft'
    check (status in ('draft', 'submitted', 'released', 'closed')),
  note text,
  sent_back_note text,
  submitted_by uuid references profiles (id),
  submitted_at timestamptz,
  released_by uuid references profiles (id),
  released_at timestamptz,
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cash_requests_week_is_monday check (extract(isodow from week_of) = 1)
);

create index if not exists cash_requests_week_idx on cash_requests (week_of desc);

create table if not exists cash_request_items (
  id uuid primary key default gen_random_uuid(),
  cash_request_id uuid not null references cash_requests (id),
  item_kind text not null check (item_kind in ('bill', 'advance')),
  bill_id uuid references bills (id),
  vendor_id uuid references vendors (id),
  project_id uuid references projects (id),
  labour_contract_id uuid references labour_contracts (id),
  requested_amount numeric not null check (requested_amount > 0),
  released_amount numeric check (released_amount is null or released_amount >= 0),
  note text,
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cash_request_items_shape check (
    (item_kind = 'bill' and bill_id is not null)
    or (item_kind = 'advance' and bill_id is null and vendor_id is not null and project_id is not null)
  ),
  constraint cash_request_items_one_bill_per_request unique (cash_request_id, bill_id)
);

create index if not exists cash_request_items_request_idx on cash_request_items (cash_request_id);
create index if not exists cash_request_items_bill_idx on cash_request_items (bill_id);

create or replace function is_bill_approver()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select is_admin() or exists (select 1 from bill_approvers a where a.user_id = auth.uid());
$$;

revoke execute on function is_bill_approver() from public, anon;
grant execute on function is_bill_approver() to authenticated;

create or replace function cash_requests_guard()
returns trigger
language plpgsql
as $$
begin
  if new.week_of <> old.week_of and old.status <> 'draft' then
    raise exception 'A submitted cash request keeps its week';
  end if;

  if new.status = old.status then
    if old.status in ('released', 'closed') and new.note is distinct from old.note then
      raise exception 'A released cash request can no longer be edited';
    end if;
    return new;
  end if;

  if old.status = 'draft' and new.status = 'submitted' then
    if not exists (select 1 from cash_request_items where cash_request_id = new.id) then
      raise exception 'Add at least one bill or advance before submitting';
    end if;
    if new.submitted_by is null or new.submitted_at is null then
      raise exception 'Submitting must record who and when';
    end if;
    return new;
  end if;

  if old.status = 'submitted' and new.status = 'draft' then
    if not is_bill_approver() then
      raise exception 'Only a bill approver or an admin can send a cash request back';
    end if;
    if new.sent_back_note is null or length(trim(new.sent_back_note)) = 0 then
      raise exception 'Say what needs changing — sending back needs a note';
    end if;
    return new;
  end if;

  if old.status = 'submitted' and new.status = 'released' then
    if not is_bill_approver() then
      raise exception 'Only a bill approver or an admin can release a cash request';
    end if;
    if new.released_by is null or new.released_at is null then
      raise exception 'Releasing must record who and when';
    end if;
    -- Anything the approver did not cut is released as asked.
    update cash_request_items set released_amount = requested_amount
      where cash_request_id = new.id and released_amount is null;
    return new;
  end if;

  if old.status = 'released' and new.status = 'closed' then
    return new;
  end if;

  raise exception 'Invalid cash request change: % -> %', old.status, new.status;
end $$;

drop trigger if exists cash_requests_guard on cash_requests;
create trigger cash_requests_guard
  before update on cash_requests
  for each row execute function cash_requests_guard();

-- Asked-for amounts move while drafting; released amounts only while the
-- approver has it (and the trigger above, on release).
create or replace function cash_request_items_guard()
returns trigger
language plpgsql
as $$
declare
  v_status text;
  v_request uuid;
begin
  v_request := case when tg_op = 'DELETE' then old.cash_request_id else new.cash_request_id end;
  select status into v_status from cash_requests where id = v_request for share;

  if tg_op = 'DELETE' or tg_op = 'INSERT' then
    if v_status <> 'draft' then
      raise exception 'Bills and advances are added or removed only while the request is a draft';
    end if;
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if (new.cash_request_id, new.item_kind, new.bill_id, new.vendor_id, new.project_id, new.labour_contract_id)
     is distinct from
     (old.cash_request_id, old.item_kind, old.bill_id, old.vendor_id, old.project_id, old.labour_contract_id) then
    raise exception 'What a cash request line is for never changes — remove it and add another';
  end if;
  if new.requested_amount <> old.requested_amount and v_status <> 'draft' then
    raise exception 'The amount asked for changes only while the request is a draft';
  end if;
  if new.released_amount is distinct from old.released_amount then
    if v_status = 'submitted' then
      if not is_bill_approver() then
        raise exception 'Only a bill approver or an admin decides what is released';
      end if;
      if new.released_amount > new.requested_amount then
        raise exception 'Release no more than was asked for';
      end if;
    elsif not (v_status = 'released' and old.released_amount is null) then
      raise exception 'Released amounts are set while the request is with the approver';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists cash_request_items_guard on cash_request_items;
create trigger cash_request_items_guard
  before insert or update or delete on cash_request_items
  for each row execute function cash_request_items_guard();

-- ---------------------------------------------------------------------
-- 2. Payments, advances, recoveries
-- ---------------------------------------------------------------------

create table if not exists bill_payments (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references bills (id),
  amount numeric not null check (amount > 0),
  paid_on date not null default current_date,
  payment_ref text not null check (length(trim(payment_ref)) > 0),
  cash_request_item_id uuid references cash_request_items (id),
  note text,
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bill_payments_bill_idx on bill_payments (bill_id);
create index if not exists bill_payments_paid_on_idx on bill_payments (paid_on desc);

create table if not exists contractor_advances (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references vendors (id),
  project_id uuid not null references projects (id),
  labour_contract_id uuid references labour_contracts (id),
  amount numeric not null check (amount > 0),
  paid_on date not null default current_date,
  payment_ref text not null check (length(trim(payment_ref)) > 0),
  cash_request_item_id uuid references cash_request_items (id),
  note text,
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists contractor_advances_vendor_idx on contractor_advances (vendor_id);

create table if not exists advance_recoveries (
  id uuid primary key default gen_random_uuid(),
  advance_id uuid not null references contractor_advances (id),
  bill_id uuid not null references bills (id),
  amount numeric not null check (amount > 0),
  recovered_on date not null default current_date,
  note text,
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists advance_recoveries_advance_idx on advance_recoveries (advance_id);
create index if not exists advance_recoveries_bill_idx on advance_recoveries (bill_id);

-- Neither a payment nor a recovery takes a bill past its total; only an
-- approved bill takes money. The row lock on the bill serialises two
-- people paying the same bill at once.
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
  v_recovered numeric;
begin
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
    select amount, vendor_id into v_advance_amount, v_advance_vendor
      from contractor_advances where id = new.advance_id;
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

drop trigger if exists bill_payments_settlement_guard on bill_payments;
create trigger bill_payments_settlement_guard
  before insert on bill_payments
  for each row execute function bill_settlement_guard();

drop trigger if exists advance_recoveries_settlement_guard on advance_recoveries;
create trigger advance_recoveries_settlement_guard
  before insert on advance_recoveries
  for each row execute function bill_settlement_guard();

-- Settled in full → paid. Invoker: the person recording the payment
-- holds /bills, which may update bills; bills_guard checks the shape.
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
  if v_status <> 'approved' then
    return null;
  end if;
  select coalesce((select sum(amount) from bill_payments where bill_id = new.bill_id), 0)
       + coalesce((select sum(amount) from advance_recoveries where bill_id = new.bill_id), 0)
    into v_settled;
  if v_settled >= v_total - 0.005 then
    select payment_ref into v_ref from bill_payments
      where bill_id = new.bill_id order by paid_on desc, created_at desc limit 1;
    update bills set
      status = 'paid',
      payment_ref = coalesce(v_ref, 'Settled from advances'),
      paid_by = auth.uid(),
      paid_at = now()
    where id = new.bill_id;
  end if;
  return null;
end $$;

drop trigger if exists bill_payments_marks_paid on bill_payments;
create trigger bill_payments_marks_paid
  after insert on bill_payments
  for each row execute function bill_settlement_marks_paid();

drop trigger if exists advance_recoveries_marks_paid on advance_recoveries;
create trigger advance_recoveries_marks_paid
  after insert on advance_recoveries
  for each row execute function bill_settlement_marks_paid();

-- ---------------------------------------------------------------------
-- 3. Audit, updated_at, RLS
-- ---------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['cash_requests', 'cash_request_items', 'bill_payments',
                           'contractor_advances', 'advance_recoveries'] loop
    execute format('drop trigger if exists audit_%s on %I', t, t);
    execute format(
      'create trigger audit_%s after insert or update or delete on %I for each row execute function audit_row()', t, t);
    execute format('drop trigger if exists set_updated_at on %I', t);
    execute format(
      'create trigger set_updated_at before update on %I for each row execute function set_updated_at()', t);
    execute format('alter table %I enable row level security', t);

    execute format('drop policy if exists "%s readable by bills or reporter" on %I', t, t);
    execute format(
      'create policy "%s readable by bills or reporter" on %I for select to authenticated using (has_app(''/bills'') or has_app(''/reporter''))', t, t);
    execute format('drop policy if exists "%s insertable by bills app" on %I', t, t);
    execute format(
      'create policy "%s insertable by bills app" on %I for insert to authenticated with check (has_app(''/bills''))', t, t);
  end loop;

  -- The request and its lines move through their guards; the money
  -- tables have no update or delete policy at all.
  foreach t in array array['cash_requests', 'cash_request_items'] loop
    execute format('drop policy if exists "%s updatable by bills app" on %I', t, t);
    execute format(
      'create policy "%s updatable by bills app" on %I for update to authenticated using (has_app(''/bills'')) with check (has_app(''/bills''))', t, t);
  end loop;

  drop policy if exists "cash_request_items deletable by bills app" on cash_request_items;
  create policy "cash_request_items deletable by bills app" on cash_request_items
    for delete to authenticated using (has_app('/bills'));
end $$;

-- ---------------------------------------------------------------------
-- 4. Backfill: a bill already paid reads as paid in full
-- ---------------------------------------------------------------------
-- The settlement guard demands an approved bill, so the backfill writes
-- with the triggers it would trip switched off for this statement only.

alter table bill_payments disable trigger bill_payments_settlement_guard;
alter table bill_payments disable trigger bill_payments_marks_paid;

insert into bill_payments (bill_id, amount, paid_on, payment_ref, note, created_by, updated_by, created_at)
select b.id, b.total_amount, coalesce(b.paid_at, b.updated_at)::date,
       coalesce(nullif(trim(b.payment_ref), ''), '—'),
       'Recorded as paid before part-payments existed',
       b.paid_by, b.paid_by, coalesce(b.paid_at, b.updated_at)
from bills b
where b.status = 'paid'
  and not exists (select 1 from bill_payments p where p.bill_id = b.id);

alter table bill_payments enable trigger bill_payments_settlement_guard;
alter table bill_payments enable trigger bill_payments_marks_paid;

-- ---------------------------------------------------------------------
-- 5. Prove it
-- ---------------------------------------------------------------------

do $$
declare
  t text;
  v int;
begin
  foreach t in array array['cash_requests', 'cash_request_items', 'bill_payments',
                           'contractor_advances', 'advance_recoveries'] loop
    if not exists (select 1 from pg_class where relname = t and relrowsecurity) then
      raise exception '0107: % is missing or has RLS off', t;
    end if;
    select count(*) into v from pg_policies
      where schemaname = 'public' and tablename = t and cmd = 'SELECT';
    if v <> 1 then raise exception '0107: % has % SELECT policies, expected 1', t, v; end if;
    if exists (select 1 from pg_policies
      where schemaname = 'public' and tablename = t and 'anon' = any(roles)) then
      raise exception '0107: % has a policy for anon', t;
    end if;
  end loop;

  foreach t in array array['bill_payments', 'contractor_advances', 'advance_recoveries'] loop
    if exists (select 1 from pg_policies
      where schemaname = 'public' and tablename = t and cmd in ('UPDATE', 'DELETE', 'ALL')) then
      raise exception '0107: % must be append-only', t;
    end if;
  end loop;

  if exists (select 1 from bills b where b.status = 'paid'
    and not exists (select 1 from bill_payments p where p.bill_id = b.id)) then
    raise exception '0107: a paid bill has no payment after the backfill';
  end if;

  if exists (select 1 from pg_trigger where tgrelid = 'bill_payments'::regclass
    and not tgisinternal and tgenabled = 'D') then
    raise exception '0107: a bill_payments trigger was left disabled';
  end if;
end $$;
