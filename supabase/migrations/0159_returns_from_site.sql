-- 0159 — Material returned from a villa to a store (plan.md, the team's additions, F).
--
-- 1. site_returns / site_return_lines: a villa, a store, a date, a reason, and the items with their quantities. Open
--    reads like every stock table; written by /inventory; no update or delete — a return is a physical event, and a
--    mistake is put right by issuing the material again.
-- 2. Never more than reached the villa: a return line is refused past the villa's own total (what was delivered
--    straight to it, plus what was issued to it, less what came back already), under a lock per villa and item.
-- 3. The material goes back into the batches the villa drew, newest issue first, so it keeps their rate: a
--    stock_batch_movements row per batch, with the new cause return_line_id. What no batch covers (material delivered
--    straight to the site, or issued before batches) comes back with no batch, as stock from before batches does.
-- 4. stock_on_hand adds a return to its store; stock_by_location takes it off its villa. Same columns.
-- 5. An issue or a direct delivery to a villa cannot be deleted once that item has come back from the villa — the villa
--    would be left holding less than nothing.
-- 6. villa_cost_facts: a return takes its value at the batches' rates off the villa's material issued (no work named).
--    And an issue is valued from its batches as a positive figure: 0136 summed the store-side movements, which are
--    negative, so every villa's material issued read below zero and partly priced.

-- 1 ------------------------------------------------------------------------------------------------------
create table if not exists site_returns (
  id uuid primary key default gen_random_uuid(),
  plot_id uuid not null references plots (id),
  store_id uuid not null references stores (id),
  returned_on date not null default current_date,
  reason text not null check (length(trim(reason)) between 1 and 500),
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists site_returns_plot on site_returns (plot_id);
create index if not exists site_returns_store on site_returns (store_id);

create table if not exists site_return_lines (
  id uuid primary key default gen_random_uuid(),
  return_id uuid not null references site_returns (id),
  item_id uuid not null references items (id),
  quantity numeric not null check (quantity > 0),
  uom text not null references uoms (name) on update cascade,
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (return_id, item_id)
);
create index if not exists site_return_lines_item on site_return_lines (item_id);

do $$
declare
  t text;
begin
  foreach t in array array['site_returns', 'site_return_lines']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('revoke all on %I from public, anon', t);
    execute format('drop trigger if exists audit_%s on %I', t, t);
    execute format('create trigger audit_%s after insert or update or delete on %I for each row execute function audit_row()', t, t);
    execute format('drop trigger if exists set_updated_at on %I', t);
    execute format('create trigger set_updated_at before update on %I for each row execute function set_updated_at()', t);
    execute format('drop policy if exists "%s readable by authenticated users" on %I', t, t);
    execute format('create policy "%s readable by authenticated users" on %I for select to authenticated using ((select session_is_verified()))', t, t);
    execute format('drop policy if exists "%s writable by inventory app" on %I', t, t);
    execute format('create policy "%s writable by inventory app" on %I for insert to authenticated with check ((select has_app(''/inventory'')))', t, t);
  end loop;
end $$;

-- A return's villa, store and date stand once made; its lines are fixed too.
create or replace function site_returns_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'A return is a record of what came back — it cannot be changed or deleted. Issue the material again to put a mistake right.';
end $$;

revoke all on function site_returns_immutable() from public, anon, authenticated;

drop trigger if exists site_returns_immutable on site_returns;
create trigger site_returns_immutable before update or delete on site_returns
  for each row execute function site_returns_immutable();
drop trigger if exists site_return_lines_immutable on site_return_lines;
create trigger site_return_lines_immutable before update or delete on site_return_lines
  for each row execute function site_returns_immutable();

-- 2 ------------------------------------------------------------------------------------------------------
create or replace function site_return_lines_qty_guard()
returns trigger
language plpgsql
as $$
declare
  v_plot uuid;
  v_store_active boolean;
  v_reached numeric;
begin
  select r.plot_id, s.is_active into v_plot, v_store_active
    from site_returns r join stores s on s.id = r.store_id
   where r.id = new.return_id;
  if v_plot is null then
    raise exception 'That return no longer exists';
  end if;
  if not v_store_active then
    raise exception 'That store is marked inactive in Masters';
  end if;

  -- The item's own unit, whatever was sent: stock is counted in it.
  select default_uom into new.uom from items where id = new.item_id;

  perform pg_advisory_xact_lock(hashtextextended('site_return:' || v_plot::text || new.item_id::text, 0));
  select coalesce(sum(quantity), 0) into v_reached
    from stock_by_location
   where location_kind = 'plot' and location_id = v_plot and item_id = new.item_id;
  if new.quantity > v_reached + 0.0005 then
    raise exception 'Only % % of this item reached that villa and is still there (returning %)',
      round(greatest(v_reached, 0), 3), new.uom, new.quantity;
  end if;
  return new;
end $$;

drop trigger if exists site_return_lines_qty_guard on site_return_lines;
create trigger site_return_lines_qty_guard before insert on site_return_lines
  for each row execute function site_return_lines_qty_guard();

-- 3 ------------------------------------------------------------------------------------------------------
alter table stock_batch_movements add column if not exists return_line_id uuid references site_return_lines (id);
create index if not exists stock_batch_movements_return_line_idx on stock_batch_movements (return_line_id)
  where return_line_id is not null;
alter table stock_batch_movements drop constraint if exists stock_batch_movements_one_cause;
alter table stock_batch_movements add constraint stock_batch_movements_one_cause
  check (num_nonnulls(issue_line_id, adjustment_id, return_line_id) = 1);

-- Definer, as the issue and adjustment allocations are: nobody but these triggers writes stock_batch_movements.
create or replace function site_return_lines_allocate()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_plot uuid;
  v_store uuid;
  b record;
  v_left numeric := new.quantity;
  v_take numeric;
begin
  select plot_id, store_id into v_plot, v_store from site_returns where id = new.return_id;
  for b in
    with issued as (
      select m.receipt_line_id, -sum(m.quantity) as quantity, max(si.issued_at) as last_issued
        from stock_batch_movements m
        join stock_issue_lines l on l.id = m.issue_line_id
        join stock_issues si on si.id = l.issue_id
       where si.plot_id = v_plot and l.item_id = new.item_id and m.quantity < 0
       group by m.receipt_line_id
    ),
    returned as (
      select m.receipt_line_id, sum(m.quantity) as quantity
        from stock_batch_movements m
        join site_return_lines rl on rl.id = m.return_line_id
        join site_returns r on r.id = rl.return_id
       where r.plot_id = v_plot and rl.item_id = new.item_id
       group by m.receipt_line_id
    )
    select i.receipt_line_id, i.quantity - coalesce(r.quantity, 0) as quantity
      from issued i left join returned r on r.receipt_line_id = i.receipt_line_id
     where i.quantity - coalesce(r.quantity, 0) > 0
     order by i.last_issued desc, i.receipt_line_id
  loop
    exit when v_left <= 0;
    v_take := least(v_left, b.quantity);
    insert into stock_batch_movements (receipt_line_id, store_id, quantity, return_line_id, created_by)
    values (b.receipt_line_id, v_store, v_take, new.id, auth.uid());
    v_left := v_left - v_take;
  end loop;
  return null;
end $$;

revoke all on function site_return_lines_allocate() from public, anon, authenticated;

drop trigger if exists site_return_lines_allocate on site_return_lines;
create trigger site_return_lines_allocate after insert on site_return_lines
  for each row execute function site_return_lines_allocate();

-- 4 ------------------------------------------------------------------------------------------------------
create or replace view stock_on_hand as
select m.store_id, m.item_id, sum(m.quantity) as quantity
from (
  select gr.store_id, l.item_id, l.quantity
  from goods_receipt_lines l
  join goods_receipts gr on gr.id = l.receipt_id
  where gr.store_id is not null

  union all

  select si.store_id, l.item_id, -l.quantity
  from stock_issue_lines l
  join stock_issues si on si.id = l.issue_id

  union all

  select si.to_store_id, l.item_id, l.quantity
  from stock_issue_lines l
  join stock_issues si on si.id = l.issue_id
  where si.to_store_id is not null

  union all

  select a.store_id, a.item_id, a.quantity
  from stock_adjustments a

  union all

  -- Material back from a villa (0159).
  select r.store_id, rl.item_id, rl.quantity
  from site_return_lines rl
  join site_returns r on r.id = rl.return_id
) m
group by m.store_id, m.item_id;

revoke all on stock_on_hand from public, anon;
revoke insert, update, delete, truncate on stock_on_hand from authenticated;
grant select on stock_on_hand to authenticated;

create or replace view stock_by_location as
-- A store's live balance, exactly as the guards see it.
select 'store'::text as location_kind, s.store_id as location_id,
       s.item_id, s.quantity
from stock_on_hand s

union all

-- A plot: everything that has landed there — straight off the lorry
-- (at the plot itself or at its unit, same place) plus everything
-- carried out of a store to it, less what went back to a store (0159).
-- Grouped so an item that arrived both ways shows one row.
select 'plot'::text as location_kind, m.location_id, m.item_id,
       sum(m.quantity) as quantity
from (
  select coalesce(u.plot_id, gr.plot_id) as location_id,
         l.item_id, l.quantity
  from goods_receipt_lines l
  join goods_receipts gr on gr.id = l.receipt_id
  left join units u on u.id = gr.unit_id
  where gr.to_site and coalesce(u.plot_id, gr.plot_id) is not null

  union all

  select si.plot_id, l.item_id, l.quantity
  from stock_issue_lines l
  join stock_issues si on si.id = l.issue_id
  where si.plot_id is not null

  union all

  select r.plot_id, rl.item_id, -rl.quantity
  from site_return_lines rl
  join site_returns r on r.id = rl.return_id
) m
group by m.location_id, m.item_id;

revoke all on stock_by_location from public, anon;
revoke insert, update, delete, truncate on stock_by_location from authenticated;
grant select on stock_by_location to authenticated;

-- 5 ------------------------------------------------------------------------------------------------------
create or replace function stock_lines_returned_guard()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_plot uuid;
begin
  if tg_table_name = 'stock_issue_lines' then
    select plot_id into v_plot from stock_issues where id = old.issue_id;
  else
    select coalesce(u.plot_id, gr.plot_id) into v_plot
      from goods_receipts gr left join units u on u.id = gr.unit_id
     where gr.id = old.receipt_id and gr.to_site;
  end if;
  if v_plot is not null and exists (
    select 1 from site_return_lines rl join site_returns r on r.id = rl.return_id
     where r.plot_id = v_plot and rl.item_id = old.item_id
  ) then
    raise exception 'Some of this material has come back from that villa since, so this cannot be deleted — correct it with an adjustment instead';
  end if;
  return old;
end $$;

revoke all on function stock_lines_returned_guard() from public, anon, authenticated;

drop trigger if exists stock_issue_lines_returned_guard on stock_issue_lines;
create trigger stock_issue_lines_returned_guard before delete on stock_issue_lines
  for each row execute function stock_lines_returned_guard();
drop trigger if exists goods_receipt_lines_returned_guard on goods_receipt_lines;
create trigger goods_receipt_lines_returned_guard before delete on goods_receipt_lines
  for each row execute function stock_lines_returned_guard();

-- 6 ------------------------------------------------------------------------------------------------------
create or replace view villa_cost_facts with (security_barrier = true) as
with villa as (
  select p.id as plot_id, u.id as unit_id from plots p left join units u on u.plot_id = p.id
),
official as (
  select e.id, e.unit_id from estimator_estimates e
   where e.status = 'submitted' and not e.is_template and e.unit_id is not null
),
estimated as (
  select v.plot_id, v.unit_id, c.work_item_id, null::uuid as work_group_id, 'estimated_labour'::text as kind,
         c.labour_cost as amount, c.labour_cost is null as unpriced
    from estimator_estimate_line_costs c
    join official o on o.id = c.estimate_id
    join villa v on v.unit_id = o.unit_id
  union all
  select v.plot_id, v.unit_id, c.work_item_id, null::uuid, 'estimated_material', c.material_cost, c.material_cost is null
    from estimator_estimate_line_costs c
    join official o on o.id = c.estimate_id
    join villa v on v.unit_id = o.unit_id
),
indent_villa as (
  select il.id as indent_line_id, i.work_item_id, i.work_group_id,
         coalesce(i.plot_id, (select u.plot_id from units u where u.id = i.unit_id)) as plot_id
    from indent_lines il join indents i on i.id = il.indent_id
),
po_committed as (
  select iv.plot_id, iv.work_item_id, iv.work_group_id, 'po_committed'::text as kind,
         l.quantity * l.rate - coalesce(l.quantity * l.rate * l.discount_pct / 100, 0) - coalesce(l.discount_amount, 0) as amount,
         l.rate is null as unpriced
    from purchase_order_lines l
    join purchase_orders po on po.id = l.po_id and po.status in ('issued', 'deletion_requested', 'completed')
    join indent_villa iv on iv.indent_line_id = l.indent_line_id
),
issued_line as (
  select si.plot_id, si.work_item_id, sil.quantity,
         -- An issue's movements leave the store, so they are negative: the villa received their opposite (0159 fixes
         -- 0136, which counted every issue below zero and partly priced).
         sum(-m.quantity * r.rate) as valued,
         coalesce(sum(-m.quantity) filter (where r.rate is not null), 0) as valued_quantity
    from stock_issue_lines sil
    join stock_issues si on si.id = sil.issue_id and si.plot_id is not null
    left join stock_batch_movements m on m.issue_line_id = sil.id
    left join goods_receipt_line_rates r on r.receipt_line_id = m.receipt_line_id
   group by sil.id, si.plot_id, si.work_item_id, sil.quantity
),
material_spent as (
  select plot_id, work_item_id, 'material_issued'::text as kind,
         coalesce(valued, 0) as amount, valued_quantity < quantity as unpriced
    from issued_line
  union all
  select gr.plot_id, gr.work_item_id, 'material_delivered',
         grl.quantity * r.rate, r.rate is null
    from goods_receipt_lines grl
    join goods_receipts gr on gr.id = grl.receipt_id and gr.to_site
    left join goods_receipt_line_rates r on r.receipt_line_id = grl.id
  union all
  -- A return takes its value, at the batches it went back into, off the villa's material (0159). It names no work.
  select r.plot_id, null::uuid, 'material_issued',
         -coalesce(rv.valued, 0), coalesce(rv.valued_quantity, 0) < rl.quantity
    from site_return_lines rl
    join site_returns r on r.id = rl.return_id
    left join lateral (
      select sum(m.quantity * gr.rate) as valued,
             sum(m.quantity) filter (where gr.rate is not null) as valued_quantity
        from stock_batch_movements m
        left join goods_receipt_line_rates gr on gr.receipt_line_id = m.receipt_line_id
       where m.return_line_id = rl.id
    ) rv on true
),
wo_committed as (
  select coalesce(lc.plot_id, (select u.plot_id from units u where u.id = lc.unit_id)) as plot_id,
         l.work_item_id, 'wo_committed'::text as kind,
         coalesce(l.quantity, 1) * l.rate as amount, false as unpriced
    from labour_contract_lines l
    join labour_contracts lc on lc.id = l.contract_id and lc.status = 'approved' and lc.is_active
),
billed as (
  select coalesce(ll.plot_id, b.plot_id, (select u.plot_id from units u where u.id = b.unit_id), iv.plot_id) as plot_id,
         coalesce(bl.work_item_id, ll.work_item_id, iv.work_item_id) as work_item_id,
         case when coalesce(bl.work_item_id, ll.work_item_id, iv.work_item_id) is null then iv.work_group_id end as work_group_id,
         case when b.kind = 'po' then 'material_billed' else 'labour_billed' end as kind,
         coalesce(bl.quantity, 1) * bl.rate - coalesce(bl.discount_amount, 0) as amount,
         false as unpriced
    from bill_lines bl
    join bills b on b.id = bl.bill_id
    left join labour_logs ll on ll.id = bl.labour_log_id
    left join purchase_order_lines pl on pl.id = bl.po_line_id
    left join indent_villa iv on iv.indent_line_id = pl.indent_line_id
),
everything as (
  select plot_id, work_item_id, work_group_id, kind, amount, unpriced from estimated
  union all select plot_id, work_item_id, work_group_id, kind, amount, unpriced from po_committed
  union all select plot_id, work_item_id, null::uuid, kind, amount, unpriced from material_spent
  union all select plot_id, work_item_id, null::uuid, kind, amount, unpriced from wo_committed
  union all select plot_id, work_item_id, work_group_id, kind, amount, unpriced from billed
)
select e.plot_id,
       v.unit_id,
       e.work_item_id,
       e.kind,
       round(sum(coalesce(e.amount, 0)), 2) as amount,
       bool_or(e.unpriced or e.amount is null) as unpriced,
       e.work_group_id
  from everything e
  join villa v on v.plot_id = e.plot_id
 where has_app('/estimator') or has_app('/bills') or has_app('/reporter')
 group by e.plot_id, v.unit_id, e.work_item_id, e.kind, e.work_group_id;

revoke insert, update, delete, truncate on villa_cost_facts from anon, authenticated;
revoke all on villa_cost_facts from anon;
grant select on villa_cost_facts to authenticated;

-- Checks ---------------------------------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_class where relname = 'site_returns' and relrowsecurity)
     or not exists (select 1 from pg_class where relname = 'site_return_lines' and relrowsecurity) then
    raise exception '0159: a returns table has RLS off';
  end if;
  if has_table_privilege('anon', 'site_returns', 'select')
     or has_table_privilege('anon', 'site_return_lines', 'select') then
    raise exception '0159: anon can read returns';
  end if;
  if not (select prosecdef from pg_proc where oid = 'site_return_lines_allocate()'::regprocedure)
     or has_function_privilege('authenticated', 'site_return_lines_allocate()', 'execute') then
    raise exception '0159: the allocation must be a trigger-only definer';
  end if;
  if has_function_privilege('authenticated', 'stock_lines_returned_guard()', 'execute') then
    raise exception '0159: the delete guard is executable by a client role';
  end if;
  if position('site_return_lines' in pg_get_viewdef('stock_on_hand'::regclass)) = 0
     or position('site_return_lines' in pg_get_viewdef('stock_by_location'::regclass)) = 0 then
    raise exception '0159: a stock view leaves returns out';
  end if;
  if position('has_app(''/estimator''' in pg_get_viewdef('villa_cost_facts'::regclass)) = 0 then
    raise exception '0159: villa_cost_facts must keep its gate';
  end if;
end $$;
