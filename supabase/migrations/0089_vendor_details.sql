-- 0089 — Supplier vendors get their details; bank details get a door
--
-- FOUNDER, 2026-08-20: the AppSheet vendor extract (83 suppliers) comes
-- into the vendors master with everything it knows — contact, GST,
-- payment terms, and bank accounts for 72 of them. The first three are
-- ordinary vendor columns. The bank details are not: the vendors table
-- is a masters read, deliberately open to every signed-in staff member
-- (0004), and an account number is the one field on a vendor nobody
-- needs to see to pick a supplier. The estimator-rate precedent (0074:
-- "Masters reads are ungated, so a rate can never live there") applies
-- unchanged, so bank details live in their own 1:1 table whose SELECT
-- is gated to the three tools that pay or manage vendors: /masters,
-- /purchase-orders, /bills. ONE select policy, widened later if ever
-- needed — never a second (SECURITY.md).
--
-- The import itself is scripts/import-vendors.ts (dry-run first, like
-- import-contractors.ts) — no data rides in this migration.
--
-- Re-runnable throughout.

-- ---------------------------------------------------------------------
-- 1. The ordinary details join the vendors master
-- ---------------------------------------------------------------------

alter table vendors add column if not exists email text;
alter table vendors add column if not exists contact_designation text;
alter table vendors add column if not exists gst_state text;
alter table vendors add column if not exists payment_term_days int;

comment on column vendors.payment_term_days is
  'Agreed credit period in days, from the vendor extract. Informational '
  'for now — no tool computes a due date from it yet.';

-- ---------------------------------------------------------------------
-- 2. Bank details: 1:1 with vendors, behind the paying tools'' grants
-- ---------------------------------------------------------------------

create table if not exists vendor_payment_details (
  vendor_id uuid primary key references vendors (id),
  bank_name text,
  account_number text,
  account_holder_name text,
  ifsc text,
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists audit_vendor_payment_details on vendor_payment_details;
create trigger audit_vendor_payment_details
  after insert or update or delete on vendor_payment_details
  for each row execute function audit_row();

drop trigger if exists set_updated_at on vendor_payment_details;
create trigger set_updated_at
  before update on vendor_payment_details
  for each row execute function set_updated_at();

alter table vendor_payment_details enable row level security;

drop policy if exists "vendor payment details readable by paying tools" on vendor_payment_details;
create policy "vendor payment details readable by paying tools"
  on vendor_payment_details for select to authenticated
  using (has_app('/masters') or has_app('/purchase-orders') or has_app('/bills'));

drop policy if exists "vendor payment details insertable by masters app" on vendor_payment_details;
create policy "vendor payment details insertable by masters app"
  on vendor_payment_details for insert to authenticated
  with check (has_app('/masters'));

drop policy if exists "vendor payment details updatable by masters app" on vendor_payment_details;
create policy "vendor payment details updatable by masters app"
  on vendor_payment_details for update to authenticated
  using (has_app('/masters')) with check (has_app('/masters'));

drop policy if exists "vendor payment details deletable by masters app" on vendor_payment_details;
create policy "vendor payment details deletable by masters app"
  on vendor_payment_details for delete to authenticated
  using (has_app('/masters'));

-- ---------------------------------------------------------------------
-- 3. Prove it all landed
-- ---------------------------------------------------------------------

do $$
declare
  v int;
  c text;
begin
  foreach c in array array['email', 'contact_designation', 'gst_state', 'payment_term_days']
  loop
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'vendors' and column_name = c
    ) then
      raise exception '0089: vendors.% is missing', c;
    end if;
  end loop;

  if not exists (
    select 1 from pg_class cl
    join pg_namespace n on n.oid = cl.relnamespace
    where n.nspname = 'public' and cl.relname = 'vendor_payment_details'
      and cl.relkind = 'r' and cl.relrowsecurity
  ) then
    raise exception '0089: vendor_payment_details is missing or has RLS off';
  end if;

  select count(*) into v from pg_policies
  where schemaname = 'public' and tablename = 'vendor_payment_details';
  if v <> 4 then
    raise exception '0089: expected 4 policies on vendor_payment_details, found %', v;
  end if;

  select count(*) into v from pg_policies
  where schemaname = 'public' and tablename = 'vendor_payment_details' and cmd = 'SELECT';
  if v <> 1 then
    raise exception '0089: vendor_payment_details must have exactly ONE select policy, found %', v;
  end if;
end $$;
