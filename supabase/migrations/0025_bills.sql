-- Phase 8 — Bills.
--
-- The accounts-facing record of what Goodearth owes and has paid. A bill
-- is a vendor's paper invoice recorded against exactly one anchor — a
-- purchase order or a labour contract — numbered
-- BILL/<project code>/<scope code>/NNN (the PO shape: scope is a unit
-- code, a plot code, or "GEN"), moving recorded -> approved -> paid,
-- with send-back (approved -> recorded) carrying a mandatory note.
--
-- Founder decisions this phase:
--   * Amounts (taxable / GST / total) are STORED AS ENTERED from the
--     paper invoice — the vendor's figures, never computed, unlike POs.
--   * Over-billing against a PO or contract WARNS in the UI, never
--     blocks — real invoices legitimately differ; a human decides.
--   * Self-approval is allowed: any admin or bill_approvers member may
--     approve, including whoever recorded the bill.
--   * Paying requires one free-text payment_ref (UTR / cheque / UPI).
--   * A bill derives its plot/unit scope from its anchor — nothing is
--     picked at bill time; labour contracts therefore carry an optional
--     plot/unit exactly like POs.
--
-- MONEY LIVES HERE (the 0021 precedent): SELECT on bills requires the
-- /bills grant. The money-free window is bill_facts (§7); the one
-- sanctioned money window is po_billing_totals (§7), gated in its WHERE
-- to the two grants that already see PO money or bill money.
--
-- '/bills' is already in the user_apps_app_known CHECK (0017) — no
-- constraint change needed here.
--
-- Re-runnable throughout (the 0016 convention).

-- ---------------------------------------------------------------------
-- 1. labour_contracts — the Masters-managed list bills can anchor on
-- ---------------------------------------------------------------------
-- Contractors are vendors (one counterparty list, the founder's rule).
-- description says what the contract covers ("Masonry, phase 2") — NOT
-- named "scope", which in this schema always means the plot/unit/GEN
-- number segment. contract_value is what the over-billing warning
-- compares against; like a vendor's GST number it is a counterparty
-- fact, not margin-class secret, so reads stay open (the TODO-approved
-- Masters pattern). Deactivate via is_active; no deletes, ever.

create table if not exists labour_contracts (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references vendors (id),
  project_id uuid not null references projects (id),
  -- At most one of plot/unit; neither means a general contract ("GEN").
  plot_id uuid references plots (id),
  unit_id uuid references units (id),
  description text not null check (length(trim(description)) > 0),
  contract_value numeric not null check (contract_value > 0),
  is_active boolean not null default true,
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not (plot_id is not null and unit_id is not null))
);

create index if not exists labour_contracts_vendor_idx on labour_contracts (vendor_id);
create index if not exists labour_contracts_project_idx on labour_contracts (project_id);

alter table labour_contracts enable row level security;

-- The post-0013 masters pattern: reads open, writes the /masters grant
-- (has_app() already returns true for admins). NOT 0004's is_admin()
-- form — that is exactly the refused-grant-holder bug 0013 corrected.
drop policy if exists "labour_contracts readable by authenticated users" on labour_contracts;
create policy "labour_contracts readable by authenticated users"
  on labour_contracts for select to authenticated using (true);
drop policy if exists "labour_contracts insertable by masters app" on labour_contracts;
create policy "labour_contracts insertable by masters app"
  on labour_contracts for insert to authenticated with check (has_app('/masters'));
drop policy if exists "labour_contracts updatable by masters app" on labour_contracts;
create policy "labour_contracts updatable by masters app"
  on labour_contracts for update to authenticated
  using (has_app('/masters')) with check (has_app('/masters'));
-- No delete policy: masters are deactivated, never hard-deleted.

-- ---------------------------------------------------------------------
-- 2. bill_approvers — the named list who may approve a bill
-- ---------------------------------------------------------------------
-- The indent_approvers clone (0019 §2), managed from Settings alongside
-- it. No `id` column and therefore NO audit trigger — audit_row() reads
-- new.id and would raise at runtime; if auditing is ever wanted here,
-- add the surrogate id first (the 0018 retrofit).

create table if not exists bill_approvers (
  user_id uuid primary key references profiles (id) on delete cascade,
  granted_by uuid references profiles (id),
  granted_at timestamptz not null default now()
);

alter table bill_approvers enable row level security;

-- Readable by everyone signed in: bills_guard() runs as the invoker and
-- must see the list, and the Approve button needs to know whether to
-- render. Who may approve is not a secret; only admins decide it.
drop policy if exists "bill_approvers readable by authenticated users" on bill_approvers;
create policy "bill_approvers readable by authenticated users"
  on bill_approvers for select to authenticated using (true);
drop policy if exists "bill_approvers grantable by admins" on bill_approvers;
create policy "bill_approvers grantable by admins"
  on bill_approvers for insert to authenticated with check (is_admin());
drop policy if exists "bill_approvers revocable by admins" on bill_approvers;
create policy "bill_approvers revocable by admins"
  on bill_approvers for delete to authenticated using (is_admin());

-- ---------------------------------------------------------------------
-- 3. bill_counters — numbering per (project, scope)
-- ---------------------------------------------------------------------
-- BILL/SAA/V12A/003 and BILL/SAA/GEN/001 run independently — the
-- po_counters shape (0021 §3). Minted only inside create_bill() via the
-- upsert-with-row-lock that serialises concurrent creates. Gaps from
-- deleted recorded bills are accepted; a reused number is not.

create table if not exists bill_counters (
  project_id uuid not null references projects (id),
  scope text not null,
  last_no int not null default 0,
  primary key (project_id, scope)
);

alter table bill_counters enable row level security;

drop policy if exists "bill_counters readable by authenticated users" on bill_counters;
create policy "bill_counters readable by authenticated users"
  on bill_counters for select to authenticated using (true);
drop policy if exists "bill_counters writable by bills app" on bill_counters;
create policy "bill_counters writable by bills app"
  on bill_counters for insert to authenticated with check (has_app('/bills'));
drop policy if exists "bill_counters updatable by bills app" on bill_counters;
create policy "bill_counters updatable by bills app"
  on bill_counters for update to authenticated
  using (has_app('/bills')) with check (has_app('/bills'));

-- ---------------------------------------------------------------------
-- 4. bills
-- ---------------------------------------------------------------------
-- Header-only — a bill has no lines (the paper invoice's three figures
-- are the record), so there is no lines table, no draft-only child
-- guard, and no delete RPC: the delete_draft_* RPCs exist only to make
-- lines-then-header deletes atomic, and with no children a plain
-- RLS-policed DELETE suffices.

create table if not exists bills (
  id uuid primary key default gen_random_uuid(),
  -- Project, scope and vendor are COPIED FROM THE ANCHOR at mint time
  -- by create_bill() — never picked by the recorder, so they can never
  -- disagree with the PO or contract they came from.
  project_id uuid not null references projects (id),
  plot_id uuid references plots (id),
  unit_id uuid references units (id),
  -- The scope segment as minted into the reference ("V12A" / "GEN").
  -- Stored, never recomputed — editing a code later relabels nothing.
  scope_code text not null,
  vendor_id uuid not null references vendors (id),

  -- Exactly one anchor: a purchase order or a labour contract.
  po_id uuid references purchase_orders (id),
  labour_contract_id uuid references labour_contracts (id),

  bill_no int not null,
  reference text not null,

  -- The vendor's paper invoice, as printed.
  invoice_no text not null check (length(trim(invoice_no)) > 0),
  invoice_date date not null,
  -- Stored as entered — the vendor's figures. Deliberately NO
  -- total = taxable + gst CHECK: rounding on real invoices makes the
  -- sum disagree by paise, and the founder's rule is to record the
  -- paper, not to correct it.
  taxable_amount numeric not null check (taxable_amount >= 0),
  gst_amount numeric not null check (gst_amount >= 0),
  total_amount numeric not null check (total_amount > 0),

  status text not null default 'recorded'
    check (status in ('recorded', 'approved', 'paid')),
  -- Set when an approver sends an approved bill back; cleared on the
  -- next approval. The reason lives here so accounts sees it on the
  -- bill they're fixing.
  rejection_note text,
  -- The free-text payment reference (UTR / cheque no. / UPI ref),
  -- required by the guard before a bill can be marked paid.
  payment_ref text,
  note text,

  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  approved_by uuid references profiles (id),
  approved_at timestamptz,
  paid_by uuid references profiles (id),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Exactly one anchor — the 0023 XOR idiom.
  check ((po_id is not null) <> (labour_contract_id is not null)),
  check (not (plot_id is not null and unit_id is not null)),
  unique (project_id, scope_code, bill_no),
  unique (reference)
);

create index if not exists bills_project_idx on bills (project_id);
create index if not exists bills_vendor_idx on bills (vendor_id);
create index if not exists bills_status_idx on bills (status);
create index if not exists bills_po_idx on bills (po_id) where po_id is not null;
create index if not exists bills_contract_idx
  on bills (labour_contract_id) where labour_contract_id is not null;
create index if not exists bills_unit_idx on bills (unit_id) where unit_id is not null;
create index if not exists bills_plot_idx on bills (plot_id) where plot_id is not null;

-- ---------------------------------------------------------------------
-- 5. The status machine, enforced where it can't be forgotten
-- ---------------------------------------------------------------------
-- The indents_guard shape (0019 §6): every transition whitelisted, the
-- approver rule checked HERE so it holds against a raw PostgREST PATCH,
-- not just against the button.

create or replace function bills_guard()
returns trigger
language plpgsql
as $$
begin
  -- The number is permanent — and so are the anchor, vendor and scope
  -- it was minted from. A wrongly recorded bill is deleted (while
  -- recorded) and recorded again; the number is burnt, gaps accepted.
  if (new.project_id, new.plot_id, new.unit_id, new.scope_code, new.vendor_id,
      new.po_id, new.labour_contract_id, new.bill_no, new.reference)
     is distinct from
     (old.project_id, old.plot_id, old.unit_id, old.scope_code, old.vendor_id,
      old.po_id, old.labour_contract_id, old.bill_no, old.reference) then
    raise exception 'A bill''s anchor, vendor, scope and number are permanent';
  end if;

  if new.status = old.status then
    -- Header edits (invoice no./date, amounts, note) only while it's
    -- still recorded.
    if old.status <> 'recorded' then
      raise exception 'A % bill can no longer be edited', old.status;
    end if;
    return new;
  end if;

  if old.status = 'recorded' and new.status = 'approved' then
    -- Self-approval allowed (founder decision): the recorder may sit on
    -- this list — no recorder <> approver check, deliberately.
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
    -- A send-back: the reason is mandatory, and the approval record is
    -- cleared so the next approval stamps fresh.
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

  -- Everything else — recorded -> paid, un-paying, un-approving without
  -- a note — is refused outright.
  raise exception 'Invalid bill status change: % -> %', old.status, new.status;
end $$;

drop trigger if exists bills_guard on bills;
create trigger bills_guard
  before update on bills
  for each row execute function bills_guard();

-- ---------------------------------------------------------------------
-- 6. create_bill() — the only place a number is minted
-- ---------------------------------------------------------------------
-- security invoker: RLS still applies — the INSERT policies on bills
-- and bill_counters are the gate, exactly like create_purchase_order().
--
-- Unlike create_purchase_order(), this takes NO project/plot/unit/
-- vendor parameters: a bill derives all of them from its anchor
-- (founder decision), which kills the whole client-mismatch class.
--
-- The PO branch reads po_facts, NOT purchase_orders: a /bills-only user
-- has no SELECT on the PO tables (money lives there, 0021 §12), and
-- everything the mint needs — project, scope, vendor, status — is fact,
-- not money. The postgres-owned view sees the row; this function never
-- touches a rate.

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
  v_project_code text;
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
    select f.project_id, f.plot_id, f.unit_id, f.scope_code, f.vendor_id, f.status
    into v_project_id, v_plot_id, v_unit_id, v_scope, v_vendor_id, v_po_status
    from po_facts f where f.id = p_po_id;
    if not found then
      raise exception 'That purchase order no longer exists';
    end if;
    -- Drafts have no agreed money yet; a deletion-requested PO may
    -- still be cancelled; a cancelled PO is dead paper.
    if v_po_status not in ('issued', 'completed') then
      raise exception 'Bills can only be recorded against an issued purchase order (this one is %)', v_po_status;
    end if;
  else
    select c.project_id, c.plot_id, c.unit_id, c.vendor_id, c.is_active
    into v_project_id, v_plot_id, v_unit_id, v_vendor_id, v_contract_active
    from labour_contracts c where c.id = p_labour_contract_id;
    if not found then
      raise exception 'That labour contract no longer exists';
    end if;
    if not v_contract_active then
      raise exception 'This labour contract is marked inactive in Masters';
    end if;
    -- The contract's scope segment, resolved the create_purchase_order
    -- way: unit code, else plot code, else GEN.
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

  -- Deliberately NO vendor-inactive check, unlike create_purchase_order:
  -- a paper invoice from a since-deactivated vendor is a fact that must
  -- enter the books — refusing to record reality would be wrong. The
  -- contract's own is_active IS checked above, because deactivating a
  -- contract is the founder's off-switch for new billing against it.

  insert into bill_counters (project_id, scope, last_no)
  values (v_project_id, v_scope, 1)
  on conflict (project_id, scope) do update set last_no = bill_counters.last_no + 1
  returning last_no into v_no;

  insert into bills (
    project_id, plot_id, unit_id, scope_code, vendor_id,
    po_id, labour_contract_id, bill_no, reference,
    invoice_no, invoice_date, taxable_amount, gst_amount, total_amount,
    note, created_by, updated_by
  )
  values (
    v_project_id, v_plot_id, v_unit_id, v_scope, v_vendor_id,
    p_po_id, p_labour_contract_id, v_no,
    -- greatest() because lpad truncates past its target (the 0019 §7
    -- rule); matches the TS mirror in lib/bills/reference.ts.
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
-- 7. The two windows through the bill-money boundary
-- ---------------------------------------------------------------------
-- Same mechanism as po_facts (0022) and approved_budgets (0019 §9):
-- views owned by postgres (the table owner bypasses RLS), with the
-- COLUMN LIST as the security boundary; security_barrier stops a leaky
-- caller function being pushed below the qual. Never solve a cross-tool
-- read with a second row-level SELECT policy — permissive policies OR
-- together, and a row policy exposes every column.
--
-- bill_facts: NO amounts, no invoice_no, no payment_ref, no notes — who
-- billed what status when is operational fact, not money. Open to all
-- authenticated: the Overview pipeline counts bills for every signed-in
-- user, exactly as it counts indents and POs. NEVER add a money column.
--
-- po_billing_totals: the ONE sanctioned money window — a single ordered
-- total and billed total per PO, no line rates, no per-bill rows. Its
-- WHERE is the gate: /purchase-orders holders already see every rupee
-- on a PO and get the billed picture; /bills holders need the ordered
-- total for the record form's over-billing warning. If a third consumer
-- ever appears, widen this qual — never add a policy. ordered_total is
-- full precision (round at display, the lib/purchase-orders/math.ts
-- rule); unpriced draft lines contribute nothing (sum skips nulls),
-- which is fine — only issued/completed POs can be billed against.

drop view if exists bill_facts;

create view bill_facts
with (security_barrier) as
select b.id, b.project_id, b.plot_id, b.unit_id, b.scope_code,
       b.vendor_id, b.po_id, b.labour_contract_id, b.bill_no,
       b.reference, b.status, b.invoice_date,
       b.created_at, b.approved_at, b.paid_at
from bills b;

drop view if exists po_billing_totals;

create view po_billing_totals
with (security_barrier) as
select po.id as po_id,
       coalesce(ordered.total, 0) as ordered_total,
       coalesce(billed.total, 0) as billed_total,
       coalesce(billed.n, 0) as bill_count
from purchase_orders po
left join (
  select l.po_id,
         sum(l.quantity * l.rate * (1 + coalesce(l.gst_pct, 0) / 100)) as total
  from purchase_order_lines l
  group by l.po_id
) ordered on ordered.po_id = po.id
left join (
  select b.po_id, sum(b.total_amount) as total, count(*) as n
  from bills b
  where b.po_id is not null
  group by b.po_id
) billed on billed.po_id = po.id
where has_app('/purchase-orders') or has_app('/bills');

revoke all on bill_facts from public, anon;
revoke all on po_billing_totals from public, anon;
grant select on bill_facts to authenticated;
grant select on po_billing_totals to authenticated;

-- ---------------------------------------------------------------------
-- 8. Audit, updated_at
-- ---------------------------------------------------------------------
-- Both tables carry an `id`, so audit_row() (0006) applies cleanly.
-- labour_contracts is a counterparty on money documents — the 0020
-- rule. bill_approvers and bill_counters are deliberately not audited
-- (no id; a counter's history is noise) — the 0019 §10 rule.

do $$
declare
  t text;
begin
  for t in select unnest(array['labour_contracts', 'bills'])
  loop
    execute format('drop trigger if exists audit_%s on %I', t, t);
    execute format(
      'create trigger audit_%s after insert or update or delete on %I for each row execute function audit_row()', t, t
    );
    execute format('drop trigger if exists set_updated_at on %I', t);
    execute format(
      'create trigger set_updated_at before update on %I for each row execute function set_updated_at()', t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 9. RLS on bills — money lives here
-- ---------------------------------------------------------------------
-- The 0021 §12 precedent: SELECT itself requires the grant so an
-- invoice amount can never leak. bill_facts (§7) is the money-free
-- window for everyone else.

alter table bills enable row level security;

drop policy if exists "bills readable by bills app" on bills;
create policy "bills readable by bills app"
  on bills for select to authenticated using (has_app('/bills'));
drop policy if exists "bills writable by bills app" on bills;
create policy "bills writable by bills app"
  on bills for insert to authenticated with check (has_app('/bills'));
drop policy if exists "bills updatable by bills app" on bills;
create policy "bills updatable by bills app"
  on bills for update to authenticated
  using (has_app('/bills')) with check (has_app('/bills'));
-- A wrongly recorded bill is its recorder's (or an admin's) to throw
-- away, and only while still recorded — approved and paid bills are
-- permanent record.
drop policy if exists "recorded bills deletable by recorder" on bills;
create policy "recorded bills deletable by recorder"
  on bills for delete to authenticated
  using (
    has_app('/bills') and status = 'recorded'
    and (is_admin() or created_by = auth.uid())
  );
