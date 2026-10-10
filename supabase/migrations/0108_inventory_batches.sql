-- 0108 — Store batches, and the rates they carry
--
-- FOUNDER, 2026-10-08 (plan.md, B9), reversing 0023's "no money anywhere
-- in Inventory" for the holders of /inventory: "create a batch ID when
-- materials are received and use it to track subsequent material
-- issues … when a batch ID is selected, populate the rate from the
-- associated PO." Decided: everyone with /inventory sees the rates;
-- an issue takes the OLDEST batch first and the store-keeper may choose
-- another; a receipt's rate comes from the PO and may be changed when the
-- delivery bill differs, which is flagged for accounts.
--
--   * A BATCH IS A STORE RECEIPT LINE. Its name, GRN/SAA/012-1, is the
--     receipt's reference and the line's place — derived, nothing stored.
--     Direct-to-site deliveries are used where they land: not batches.
--   * goods_receipt_line_rates — the money, in its own table so the stock
--     tables stay open to every signed-in person as before. SELECT:
--     /inventory, /purchase-orders, /bills, /reporter. UPDATE: /inventory
--     (rate, GST and a note; the PO's figures beside them are permanent).
--     No insert policy: an AFTER INSERT trigger on goods_receipt_lines
--     writes it from the PO line (net of 0102's discount) — SECURITY
--     DEFINER, because a store-keeper cannot read purchase_order_lines;
--     no client role may execute it, so the grant is the boundary.
--   * stock_batch_movements — where each batch went: a signed quantity
--     at a store, per issue line or adjustment. Quantities only, open
--     reads like stock_on_hand; written by the triggers below.
--   * An issue line may name the batch the keeper chose
--     (preferred_receipt_line_id); the allocation takes that one first,
--     then the oldest. A transfer carries its batches to the receiving
--     store. A removal adjustment (breakage, a recount) draws oldest
--     first. Stock from before batches (opening stock) has no batch and
--     no rate — it is drawn last, as "no batch", and nothing refuses it.
--   * batch_on_hand — per store and batch: what is left. Money-free,
--     open, in the view manifest. The negative-stock guards are
--     untouched; the allocation runs after them, under their lock.
--
-- Re-runnable throughout.

-- ---------------------------------------------------------------------
-- 1. Receipt line rates
-- ---------------------------------------------------------------------

create table if not exists goods_receipt_line_rates (
  id uuid primary key default gen_random_uuid(),
  receipt_line_id uuid not null unique references goods_receipt_lines (id),
  rate numeric check (rate is null or rate >= 0),
  gst_pct numeric check (gst_pct is null or (gst_pct >= 0 and gst_pct <= 100)),
  po_rate numeric,
  po_gst_pct numeric,
  note text,
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function goods_receipt_line_rates_guard()
returns trigger
language plpgsql
as $$
begin
  if (new.receipt_line_id, new.po_rate, new.po_gst_pct)
     is distinct from (old.receipt_line_id, old.po_rate, old.po_gst_pct) then
    raise exception 'The PO''s rate on a receipt never changes — only the rate the delivery bill says';
  end if;
  return new;
end $$;

drop trigger if exists goods_receipt_line_rates_guard on goods_receipt_line_rates;
create trigger goods_receipt_line_rates_guard
  before update on goods_receipt_line_rates
  for each row execute function goods_receipt_line_rates_guard();

create or replace function goods_receipt_lines_copy_rate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_net numeric;
  v_gst numeric;
begin
  select round(
           l.rate
           - coalesce(l.rate * l.discount_pct / 100, 0)
           - coalesce(l.discount_amount / nullif(l.quantity, 0), 0), 4),
         l.gst_pct
    into v_net, v_gst
    from purchase_order_lines l where l.id = new.po_line_id;

  insert into goods_receipt_line_rates (receipt_line_id, rate, gst_pct, po_rate, po_gst_pct, updated_by)
  values (new.id, v_net, v_gst, v_net, v_gst, auth.uid())
  on conflict (receipt_line_id) do nothing;
  return null;
end $$;

revoke execute on function goods_receipt_lines_copy_rate() from public, anon, authenticated;

drop trigger if exists goods_receipt_lines_copy_rate on goods_receipt_lines;
create trigger goods_receipt_lines_copy_rate
  after insert on goods_receipt_lines
  for each row execute function goods_receipt_lines_copy_rate();

-- Receipts made before batches get their PO's rate too.
insert into goods_receipt_line_rates (receipt_line_id, rate, gst_pct, po_rate, po_gst_pct)
select g.id,
       round(l.rate - coalesce(l.rate * l.discount_pct / 100, 0)
             - coalesce(l.discount_amount / nullif(l.quantity, 0), 0), 4),
       l.gst_pct,
       round(l.rate - coalesce(l.rate * l.discount_pct / 100, 0)
             - coalesce(l.discount_amount / nullif(l.quantity, 0), 0), 4),
       l.gst_pct
from goods_receipt_lines g
join purchase_order_lines l on l.id = g.po_line_id
on conflict (receipt_line_id) do nothing;

-- ---------------------------------------------------------------------
-- 2. Where each batch went
-- ---------------------------------------------------------------------

alter table stock_issue_lines add column if not exists preferred_receipt_line_id uuid
  references goods_receipt_lines (id);

create table if not exists stock_batch_movements (
  id uuid primary key default gen_random_uuid(),
  receipt_line_id uuid not null references goods_receipt_lines (id),
  store_id uuid not null references stores (id),
  quantity numeric not null check (quantity <> 0),
  issue_line_id uuid references stock_issue_lines (id),
  adjustment_id uuid references stock_adjustments (id),
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  constraint stock_batch_movements_one_cause
    check ((issue_line_id is not null) <> (adjustment_id is not null))
);

create index if not exists stock_batch_movements_batch_idx
  on stock_batch_movements (receipt_line_id, store_id);
create index if not exists stock_batch_movements_issue_line_idx
  on stock_batch_movements (issue_line_id);

create or replace view batch_on_hand as
select t.receipt_line_id,
       t.store_id,
       g.item_id,
       r.received_at,
       sum(t.quantity) as quantity
from (
  select gl.id as receipt_line_id, gr.store_id, gl.quantity
  from goods_receipt_lines gl
  join goods_receipts gr on gr.id = gl.receipt_id
  where gr.store_id is not null
  union all
  select m.receipt_line_id, m.store_id, m.quantity
  from stock_batch_movements m
) t
join goods_receipt_lines g on g.id = t.receipt_line_id
join goods_receipts r on r.id = g.receipt_id
group by t.receipt_line_id, t.store_id, g.item_id, r.received_at;

revoke all on batch_on_hand from public, anon;
revoke insert, update, delete, truncate on batch_on_hand from anon, authenticated;
grant select on batch_on_hand to authenticated;

-- Take p_qty of an item out of a store, the preferred batch first, then
-- the oldest; a transfer lands the same batches in p_to_store. Whatever
-- no batch covers is stock from before batches, and is left at that.
create or replace function allocate_batches(
  p_store_id uuid,
  p_item_id uuid,
  p_qty numeric,
  p_preferred uuid,
  p_to_store_id uuid,
  p_issue_line_id uuid,
  p_adjustment_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  b record;
  v_left numeric := p_qty;
  v_take numeric;
begin
  for b in
    select h.receipt_line_id, h.quantity
    from batch_on_hand h
    where h.store_id = p_store_id and h.item_id = p_item_id and h.quantity > 0
    order by (h.receipt_line_id = p_preferred) desc nulls last, h.received_at, h.receipt_line_id
  loop
    exit when v_left <= 0;
    v_take := least(v_left, b.quantity);
    insert into stock_batch_movements (receipt_line_id, store_id, quantity, issue_line_id, adjustment_id, created_by)
    values (b.receipt_line_id, p_store_id, -v_take, p_issue_line_id, p_adjustment_id, auth.uid());
    if p_to_store_id is not null then
      insert into stock_batch_movements (receipt_line_id, store_id, quantity, issue_line_id, adjustment_id, created_by)
      values (b.receipt_line_id, p_to_store_id, v_take, p_issue_line_id, null, auth.uid());
    end if;
    v_left := v_left - v_take;
  end loop;
end $$;

revoke execute on function allocate_batches(uuid, uuid, numeric, uuid, uuid, uuid, uuid) from public, anon, authenticated;

-- The two triggers below are SECURITY DEFINER so they can call
-- allocate_batches, which no client role may execute: movements are
-- written by the allocation and nothing else. They read only the row
-- that fired them; the issue and adjustment policies (/inventory) were
-- the gate for that row.
create or replace function stock_issue_lines_allocate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store uuid;
  v_to_store uuid;
begin
  select store_id, to_store_id into v_store, v_to_store from stock_issues where id = new.issue_id;
  perform allocate_batches(v_store, new.item_id, new.quantity, new.preferred_receipt_line_id,
                           v_to_store, new.id, null);
  return null;
end $$;

drop trigger if exists stock_issue_lines_allocate on stock_issue_lines;
create trigger stock_issue_lines_allocate
  after insert on stock_issue_lines
  for each row execute function stock_issue_lines_allocate();

create or replace function stock_adjustments_allocate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.quantity < 0 then
    perform allocate_batches(new.store_id, new.item_id, -new.quantity, null, null, null, new.id);
  end if;
  return null;
end $$;

drop trigger if exists stock_adjustments_allocate on stock_adjustments;
create trigger stock_adjustments_allocate
  after insert on stock_adjustments
  for each row execute function stock_adjustments_allocate();

revoke execute on function stock_issue_lines_allocate() from public, anon, authenticated;
revoke execute on function stock_adjustments_allocate() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2b. Lines are history
-- ---------------------------------------------------------------------
-- 0023's header rule — quantities are corrected by an adjustment with a
-- reason, never by rewriting history — had no trigger behind it: the
-- update policies admit any /inventory holder. Now a line is also a
-- batch's record: the allocation moved the quantity as it was, so a
-- rewritten quantity would leave batch_on_hand wrong forever. uom is
-- left out — a unit renamed in Masters cascades here (0082).

create or replace function inventory_lines_immutable()
returns trigger
language plpgsql
as $$
begin
  if tg_table_name = 'goods_receipt_lines' then
    if (new.receipt_id, new.po_line_id, new.item_id, new.quantity)
       is distinct from (old.receipt_id, old.po_line_id, old.item_id, old.quantity) then
      raise exception 'A receipt line is permanent — correct the stock with an adjustment and a reason';
    end if;
  elsif tg_table_name = 'stock_issue_lines' then
    if (new.issue_id, new.item_id, new.quantity, new.preferred_receipt_line_id)
       is distinct from (old.issue_id, old.item_id, old.quantity, old.preferred_receipt_line_id) then
      raise exception 'An issue line is permanent — correct the stock with an adjustment and a reason';
    end if;
  else
    if (new.store_id, new.item_id, new.quantity)
       is distinct from (old.store_id, old.item_id, old.quantity) then
      raise exception 'An adjustment is permanent — record another one to correct it';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists goods_receipt_lines_immutable on goods_receipt_lines;
create trigger goods_receipt_lines_immutable
  before update on goods_receipt_lines
  for each row execute function inventory_lines_immutable();

drop trigger if exists stock_issue_lines_immutable on stock_issue_lines;
create trigger stock_issue_lines_immutable
  before update on stock_issue_lines
  for each row execute function inventory_lines_immutable();

drop trigger if exists stock_adjustments_immutable on stock_adjustments;
create trigger stock_adjustments_immutable
  before update on stock_adjustments
  for each row execute function inventory_lines_immutable();

-- ---------------------------------------------------------------------
-- 3. Audit, updated_at, RLS
-- ---------------------------------------------------------------------

drop trigger if exists audit_goods_receipt_line_rates on goods_receipt_line_rates;
create trigger audit_goods_receipt_line_rates
  after insert or update or delete on goods_receipt_line_rates
  for each row execute function audit_row();

drop trigger if exists set_updated_at on goods_receipt_line_rates;
create trigger set_updated_at
  before update on goods_receipt_line_rates
  for each row execute function set_updated_at();

alter table goods_receipt_line_rates enable row level security;
alter table stock_batch_movements enable row level security;

drop policy if exists "goods_receipt_line_rates readable by inventory and money tools" on goods_receipt_line_rates;
create policy "goods_receipt_line_rates readable by inventory and money tools" on goods_receipt_line_rates
  for select to authenticated
  using (has_app('/inventory') or has_app('/purchase-orders') or has_app('/bills') or has_app('/reporter'));
drop policy if exists "goods_receipt_line_rates updatable by inventory app" on goods_receipt_line_rates;
create policy "goods_receipt_line_rates updatable by inventory app" on goods_receipt_line_rates
  for update to authenticated using (has_app('/inventory')) with check (has_app('/inventory'));

-- Quantities only, like every stock table: open reads. NO write policy:
-- only the allocation (definer) writes, and nothing updates or deletes —
-- the record of where a batch went is permanent.
drop policy if exists "stock_batch_movements readable by authenticated users" on stock_batch_movements;
create policy "stock_batch_movements readable by authenticated users" on stock_batch_movements
  for select to authenticated using (true);
drop policy if exists "stock_batch_movements insertable by inventory app" on stock_batch_movements;

-- ---------------------------------------------------------------------
-- 4. Prove it
-- ---------------------------------------------------------------------

do $$
declare
  t text;
  v int;
begin
  foreach t in array array['goods_receipt_line_rates', 'stock_batch_movements'] loop
    if not exists (select 1 from pg_class where relname = t and relrowsecurity) then
      raise exception '0108: % is missing or has RLS off', t;
    end if;
    select count(*) into v from pg_policies
      where schemaname = 'public' and tablename = t and cmd = 'SELECT';
    if v <> 1 then raise exception '0108: % has % SELECT policies, expected 1', t, v; end if;
    if exists (select 1 from pg_policies
      where schemaname = 'public' and tablename = t and cmd in ('DELETE', 'ALL')) then
      raise exception '0108: % must have no DELETE policy', t;
    end if;
  end loop;

  if exists (select 1 from pg_policies
    where schemaname = 'public' and tablename = 'goods_receipt_line_rates' and cmd = 'INSERT') then
    raise exception '0108: only the receipt trigger writes a receipt''s rate';
  end if;

  if exists (select 1 from goods_receipt_lines g
    where not exists (select 1 from goods_receipt_line_rates r where r.receipt_line_id = g.id)) then
    raise exception '0108: a receipt line has no rate row after the backfill';
  end if;

  if exists (select 1 from information_schema.columns
    where table_schema = 'public' and table_name in ('batch_on_hand', 'stock_on_hand', 'stock_by_location')
      and column_name in ('rate', 'gst_pct', 'amount', 'value')) then
    raise exception '0108: a stock view carries money';
  end if;

  if exists (select 1 from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'batch_on_hand'
      and grantee in ('anon', 'authenticated', 'PUBLIC')
      and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')) then
    raise exception '0108: batch_on_hand is writable';
  end if;

  if exists (select 1 from pg_policies
    where schemaname = 'public' and tablename = 'stock_batch_movements' and cmd <> 'SELECT') then
    raise exception '0108: only the allocation writes stock_batch_movements';
  end if;

  if exists (select 1 from information_schema.routine_privileges
    where routine_schema = 'public' and routine_name in ('allocate_batches', 'stock_issue_lines_allocate', 'stock_adjustments_allocate')
      and grantee in ('PUBLIC', 'anon', 'authenticated') and privilege_type = 'EXECUTE') then
    raise exception '0108: a client role can execute a batch allocation function';
  end if;

  if exists (select 1 from information_schema.routine_privileges
    where routine_schema = 'public' and routine_name = 'goods_receipt_lines_copy_rate'
      and grantee in ('PUBLIC', 'anon', 'authenticated') and privilege_type = 'EXECUTE') then
    raise exception '0108: a client role can execute goods_receipt_lines_copy_rate';
  end if;

  if (select count(*) from pg_trigger
      where tgname in ('goods_receipt_lines_immutable', 'stock_issue_lines_immutable', 'stock_adjustments_immutable')) <> 3 then
    raise exception '0108: an inventory line is still rewritable';
  end if;
end $$;
