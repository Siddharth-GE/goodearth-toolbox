-- 0170 — Consolidated bills (plan.md, founder 2026-10-29): a contractor's labour bills are gathered on a sheet,
-- THIN-PW-EF-C01, one line per bill, the bills themselves untouched. The sheet is what is approved, put on the cash
-- request and paid; each bill keeps its own lines, villa costs and ledger rows.
--
-- 1. bill_sheets, bill_sheet_bills (which bill was on which sheet, kept after it comes off) and bill_sheet_counters.
--    Read by /bills or /reporter; no write policy — every write is one of the functions below.
-- 2. bills.sheet_id; bill_payments and advance_recoveries name the sheet and the one sheet payment they were part of;
--    cash_request_items gains the 'sheet' kind.
-- 3. A bill on a sheet is approved, sent back and paid only through its sheet, and is not deleted while on one. A
--    contractor's labour bill reaches a cash request only on its sheet.
-- 4. consolidate_bills, approve/send back/undo a sheet, take a bill off; pay, recover and reverse a sheet's money.
-- 5. combine_contractor_bills (0167) goes: consolidating replaces it.
--
-- The sheet links are "on delete set null" only so the test project's red button (0142) can delete its own bills;
-- nothing else deletes a bill on a sheet, and a sheet is never deleted.

-- 1. The tables -------------------------------------------------------------------------------------------------
create table if not exists bill_sheets (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  sheet_no int not null,
  vendor_id uuid not null references vendors (id),
  company_id uuid not null references companies (id),
  work_type text not null check (work_type in ('PW', 'NMR')),
  status text not null default 'recorded' check (status in ('recorded', 'approved', 'undone')),
  approved_by uuid references profiles (id),
  approved_at timestamptz,
  sent_back_note text,
  undone_by uuid references profiles (id),
  undone_at timestamptz,
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bill_sheets_approval_shape check ((status = 'approved') = (approved_by is not null and approved_at is not null)),
  constraint bill_sheets_undone_shape check ((status = 'undone') = (undone_at is not null))
);
create index if not exists bill_sheets_vendor_idx on bill_sheets (vendor_id, company_id, work_type, status);

create table if not exists bill_sheet_bills (
  id uuid primary key default gen_random_uuid(),
  sheet_id uuid not null references bill_sheets (id),
  bill_id uuid references bills (id) on delete set null,
  bill_reference text not null,
  added_by uuid references profiles (id),
  added_at timestamptz not null default now(),
  removed_by uuid references profiles (id),
  removed_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists bill_sheet_bills_sheet_idx on bill_sheet_bills (sheet_id);
create unique index if not exists bill_sheet_bills_one_open on bill_sheet_bills (bill_id) where removed_at is null;

create table if not exists bill_sheet_counters (
  vendor_id uuid not null references vendors (id),
  company_id uuid not null references companies (id),
  last_no int not null,
  primary key (vendor_id, company_id)
);

alter table bills add column if not exists sheet_id uuid references bill_sheets (id) on delete set null;
create index if not exists bills_sheet_idx on bills (sheet_id) where sheet_id is not null;

alter table bill_payments add column if not exists sheet_id uuid references bill_sheets (id) on delete set null;
alter table bill_payments add column if not exists sheet_entry_id uuid;
alter table advance_recoveries add column if not exists sheet_id uuid references bill_sheets (id) on delete set null;
alter table advance_recoveries add column if not exists sheet_entry_id uuid;
create index if not exists bill_payments_sheet_entry_idx on bill_payments (sheet_entry_id) where sheet_entry_id is not null;
create index if not exists advance_recoveries_sheet_entry_idx on advance_recoveries (sheet_entry_id)
  where sheet_entry_id is not null;

alter table cash_request_items add column if not exists sheet_id uuid references bill_sheets (id);
alter table cash_request_items drop constraint if exists cash_request_items_item_kind_check;
alter table cash_request_items add constraint cash_request_items_item_kind_check
  check (item_kind in ('bill', 'advance', 'sheet'));
alter table cash_request_items drop constraint if exists cash_request_items_shape;
alter table cash_request_items add constraint cash_request_items_shape check (
  (item_kind = 'bill' and bill_id is not null and sheet_id is null)
  or (item_kind = 'advance' and bill_id is null and sheet_id is null and vendor_id is not null and project_id is not null)
  or (item_kind = 'sheet' and sheet_id is not null and bill_id is null)
);
alter table cash_request_items drop constraint if exists cash_request_items_one_sheet_per_request;
alter table cash_request_items add constraint cash_request_items_one_sheet_per_request unique (cash_request_id, sheet_id);
create index if not exists cash_request_items_sheet_idx on cash_request_items (sheet_id) where sheet_id is not null;

do $$
declare
  t text;
begin
  foreach t in array array['bill_sheets', 'bill_sheet_bills', 'bill_sheet_counters'] loop
    execute format('alter table %I enable row level security', t);
    execute format('revoke all on %I from anon', t);
    execute format('revoke insert, update, delete, truncate on %I from authenticated', t);
    execute format('drop policy if exists %I on %I', t || ' readable by bills or reporter', t);
    execute format('create policy %I on %I for select to authenticated using '
                   '((select has_app(''/bills'')) or (select has_app(''/reporter'')))', t || ' readable by bills or reporter', t);
  end loop;
  foreach t in array array['bill_sheets', 'bill_sheet_bills'] loop
    execute format('drop trigger if exists set_updated_at on %I', t);
    execute format('create trigger set_updated_at before update on %I for each row execute function set_updated_at()', t);
    execute format('drop trigger if exists %I on %I', 'audit_' || t, t);
    execute format('create trigger %I after insert or update or delete on %I for each row execute function audit_row()',
                   'audit_' || t, t);
  end loop;
end $$;

-- 2. The guards ------------------------------------------------------------------------------------------------
-- 'toolbox.bill_sheet' is raised only inside the sheet functions below, for the length of their transaction.
create or replace function bills_sheet_guard()
returns trigger
language plpgsql
as $$
declare
  v_sheet text;
begin
  if tg_op = 'DELETE' then
    if old.sheet_id is not null then
      select reference into v_sheet from bill_sheets where id = old.sheet_id;
      raise exception '% is on %. Take it off the sheet before deleting it', old.reference, v_sheet;
    end if;
    return old;
  end if;
  if coalesce(current_setting('toolbox.bill_sheet', true), '') = 'on' then
    return new;
  end if;
  if new.sheet_id is distinct from old.sheet_id then
    raise exception 'A bill goes on or off a sheet only by consolidating, taking it off or undoing the sheet';
  end if;
  -- Paid follows the money (0147), which itself goes through the sheet; approval and send-back are the sheet's.
  if old.sheet_id is not null and new.status is distinct from old.status
     and old.status in ('recorded', 'approved') and new.status in ('recorded', 'approved') then
    select reference into v_sheet from bill_sheets where id = old.sheet_id;
    raise exception '% is on % — approve or send back the sheet', old.reference, v_sheet;
  end if;
  return new;
end $$;
revoke all on function bills_sheet_guard() from public, anon, authenticated;

drop trigger if exists bills_sheet_guard on bills;
create trigger bills_sheet_guard before update or delete on bills
  for each row execute function bills_sheet_guard();

-- After the reversal guard (by name), so a reversal's bill is already the original's.
create or replace function bill_money_sheet_guard()
returns trigger
language plpgsql
as $$
declare
  v_bill record;
begin
  select b.reference, b.sheet_id, s.reference as sheet_reference into v_bill
    from bills b left join bill_sheets s on s.id = b.sheet_id where b.id = new.bill_id;
  if v_bill.sheet_id is null then
    if new.sheet_id is not null or new.sheet_entry_id is not null then
      raise exception '% is not on a sheet', v_bill.reference;
    end if;
    return new;
  end if;
  if coalesce(current_setting('toolbox.bill_sheet_money', true), '') <> 'on' then
    raise exception '% is on % — its money goes through the sheet', v_bill.reference, v_bill.sheet_reference;
  end if;
  if new.sheet_id is distinct from v_bill.sheet_id or new.sheet_entry_id is null then
    raise exception 'Money through a sheet names that sheet';
  end if;
  if tg_table_name = 'bill_payments' and new.cash_request_item_id is not null and not exists (
    select 1 from cash_request_items where id = new.cash_request_item_id and sheet_id = v_bill.sheet_id
  ) then
    raise exception 'That cash request line is not for %', v_bill.sheet_reference;
  end if;
  return new;
end $$;
revoke all on function bill_money_sheet_guard() from public, anon, authenticated;

drop trigger if exists bill_payments_sheet_guard on bill_payments;
create trigger bill_payments_sheet_guard before insert on bill_payments
  for each row execute function bill_money_sheet_guard();
drop trigger if exists advance_recoveries_sheet_guard on advance_recoveries;
create trigger advance_recoveries_sheet_guard before insert on advance_recoveries
  for each row execute function bill_money_sheet_guard();

create or replace function cash_request_items_sheet_guard()
returns trigger
language plpgsql
as $$
declare
  v_status text;
  v_reference text;
begin
  if tg_op = 'UPDATE' then
    if new.sheet_id is distinct from old.sheet_id then
      raise exception 'What a cash request line is for never changes — remove it and add another';
    end if;
    return new;
  end if;
  if new.item_kind = 'sheet' then
    select status, reference into v_status, v_reference from bill_sheets where id = new.sheet_id;
    if v_status is distinct from 'approved' then
      raise exception 'Only an approved sheet goes on a cash request (% is %)', v_reference,
        case v_status when 'recorded' then 'waiting for approval' else coalesce(v_status, 'gone') end;
    end if;
  elsif new.item_kind = 'bill' and exists (
    select 1 from bills b join vendors v on v.id = b.vendor_id
     where b.id = new.bill_id and b.kind = 'nmr' and v.is_contractor
  ) then
    raise exception 'A contractor''s labour bill goes on a cash request on its sheet — consolidate it first';
  end if;
  return new;
end $$;
revoke all on function cash_request_items_sheet_guard() from public, anon, authenticated;

drop trigger if exists cash_request_items_sheet_guard on cash_request_items;
create trigger cash_request_items_sheet_guard before insert or update on cash_request_items
  for each row execute function cash_request_items_sheet_guard();

-- 3. Consolidating ----------------------------------------------------------------------------------------------
-- Any /bills holder consolidates recorded bills; an approved one with no money is sent back on the way, so only a bill
-- approver or an admin takes it in. Each bill joins its contractor's sheet still waiting for approval in that company
-- and kind, or a new one. Nothing is refused whole: what cannot go on is left out with the reason, and the answer is
-- {"sheets": [{id, reference, added}], "skipped": [{id, reference, reason}]}.
create or replace function consolidate_bills(p_bill_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[];
  v_approver boolean;
  v_sheet uuid;
  v_ref text;
  v_no int;
  v_reason text;
  v_sheets jsonb := '{}'::jsonb;
  v_skipped jsonb := '[]'::jsonb;
  r record;
begin
  if not has_app('/bills') then
    raise exception 'Only the Bills tool can consolidate bills';
  end if;
  v_ids := array(select distinct unnest(p_bill_ids));
  if cardinality(v_ids) = 0 then
    raise exception 'Tick the bills to consolidate';
  end if;
  v_approver := is_admin() or can_approve_bills(auth.uid());
  perform set_config('toolbox.bill_sheet', 'on', true);

  for r in
    select b.id, b.reference, b.status, b.kind, b.work_type, b.vendor_id, b.sheet_id, b.invoice_date,
           v.is_contractor, v.bill_code, p.company_id, c.code as company_code,
           (select s.reference from bill_sheets s where s.id = b.sheet_id) as sheet_reference
      from bills b
      left join vendors v on v.id = b.vendor_id
      join projects p on p.id = b.project_id
      left join companies c on c.id = p.company_id
     where b.id = any(v_ids)
     order by b.invoice_date, b.created_at, b.id
       for update of b
  loop
    v_reason := case
      when r.sheet_id is not null then 'already on ' || r.sheet_reference
      when r.kind <> 'nmr' or not coalesce(r.is_contractor, false) or r.work_type is null
        then 'not a contractor''s labour bill'
      when r.status not in ('recorded', 'approved') then 'already ' || r.status
      when exists (select 1 from bill_payments where bill_id = r.id)
        or exists (select 1 from advance_recoveries where bill_id = r.id) then 'has money on record'
      when exists (select 1 from cash_request_items where bill_id = r.id) then 'on a cash request — take it off first'
      when r.status = 'approved' and not v_approver then 'approved — only a bill approver can consolidate it'
      when r.company_id is null or r.company_code is null or r.bill_code is null
        then 'its contractor or company has no bill code'
    end;
    if v_reason is not null then
      v_skipped := v_skipped || jsonb_build_object('id', r.id, 'reference', r.reference, 'reason', v_reason);
      continue;
    end if;

    select id, reference into v_sheet, v_ref from bill_sheets
     where vendor_id = r.vendor_id and company_id = r.company_id and work_type = r.work_type and status = 'recorded'
     order by created_at desc, id
     limit 1
       for update;
    if v_sheet is null then
      insert into bill_sheet_counters (vendor_id, company_id, last_no) values (r.vendor_id, r.company_id, 1)
      on conflict (vendor_id, company_id) do update set last_no = bill_sheet_counters.last_no + 1
      returning last_no into v_no;
      v_ref := r.bill_code || '-' || r.work_type || '-' || r.company_code || '-C' || lpad(v_no::text, 2, '0');
      insert into bill_sheets (reference, sheet_no, vendor_id, company_id, work_type, created_by, updated_by)
      values (v_ref, v_no, r.vendor_id, r.company_id, r.work_type, auth.uid(), auth.uid())
      returning id into v_sheet;
    end if;

    if r.status = 'approved' then
      update bills
         set status = 'recorded', approved_by = null, approved_at = null,
             rejection_note = 'Consolidated on ' || v_ref || ' — approve the sheet', updated_by = auth.uid()
       where id = r.id;
    end if;
    update bills set sheet_id = v_sheet, updated_by = auth.uid() where id = r.id;
    insert into bill_sheet_bills (sheet_id, bill_id, bill_reference, added_by) values (v_sheet, r.id, r.reference, auth.uid());
    v_sheets := jsonb_set(v_sheets, array[v_sheet::text], jsonb_build_object(
      'id', v_sheet, 'reference', v_ref,
      'added', coalesce((v_sheets -> v_sheet::text ->> 'added')::int, 0) + 1));
    v_sheet := null;
  end loop;
  perform set_config('toolbox.bill_sheet', '', true);

  for r in select u.id from unnest(v_ids) as u (id) where not exists (select 1 from bills b where b.id = u.id) loop
    v_skipped := v_skipped || jsonb_build_object('id', r.id, 'reference', null, 'reason', 'no longer exists');
  end loop;
  return jsonb_build_object(
    'sheets', coalesce((select jsonb_agg(value order by value ->> 'reference') from jsonb_each(v_sheets)), '[]'::jsonb),
    'skipped', v_skipped);
end $$;
revoke all on function consolidate_bills(uuid[]) from public, anon;
grant execute on function consolidate_bills(uuid[]) to authenticated;

-- 4. Approving, sending back, taking a bill off, undoing -----------------------------------------------------------
-- The approver's limit applies to the sheet's total: one approval is one decision.
create or replace function approve_bill_sheet(p_sheet_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sheet record;
  v_total numeric;
  v_count int;
  v_cap numeric;
begin
  if not has_app('/bills') then
    raise exception 'Only the Bills tool can approve a sheet';
  end if;
  if not (is_admin() or can_approve_bills(auth.uid())) then
    raise exception 'Only a named bill approver or an admin can approve a sheet';
  end if;
  select * into v_sheet from bill_sheets where id = p_sheet_id for update;
  if not found then
    raise exception 'That sheet no longer exists';
  end if;
  if v_sheet.status <> 'recorded' then
    raise exception '% is % — only a sheet waiting for approval is approved', v_sheet.reference, v_sheet.status;
  end if;
  perform 1 from bills where sheet_id = p_sheet_id order by id for update;
  select count(*), coalesce(sum(total_amount), 0) into strict v_count, v_total from bills where sheet_id = p_sheet_id;
  if v_count = 0 then
    raise exception '% has no bills — undo it instead', v_sheet.reference;
  end if;
  if exists (select 1 from bills where sheet_id = p_sheet_id and status <> 'recorded') then
    raise exception 'A bill on % is not waiting for approval', v_sheet.reference;
  end if;
  if not is_admin() then
    v_cap := bill_approval_cap(auth.uid());
    if v_cap is not null and v_total > v_cap then
      raise exception '% totals more than your approval limit of %', v_sheet.reference, v_cap;
    end if;
  end if;

  perform set_config('toolbox.bill_sheet', 'on', true);
  update bills
     set status = 'approved', approved_by = auth.uid(), approved_at = now(), rejection_note = null, updated_by = auth.uid()
   where sheet_id = p_sheet_id;
  perform set_config('toolbox.bill_sheet', '', true);
  update bill_sheets
     set status = 'approved', approved_by = auth.uid(), approved_at = now(), sent_back_note = null, updated_by = auth.uid()
   where id = p_sheet_id;
end $$;
revoke all on function approve_bill_sheet(uuid) from public, anon;
grant execute on function approve_bill_sheet(uuid) to authenticated;

-- As a bill's send-back (0147): allowed while its money nets to nothing, so a sheet paid in error is put right.
create or replace function send_back_bill_sheet(p_sheet_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sheet record;
  v_week date;
begin
  if not has_app('/bills') then
    raise exception 'Only the Bills tool can send a sheet back';
  end if;
  if not (is_admin() or can_approve_bills(auth.uid())) then
    raise exception 'Only a named bill approver or an admin can send a sheet back';
  end if;
  if length(trim(coalesce(p_note, ''))) = 0 then
    raise exception 'Say what needs changing — a send-back needs a note';
  end if;
  select * into v_sheet from bill_sheets where id = p_sheet_id for update;
  if not found then
    raise exception 'That sheet no longer exists';
  end if;
  if v_sheet.status <> 'approved' then
    raise exception 'Only an approved sheet is sent back (% is %)', v_sheet.reference, v_sheet.status;
  end if;
  select r.week_of into v_week from cash_request_items i join cash_requests r on r.id = i.cash_request_id
   where i.sheet_id = p_sheet_id and r.status in ('draft', 'submitted') limit 1;
  if v_week is not null then
    raise exception '% is on the cash request for the week of % — take it off first', v_sheet.reference,
      to_char(v_week, 'DD Mon');
  end if;
  perform 1 from bills where sheet_id = p_sheet_id order by id for update;
  if exists (
    select 1 from bills b
     where b.sheet_id = p_sheet_id
       and abs(coalesce((select sum(amount) from bill_payments where bill_id = b.id), 0)
             + coalesce((select sum(amount) from advance_recoveries where bill_id = b.id), 0)) > 0.005
  ) then
    raise exception 'Money has gone out on % — reverse it before sending the sheet back', v_sheet.reference;
  end if;

  perform set_config('toolbox.bill_sheet', 'on', true);
  update bills
     set status = 'recorded', approved_by = null, approved_at = null, payment_ref = null, paid_by = null, paid_at = null,
         rejection_note = v_sheet.reference || ' sent back: ' || trim(p_note), updated_by = auth.uid()
   where sheet_id = p_sheet_id and status = 'approved';
  perform set_config('toolbox.bill_sheet', '', true);
  update bill_sheets
     set status = 'recorded', approved_by = null, approved_at = null, sent_back_note = trim(p_note), updated_by = auth.uid()
   where id = p_sheet_id;
end $$;
revoke all on function send_back_bill_sheet(uuid, text) from public, anon;
grant execute on function send_back_bill_sheet(uuid, text) to authenticated;

-- While its sheet waits for approval. A sheet left with no bills is undone.
create or replace function remove_bill_from_sheet(p_bill_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bill record;
  v_sheet record;
begin
  if not has_app('/bills') then
    raise exception 'Only the Bills tool can take a bill off a sheet';
  end if;
  select id, reference, sheet_id into v_bill from bills where id = p_bill_id for update;
  if not found then
    raise exception 'That bill no longer exists';
  end if;
  if v_bill.sheet_id is null then
    raise exception '% is not on a sheet', v_bill.reference;
  end if;
  select * into v_sheet from bill_sheets where id = v_bill.sheet_id for update;
  if v_sheet.status <> 'recorded' then
    raise exception '% is approved — send it back before taking a bill off', v_sheet.reference;
  end if;
  if exists (select 1 from bill_payments where bill_id = p_bill_id)
     or exists (select 1 from advance_recoveries where bill_id = p_bill_id) then
    raise exception 'Money was paid and reversed on % through %, so it stays on the sheet', v_bill.reference,
      v_sheet.reference;
  end if;

  perform set_config('toolbox.bill_sheet', 'on', true);
  update bills
     set sheet_id = null, updated_by = auth.uid(),
         rejection_note = case when rejection_note like 'Consolidated on %' then null else rejection_note end
   where id = p_bill_id;
  perform set_config('toolbox.bill_sheet', '', true);
  update bill_sheet_bills set removed_by = auth.uid(), removed_at = now()
   where bill_id = p_bill_id and sheet_id = v_sheet.id and removed_at is null;
  if not exists (select 1 from bills where sheet_id = v_sheet.id) then
    update bill_sheets set status = 'undone', undone_by = auth.uid(), undone_at = now(), updated_by = auth.uid()
     where id = v_sheet.id;
  end if;
end $$;
revoke all on function remove_bill_from_sheet(uuid) from public, anon;
grant execute on function remove_bill_from_sheet(uuid) to authenticated;

-- Its bills stand alone again, waiting for approval; the sheet stays on record, undone, with the bills it had.
create or replace function undo_bill_sheet(p_sheet_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sheet record;
  v_week date;
begin
  if not has_app('/bills') then
    raise exception 'Only the Bills tool can undo a sheet';
  end if;
  select * into v_sheet from bill_sheets where id = p_sheet_id for update;
  if not found then
    raise exception 'That sheet no longer exists';
  end if;
  if v_sheet.status = 'undone' then
    raise exception '% was undone already', v_sheet.reference;
  end if;
  if v_sheet.status = 'approved' and not (is_admin() or can_approve_bills(auth.uid())) then
    raise exception '% is approved — only a bill approver or an admin can undo it', v_sheet.reference;
  end if;
  select r.week_of into v_week from cash_request_items i join cash_requests r on r.id = i.cash_request_id
   where i.sheet_id = p_sheet_id order by r.week_of desc limit 1;
  if v_week is not null then
    raise exception '% is on the cash request for the week of %, so it stays', v_sheet.reference,
      to_char(v_week, 'DD Mon');
  end if;
  perform 1 from bills where sheet_id = p_sheet_id order by id for update;
  if exists (select 1 from bill_payments where sheet_id = p_sheet_id)
     or exists (select 1 from advance_recoveries where sheet_id = p_sheet_id) then
    raise exception 'Money was paid on % (even if reversed), so it stays', v_sheet.reference;
  end if;

  perform set_config('toolbox.bill_sheet', 'on', true);
  update bills
     set status = 'recorded', approved_by = null, approved_at = null,
         rejection_note = v_sheet.reference || ' was undone — consolidate this bill again',
         updated_by = auth.uid()
   where sheet_id = p_sheet_id and status = 'approved';
  update bills
     set sheet_id = null, updated_by = auth.uid(),
         rejection_note = case when rejection_note like 'Consolidated on %' then null else rejection_note end
   where sheet_id = p_sheet_id;
  perform set_config('toolbox.bill_sheet', '', true);
  update bill_sheet_bills set removed_by = auth.uid(), removed_at = now()
   where sheet_id = p_sheet_id and removed_at is null;
  update bill_sheets
     set status = 'undone', approved_by = null, approved_at = null, undone_by = auth.uid(), undone_at = now(),
         updated_by = auth.uid()
   where id = p_sheet_id;
end $$;
revoke all on function undo_bill_sheet(uuid) from public, anon;
grant execute on function undo_bill_sheet(uuid) to authenticated;

-- 5. A sheet's money ---------------------------------------------------------------------------------------------
-- Invokers: each row is the person's own insert, so RLS, the settlement guard (approved, never past a bill's total, an
-- advance only to its own contractor) and the reversal guard (approvers only, once) all hold as they do for a bill.
-- One payment is spread over the sheet's bills, oldest first; every row carries the sheet and one entry id.
create or replace function pay_bill_sheet(
  p_sheet_id uuid,
  p_amount numeric,
  p_paid_on date,
  p_reference text,
  p_note text,
  p_cash_request_item_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_sheet record;
  v_entry uuid := gen_random_uuid();
  v_left numeric;
  v_part numeric;
  r record;
begin
  if not has_app('/bills') then
    raise exception 'Only the Bills tool can pay a sheet';
  end if;
  select reference, status into v_sheet from bill_sheets where id = p_sheet_id;
  if not found then
    raise exception 'That sheet no longer exists';
  end if;
  if v_sheet.status <> 'approved' then
    raise exception 'Money goes out only against an approved sheet (% is %)', v_sheet.reference, v_sheet.status;
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'The amount must be more than zero';
  end if;
  if length(trim(coalesce(p_reference, ''))) = 0 then
    raise exception 'Type the UTR, cheque number or UPI reference';
  end if;
  if p_paid_on is null then
    raise exception 'Pick the day it was paid';
  end if;

  v_left := round(p_amount, 2);
  perform set_config('toolbox.bill_sheet_money', 'on', true);
  for r in
    select b.id, b.total_amount
         - coalesce((select sum(amount) from bill_payments where bill_id = b.id), 0)
         - coalesce((select sum(amount) from advance_recoveries where bill_id = b.id), 0) as pending
      from bills b where b.sheet_id = p_sheet_id
     order by b.invoice_date, b.created_at, b.id
  loop
    continue when r.pending <= 0.005;
    v_part := least(v_left, round(r.pending, 2));
    insert into bill_payments (bill_id, amount, paid_on, payment_ref, note, cash_request_item_id, sheet_id, sheet_entry_id,
                               created_by, updated_by)
    values (r.id, v_part, p_paid_on, trim(p_reference), nullif(trim(p_note), ''), p_cash_request_item_id, p_sheet_id,
            v_entry, auth.uid(), auth.uid());
    v_left := v_left - v_part;
    exit when v_left <= 0.005;
  end loop;
  perform set_config('toolbox.bill_sheet_money', '', true);
  if v_left > 0.005 then
    raise exception 'That is more than % has pending (₹% left)', v_sheet.reference, round(p_amount - v_left, 2);
  end if;
  return v_entry;
end $$;
revoke all on function pay_bill_sheet(uuid, numeric, date, text, text, uuid) from public, anon;
grant execute on function pay_bill_sheet(uuid, numeric, date, text, text, uuid) to authenticated;

create or replace function recover_on_bill_sheet(
  p_sheet_id uuid,
  p_advance_id uuid,
  p_amount numeric,
  p_recovered_on date,
  p_note text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_sheet record;
  v_entry uuid := gen_random_uuid();
  v_left numeric;
  v_part numeric;
  r record;
begin
  if not has_app('/bills') then
    raise exception 'Only the Bills tool can recover an advance on a sheet';
  end if;
  select reference, status into v_sheet from bill_sheets where id = p_sheet_id;
  if not found then
    raise exception 'That sheet no longer exists';
  end if;
  if v_sheet.status <> 'approved' then
    raise exception 'An advance is set only against an approved sheet (% is %)', v_sheet.reference, v_sheet.status;
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'The amount must be more than zero';
  end if;
  if p_recovered_on is null then
    raise exception 'Pick the day';
  end if;

  v_left := round(p_amount, 2);
  perform set_config('toolbox.bill_sheet_money', 'on', true);
  for r in
    select b.id, b.total_amount
         - coalesce((select sum(amount) from bill_payments where bill_id = b.id), 0)
         - coalesce((select sum(amount) from advance_recoveries where bill_id = b.id), 0) as pending
      from bills b where b.sheet_id = p_sheet_id
     order by b.invoice_date, b.created_at, b.id
  loop
    continue when r.pending <= 0.005;
    v_part := least(v_left, round(r.pending, 2));
    insert into advance_recoveries (advance_id, bill_id, amount, recovered_on, note, sheet_id, sheet_entry_id,
                                    created_by, updated_by)
    values (p_advance_id, r.id, v_part, p_recovered_on, nullif(trim(p_note), ''), p_sheet_id, v_entry,
            auth.uid(), auth.uid());
    v_left := v_left - v_part;
    exit when v_left <= 0.005;
  end loop;
  perform set_config('toolbox.bill_sheet_money', '', true);
  if v_left > 0.005 then
    raise exception 'That is more than % has pending (₹% left)', v_sheet.reference, round(p_amount - v_left, 2);
  end if;
  return v_entry;
end $$;
revoke all on function recover_on_bill_sheet(uuid, uuid, numeric, date, text) from public, anon;
grant execute on function recover_on_bill_sheet(uuid, uuid, numeric, date, text) to authenticated;

-- A sheet's payment or recovery is reversed whole; money_reversal_guard copies each row and checks who reverses.
create or replace function reverse_bill_sheet_money(p_kind text, p_entry_id uuid, p_reason text)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_entry uuid := gen_random_uuid();
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_n int;
begin
  if not has_app('/bills') then
    raise exception 'Only the Bills tool can reverse a sheet''s money';
  end if;
  perform set_config('toolbox.bill_sheet_money', 'on', true);
  if p_kind = 'payment' then
    insert into bill_payments (bill_id, amount, paid_on, payment_ref, reverses_id, reverse_reason, sheet_id, sheet_entry_id,
                               created_by, updated_by)
    select bill_id, -amount, v_today, payment_ref, id, p_reason, sheet_id, v_entry, auth.uid(), auth.uid()
      from bill_payments where sheet_entry_id = p_entry_id and reverses_id is null
     order by id;
  elsif p_kind = 'recovery' then
    insert into advance_recoveries (advance_id, bill_id, amount, recovered_on, reverses_id, reverse_reason, sheet_id,
                                    sheet_entry_id, created_by, updated_by)
    select advance_id, bill_id, -amount, v_today, id, p_reason, sheet_id, v_entry, auth.uid(), auth.uid()
      from advance_recoveries where sheet_entry_id = p_entry_id and reverses_id is null
     order by id;
  else
    raise exception 'Only a sheet''s payment or recovery is reversed';
  end if;
  get diagnostics v_n = row_count;
  perform set_config('toolbox.bill_sheet_money', '', true);
  if v_n = 0 then
    raise exception 'That entry is not on record';
  end if;
  return v_entry;
end $$;
revoke all on function reverse_bill_sheet_money(text, uuid, text) from public, anon;
grant execute on function reverse_bill_sheet_money(text, uuid, text) to authenticated;

-- 6. Combining goes --------------------------------------------------------------------------------------------------
drop function if exists combine_contractor_bills(uuid[]);

-- Checks -------------------------------------------------------------------------------------------------------------
do $$
declare
  f text;
  t text;
begin
  foreach f in array array['consolidate_bills(uuid[])', 'approve_bill_sheet(uuid)', 'send_back_bill_sheet(uuid,text)',
                           'remove_bill_from_sheet(uuid)', 'undo_bill_sheet(uuid)'] loop
    if not (select prosecdef from pg_proc where oid = f::regprocedure) then
      raise exception '0170: % must be a definer, so the sheet tables need no write policy', f;
    end if;
  end loop;
  foreach f in array array['pay_bill_sheet(uuid,numeric,date,text,text,uuid)',
                           'recover_on_bill_sheet(uuid,uuid,numeric,date,text)',
                           'reverse_bill_sheet_money(text,uuid,text)'] loop
    if (select prosecdef from pg_proc where oid = f::regprocedure) then
      raise exception '0170: % must run as the caller, so the money guards hold as the person', f;
    end if;
  end loop;
  foreach f in array array['consolidate_bills(uuid[])', 'approve_bill_sheet(uuid)', 'send_back_bill_sheet(uuid,text)',
                           'remove_bill_from_sheet(uuid)', 'undo_bill_sheet(uuid)',
                           'pay_bill_sheet(uuid,numeric,date,text,text,uuid)',
                           'recover_on_bill_sheet(uuid,uuid,numeric,date,text)', 'reverse_bill_sheet_money(text,uuid,text)',
                           'bills_sheet_guard()', 'bill_money_sheet_guard()', 'cash_request_items_sheet_guard()'] loop
    if has_function_privilege('anon', f, 'execute') then
      raise exception '0170: anon can execute %', f;
    end if;
  end loop;
  foreach f in array array['bills_sheet_guard()', 'bill_money_sheet_guard()', 'cash_request_items_sheet_guard()'] loop
    if has_function_privilege('authenticated', f, 'execute') then
      raise exception '0170: % is a trigger and no one calls it', f;
    end if;
  end loop;
  foreach t in array array['bill_sheets', 'bill_sheet_bills', 'bill_sheet_counters'] loop
    if not (select relrowsecurity from pg_class where oid = t::regclass) then
      raise exception '0170: % has row-level security off', t;
    end if;
    if has_table_privilege('authenticated', t, 'insert') or has_table_privilege('authenticated', t, 'update')
       or has_table_privilege('authenticated', t, 'delete') then
      raise exception '0170: % is writable outside the sheet functions', t;
    end if;
    if (select count(*) from pg_policies where tablename = t) <> 1 then
      raise exception '0170: % should have exactly its one read policy', t;
    end if;
  end loop;
  if exists (select 1 from pg_proc where proname = 'combine_contractor_bills') then
    raise exception '0170: combine_contractor_bills is still there';
  end if;
  foreach t in array array['bills.bills_sheet_guard', 'bill_payments.bill_payments_sheet_guard',
                           'advance_recoveries.advance_recoveries_sheet_guard',
                           'cash_request_items.cash_request_items_sheet_guard'] loop
    if not exists (select 1 from pg_trigger where tgname = split_part(t, '.', 2)
                    and tgrelid = split_part(t, '.', 1)::regclass) then
      raise exception '0170: trigger % is missing', t;
    end if;
  end loop;
end $$;
