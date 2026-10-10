-- 0103 — A material's budgeting rate rises with what POs pay
--
-- FOUNDER, 2026-10-08 (plan.md, B4): "update each material's budgeting
-- rate to reflect the highest purchase rate recorded in POs … use this
-- rate for budgeting only; track actual expenses using the corresponding
-- purchase rates." Decided: it RISES AUTOMATICALLY AND NEVER FALLS; a
-- person in Masters may still lower it by hand.
--
--   * The budgeting rate IS items.indicative_price — the rate the
--     Estimator prices working estimates with (0086). Official estimates
--     are frozen snapshots and do not move.
--   * It moves when a PO is ISSUED (draft → issued), never while a draft
--     is being typed. For each line: the net unit rate before GST
--     (rate less the line's discount per unit, 0102), compared only when
--     the line's unit IS the item's Masters unit — a rate per cft says
--     nothing about a rate per bag. Higher → indicative_price takes it.
--   * Every raise is written to item_price_changes (old, new, which PO
--     line), so Masters can say "raised from ₹345 to ₹360 by PO/…".
--
-- A CROSS-TOOL WRITE: Purchase Orders → Masters (items). Listed in
-- SECURITY.md. The trigger is SECURITY DEFINER because the person issuing
-- a PO holds /purchase-orders, not /masters; no client role can execute
-- it, so the grant is the boundary (SECURITY.md, the definer rule).
--
-- CONSEQUENCE, for the Fable review: indicative_price is readable by
-- every signed-in person (a Masters read), so the highest price paid for
-- each material becomes visible to all of them. The founder chose this
-- rate for budgeting; a gated "budget rate" column elsewhere is the
-- alternative if that is too wide.
--
-- Re-runnable throughout.

-- ---------------------------------------------------------------------
-- 1. The record of every raise
-- ---------------------------------------------------------------------

create table if not exists item_price_changes (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references items (id),
  old_price numeric,
  new_price numeric not null check (new_price >= 0),
  po_id uuid not null references purchase_orders (id),
  po_line_id uuid not null references purchase_order_lines (id),
  changed_by uuid references profiles (id),
  changed_at timestamptz not null default now()
);

create index if not exists item_price_changes_item_idx on item_price_changes (item_id, changed_at desc);

alter table item_price_changes enable row level security;

-- Who paid what is PO money: readable by the PO tool and Masters (which
-- owns the rate it changed). One SELECT policy; no write policy at all —
-- only the trigger below writes, as the table owner.
drop policy if exists "item_price_changes readable by masters or purchase orders" on item_price_changes;
create policy "item_price_changes readable by masters or purchase orders" on item_price_changes
  for select to authenticated using (has_app('/masters') or has_app('/purchase-orders'));

-- ---------------------------------------------------------------------
-- 2. The trigger: on issue, raise what a higher rate exceeds
-- ---------------------------------------------------------------------

create or replace function po_issue_raises_item_rates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_net numeric;
begin
  if not (old.status = 'draft' and new.status = 'issued') then
    return new;
  end if;

  for r in
    select l.id, l.item_id, l.quantity, l.rate, l.discount_pct, l.discount_amount,
           i.indicative_price, i.default_uom
    from purchase_order_lines l
    join items i on i.id = l.item_id
    where l.po_id = new.id
      and l.rate is not null
      and l.quantity > 0
      and lower(trim(l.uom)) = lower(trim(i.default_uom))
    for update of i
  loop
    v_net := r.rate
      - coalesce(r.rate * r.discount_pct / 100, 0)
      - coalesce(r.discount_amount / r.quantity, 0);
    v_net := round(v_net, 2);

    if v_net > 0 and (r.indicative_price is null or v_net > r.indicative_price) then
      update items
        set indicative_price = v_net, updated_by = auth.uid()
        where id = r.item_id;
      insert into item_price_changes (item_id, old_price, new_price, po_id, po_line_id, changed_by)
        values (r.item_id, r.indicative_price, v_net, new.id, r.id, auth.uid());
    end if;
  end loop;

  return new;
end $$;

revoke execute on function po_issue_raises_item_rates() from public, anon, authenticated;

drop trigger if exists po_issue_raises_item_rates on purchase_orders;
create trigger po_issue_raises_item_rates
  after update of status on purchase_orders
  for each row execute function po_issue_raises_item_rates();

-- ---------------------------------------------------------------------
-- 3. Prove it
-- ---------------------------------------------------------------------

do $$
declare
  v int;
begin
  if not exists (select 1 from pg_class where relname = 'item_price_changes' and relrowsecurity) then
    raise exception '0103: item_price_changes is missing or has RLS off';
  end if;
  select count(*) into v from pg_policies where schemaname = 'public' and tablename = 'item_price_changes';
  if v <> 1 then raise exception '0103: item_price_changes has % policies, expected 1 (SELECT)', v; end if;
  if not exists (select 1 from pg_trigger
    where tgname = 'po_issue_raises_item_rates' and tgrelid = 'purchase_orders'::regclass) then
    raise exception '0103: the issue trigger is missing';
  end if;
  if exists (select 1 from information_schema.routine_privileges
    where routine_schema = 'public' and routine_name = 'po_issue_raises_item_rates'
      and grantee in ('PUBLIC', 'anon', 'authenticated') and privilege_type = 'EXECUTE') then
    raise exception '0103: a client role can execute po_issue_raises_item_rates';
  end if;
end $$;
