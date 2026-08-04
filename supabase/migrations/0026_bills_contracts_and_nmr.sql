-- Phase 8, second pass — founder corrections after seeing the preview:
--
--   1. Labour contracts belong to the BILLS tool, not Masters: anyone
--      with /bills records one, and it needs an APPROVAL (a named bill
--      approver or an admin) before bills can be recorded against it.
--   2. A third kind of labour bill: NMR — daily wages. No PO, no
--      contract behind it; the recorder picks the project and plot/unit
--      directly, and the vendor is OPTIONAL (a labour contractor when
--      one supplied the workers, nothing when Goodearth pays the muster
--      roll directly) — founder decisions 2026-08-04.
--
-- Re-runnable throughout (the 0016 convention).

-- ---------------------------------------------------------------------
-- 1. labour_contracts — approval step + ownership moves to /bills
-- ---------------------------------------------------------------------

alter table labour_contracts add column if not exists status text not null default 'pending_approval';
alter table labour_contracts add column if not exists approved_by uuid references profiles (id);
alter table labour_contracts add column if not exists approved_at timestamptz;

alter table labour_contracts drop constraint if exists labour_contracts_status_known;
alter table labour_contracts add constraint labour_contracts_status_known
  check (status in ('pending_approval', 'approved'));

-- The status machine, the bills_guard shape: every transition
-- whitelisted, the approver rule checked HERE so it holds against a
-- raw PostgREST PATCH, not just against the button.
create or replace function labour_contracts_guard()
returns trigger
language plpgsql
as $$
begin
  if new.status = old.status then
    -- Everything is editable while pending. Once approved, the TERMS
    -- are permanent — bills compare against the approved value, so
    -- changing it would rewrite what the approval meant. Deactivate
    -- and create a new contract instead. (is_active and the actor
    -- stamps stay editable — deactivating an approved contract is the
    -- founder's off-switch for new billing.)
    if old.status = 'approved'
       and (new.vendor_id, new.project_id, new.plot_id, new.unit_id,
            new.description, new.contract_value)
           is distinct from
           (old.vendor_id, old.project_id, old.plot_id, old.unit_id,
            old.description, old.contract_value) then
      raise exception 'An approved labour contract''s terms are permanent — deactivate it and record a new one';
    end if;
    return new;
  end if;

  if old.status = 'pending_approval' and new.status = 'approved' then
    if not (is_admin() or exists (
      select 1 from bill_approvers a where a.user_id = auth.uid()
    )) then
      raise exception 'Only a named bill approver or an admin can approve a labour contract';
    end if;
    if new.approved_by is null or new.approved_at is null then
      raise exception 'Approving must record who approved and when';
    end if;
    return new;
  end if;

  -- No un-approve: a wrongly approved contract is deactivated.
  raise exception 'Invalid labour contract status change: % -> %', old.status, new.status;
end $$;

drop trigger if exists labour_contracts_guard on labour_contracts;
create trigger labour_contracts_guard
  before update on labour_contracts
  for each row execute function labour_contracts_guard();

-- Writes move from /masters to /bills (reads stay open — a contract's
-- existence and value are counterparty facts, the 0025 §1 reasoning).
drop policy if exists "labour_contracts insertable by masters app" on labour_contracts;
drop policy if exists "labour_contracts updatable by masters app" on labour_contracts;
drop policy if exists "labour_contracts insertable by bills app" on labour_contracts;
create policy "labour_contracts insertable by bills app"
  on labour_contracts for insert to authenticated with check (has_app('/bills'));
drop policy if exists "labour_contracts updatable by bills app" on labour_contracts;
create policy "labour_contracts updatable by bills app"
  on labour_contracts for update to authenticated
  using (has_app('/bills')) with check (has_app('/bills'));
-- Still no delete policy: deactivate, never erase.

-- ---------------------------------------------------------------------
-- 2. bills — the explicit kind, and the NMR shape
-- ---------------------------------------------------------------------

alter table bills add column if not exists kind text;
update bills set kind = case
  when po_id is not null then 'po'
  else 'contract'
end where kind is null;
alter table bills alter column kind set not null;

-- NMR bills may have no vendor (paid directly).
alter table bills alter column vendor_id drop not null;

-- Replace the 0025 two-way XOR with the three-way kind consistency
-- rule. The old CHECK was unnamed, so it's found by its definition;
-- the loop also clears this migration's own constraints on a re-run.
do $$
declare
  c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'bills'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%labour_contract_id%'
  loop
    execute format('alter table bills drop constraint %I', c.conname);
  end loop;
end $$;

alter table bills add constraint bills_anchor_matches_kind check (
  (kind = 'po' and po_id is not null and labour_contract_id is null)
  or (kind = 'contract' and labour_contract_id is not null and po_id is null)
  or (kind = 'nmr' and po_id is null and labour_contract_id is null)
);
-- Only an NMR bill may go vendor-less.
alter table bills drop constraint if exists bills_vendor_required;
alter table bills add constraint bills_vendor_required
  check (kind = 'nmr' or vendor_id is not null);

-- The permanence tuple in bills_guard gains kind (identity, like the
-- anchor it describes). Everything else is unchanged from 0025 §5.
create or replace function bills_guard()
returns trigger
language plpgsql
as $$
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

  if old.status = 'recorded' and new.status = 'approved' then
    if not (is_admin() or exists (
      select 1 from bill_approvers a where a.user_id = auth.uid()
    )) then
      raise exception 'Only a named bill approver or an admin can approve a bill';
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
    if not (is_admin() or exists (
      select 1 from bill_approvers a where a.user_id = auth.uid()
    )) then
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
    if new.payment_ref is null or length(trim(new.payment_ref)) = 0 then
      raise exception 'Record the payment reference before marking this bill paid';
    end if;
    if new.paid_by is null or new.paid_at is null then
      raise exception 'Marking paid must record who paid and when';
    end if;
    return new;
  end if;

  raise exception 'Invalid bill status change: % -> %', old.status, new.status;
end $$;

-- (Trigger already attached in 0025; create or replace above is enough.)

-- ---------------------------------------------------------------------
-- 3. create_bill() — contract branch now requires approval
-- ---------------------------------------------------------------------
-- Same signature as 0025 §6; two changes: the contract must be
-- APPROVED (not just active), and the insert stamps kind.

create or replace function create_bill(
  p_po_id uuid,
  p_labour_contract_id uuid,
  p_invoice_no text,
  p_invoice_date date,
  p_taxable_amount numeric,
  p_gst_amount numeric,
  p_total_amount numeric,
  p_note text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_project_id uuid;
  v_plot_id uuid;
  v_unit_id uuid;
  v_scope text;
  v_vendor_id uuid;
  v_po_status text;
  v_contract_active boolean;
  v_contract_status text;
  v_project_code text;
  v_kind text;
  v_no int;
  v_id uuid;
begin
  if (p_po_id is null) = (p_labour_contract_id is null) then
    raise exception 'A bill is recorded against one purchase order or one labour contract — exactly one';
  end if;

  if p_invoice_no is null or length(trim(p_invoice_no)) = 0 then
    raise exception 'Type the invoice number as printed on the vendor''s bill';
  end if;
  if p_invoice_date is null then
    raise exception 'Pick the invoice date from the vendor''s bill';
  end if;
  if p_taxable_amount is null or p_taxable_amount < 0 then
    raise exception 'The taxable amount can''t be negative';
  end if;
  if p_gst_amount is null or p_gst_amount < 0 then
    raise exception 'The GST amount can''t be negative';
  end if;
  if p_total_amount is null or p_total_amount <= 0 then
    raise exception 'The invoice total must be more than zero';
  end if;

  if p_po_id is not null then
    v_kind := 'po';
    select f.project_id, f.plot_id, f.unit_id, f.scope_code, f.vendor_id, f.status
    into v_project_id, v_plot_id, v_unit_id, v_scope, v_vendor_id, v_po_status
    from po_facts f where f.id = p_po_id;
    if not found then
      raise exception 'That purchase order no longer exists';
    end if;
    if v_po_status not in ('issued', 'completed') then
      raise exception 'Bills can only be recorded against an issued purchase order (this one is %)', v_po_status;
    end if;
  else
    v_kind := 'contract';
    select c.project_id, c.plot_id, c.unit_id, c.vendor_id, c.is_active, c.status
    into v_project_id, v_plot_id, v_unit_id, v_vendor_id, v_contract_active, v_contract_status
    from labour_contracts c where c.id = p_labour_contract_id;
    if not found then
      raise exception 'That labour contract no longer exists';
    end if;
    if v_contract_status is distinct from 'approved' then
      raise exception 'This labour contract hasn''t been approved yet';
    end if;
    if not v_contract_active then
      raise exception 'This labour contract is marked inactive';
    end if;
    if v_unit_id is not null then
      select code into v_scope from units
      where id = v_unit_id and project_id = v_project_id;
      if not found then
        raise exception 'That unit does not belong to this contract''s project';
      end if;
      if v_scope is null then
        raise exception 'This unit has no short code yet — set one in Masters before recording bills for it';
      end if;
    elsif v_plot_id is not null then
      select code into v_scope from plots
      where id = v_plot_id and project_id = v_project_id;
      if not found then
        raise exception 'That plot does not belong to this contract''s project';
      end if;
      if v_scope is null then
        raise exception 'This plot has no short code yet — set one in Masters before recording bills for it';
      end if;
    else
      v_scope := 'GEN';
    end if;
  end if;

  select code into v_project_code from projects where id = v_project_id;
  if v_project_code is null then
    raise exception 'This project has no short code yet — set one in Masters before recording bills';
  end if;

  insert into bill_counters (project_id, scope, last_no)
  values (v_project_id, v_scope, 1)
  on conflict (project_id, scope) do update set last_no = bill_counters.last_no + 1
  returning last_no into v_no;

  insert into bills (
    project_id, plot_id, unit_id, scope_code, vendor_id,
    po_id, labour_contract_id, kind, bill_no, reference,
    invoice_no, invoice_date, taxable_amount, gst_amount, total_amount,
    note, created_by, updated_by
  )
  values (
    v_project_id, v_plot_id, v_unit_id, v_scope, v_vendor_id,
    p_po_id, p_labour_contract_id, v_kind, v_no,
    'BILL/' || v_project_code || '/' || v_scope || '/'
      || lpad(v_no::text, greatest(3, length(v_no::text)), '0'),
    trim(p_invoice_no), p_invoice_date,
    p_taxable_amount, p_gst_amount, p_total_amount,
    nullif(trim(p_note), ''), auth.uid(), auth.uid()
  )
  returning id into v_id;

  return v_id;
end $$;

revoke execute on function create_bill(uuid, uuid, text, date, numeric, numeric, numeric, text) from public;
grant execute on function create_bill(uuid, uuid, text, date, numeric, numeric, numeric, text) to authenticated;

-- ---------------------------------------------------------------------
-- 4. create_nmr_bill() — daily wages, no anchor
-- ---------------------------------------------------------------------
-- The recorder picks the project and plot/unit (the scope enters the
-- number, resolved the create_purchase_order way); the vendor is
-- optional. No over-billing comparison exists — there is nothing to
-- compare against, by design.

create or replace function create_nmr_bill(
  p_vendor_id uuid,
  p_project_id uuid,
  p_plot_id uuid,
  p_unit_id uuid,
  p_invoice_no text,
  p_invoice_date date,
  p_taxable_amount numeric,
  p_gst_amount numeric,
  p_total_amount numeric,
  p_note text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_scope text;
  v_project_code text;
  v_no int;
  v_id uuid;
begin
  if p_project_id is null then
    raise exception 'Pick the project this muster roll belongs to';
  end if;
  if p_plot_id is not null and p_unit_id is not null then
    raise exception 'An NMR bill is for one plot or one unit, not both';
  end if;
  if p_invoice_no is null or length(trim(p_invoice_no)) = 0 then
    raise exception 'Type the muster roll or bill reference';
  end if;
  if p_invoice_date is null then
    raise exception 'Pick the bill date';
  end if;
  if p_taxable_amount is null or p_taxable_amount < 0 then
    raise exception 'The taxable amount can''t be negative';
  end if;
  if p_gst_amount is null or p_gst_amount < 0 then
    raise exception 'The GST amount can''t be negative';
  end if;
  if p_total_amount is null or p_total_amount <= 0 then
    raise exception 'The bill total must be more than zero';
  end if;

  select code into v_project_code from projects where id = p_project_id;
  if v_project_code is null then
    raise exception 'This project has no short code yet — set one in Masters before recording bills';
  end if;

  if p_unit_id is not null then
    select code into v_scope from units
    where id = p_unit_id and project_id = p_project_id;
    if not found then
      raise exception 'That unit does not belong to this project';
    end if;
    if v_scope is null then
      raise exception 'This unit has no short code yet — set one in Masters before recording bills for it';
    end if;
  elsif p_plot_id is not null then
    select code into v_scope from plots
    where id = p_plot_id and project_id = p_project_id;
    if not found then
      raise exception 'That plot does not belong to this project';
    end if;
    if v_scope is null then
      raise exception 'This plot has no short code yet — set one in Masters before recording bills for it';
    end if;
  else
    v_scope := 'GEN';
  end if;

  insert into bill_counters (project_id, scope, last_no)
  values (p_project_id, v_scope, 1)
  on conflict (project_id, scope) do update set last_no = bill_counters.last_no + 1
  returning last_no into v_no;

  insert into bills (
    project_id, plot_id, unit_id, scope_code, vendor_id,
    po_id, labour_contract_id, kind, bill_no, reference,
    invoice_no, invoice_date, taxable_amount, gst_amount, total_amount,
    note, created_by, updated_by
  )
  values (
    p_project_id, p_plot_id, p_unit_id, v_scope, p_vendor_id,
    null, null, 'nmr', v_no,
    'BILL/' || v_project_code || '/' || v_scope || '/'
      || lpad(v_no::text, greatest(3, length(v_no::text)), '0'),
    trim(p_invoice_no), p_invoice_date,
    p_taxable_amount, p_gst_amount, p_total_amount,
    nullif(trim(p_note), ''), auth.uid(), auth.uid()
  )
  returning id into v_id;

  return v_id;
end $$;

revoke execute on function create_nmr_bill(uuid, uuid, uuid, uuid, text, date, numeric, numeric, numeric, text) from public;
grant execute on function create_nmr_bill(uuid, uuid, uuid, uuid, text, date, numeric, numeric, numeric, text) to authenticated;

-- ---------------------------------------------------------------------
-- 5. bill_facts gains kind (still no money — the column list is the
--    boundary, the 0025 §7 rules unchanged)
-- ---------------------------------------------------------------------

drop view if exists bill_facts;

create view bill_facts
with (security_barrier) as
select b.id, b.project_id, b.plot_id, b.unit_id, b.scope_code,
       b.vendor_id, b.po_id, b.labour_contract_id, b.kind, b.bill_no,
       b.reference, b.status, b.invoice_date,
       b.created_at, b.approved_at, b.paid_at
from bills b;

revoke all on bill_facts from public, anon;
grant select on bill_facts to authenticated;
