-- 0136 — Budget against actual per villa, and stage billing on work orders (plan.md, OS process
-- updates, Wave 3c). DRAFT FOR A FABLE REVIEW: two money views and a bill-line guard. Not applied.
--
-- 1. villa_cost_facts: per villa and work, what the official estimate said (labour and material
--    apart), what was committed (POs bought for the villa's indents, approved work orders), and
--    what was spent (material issued at its batch rates or delivered straight to site, labour and
--    material billed). Every figure before GST. A row whose rate is unknown carries what is known
--    and says unpriced, so the screen prints "unknown", never ₹0 (BUGCATCHER #13). Gated in its
--    own WHERE to /estimator, /bills and /reporter (founder, 2026-10-22: estimator and bills
--    holders see it). The Estimator's estimate figures reach /bills only through this view.
-- 2. bill_lines.labour_contract_line_id: a bill names which line of its work order it bills, so a
--    Superstructure or MEP order with one line per stage package is paid stage by stage.
--    work_order_line_billing_facts shows each line's value and what is billed against it.

-- 2a. A bill line names its work order line ------------------------------------------------------
alter table bill_lines add column if not exists labour_contract_line_id uuid references labour_contract_lines (id);
create index if not exists bill_lines_labour_contract_line on bill_lines (labour_contract_line_id)
  where labour_contract_line_id is not null;

create or replace function bill_lines_guard()
returns trigger
language plpgsql
as $$
declare
  v_bill uuid;
  v_status text;
  v_po uuid;
  v_contract uuid;
begin
  v_bill := case when tg_op = 'DELETE' then old.bill_id else new.bill_id end;
  select status, po_id, labour_contract_id into v_status, v_po, v_contract from bills where id = v_bill for share;
  if v_status is distinct from 'recorded' then
    raise exception 'This bill is % — its lines can no longer change', coalesce(v_status, 'gone');
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  if tg_op = 'UPDATE' and new.bill_id <> old.bill_id then
    raise exception 'A line stays on the bill it was made on';
  end if;
  -- po_line_billing_facts, not purchase_order_lines: the billing team
  -- holds /bills, and the view admits /purchase-orders or /bills.
  if new.po_line_id is not null and not exists (
    select 1 from po_line_billing_facts f where f.po_line_id = new.po_line_id and f.po_id = v_po
  ) then
    raise exception 'That material is not on this bill''s purchase order';
  end if;
  -- A work order line is /bills' own table, readable by whoever writes a bill line.
  if new.labour_contract_line_id is not null and not exists (
    select 1 from labour_contract_lines l where l.id = new.labour_contract_line_id and l.contract_id = v_contract
  ) then
    raise exception 'That stage is not on this bill''s work order';
  end if;
  return new;
end $$;

-- 2b. Each work order line, its value and what is billed against it -----------------------------
create or replace view work_order_line_billing_facts with (security_barrier = true) as
select l.id as labour_contract_line_id,
       l.contract_id,
       l.work_item_id,
       round(coalesce(l.quantity, 1) * l.rate, 2) as line_value,
       coalesce(round(sum(coalesce(bl.quantity, 1) * bl.rate - coalesce(bl.discount_amount, 0)), 2), 0) as billed_value
  from labour_contract_lines l
  left join bill_lines bl on bl.labour_contract_line_id = l.id
 where has_app('/bills') or has_app('/reporter')
 group by l.id, l.contract_id, l.work_item_id, l.quantity, l.rate;

revoke insert, update, delete, truncate on work_order_line_billing_facts from anon, authenticated;
revoke all on work_order_line_billing_facts from anon;
grant select on work_order_line_billing_facts to authenticated;

-- 1. The villa's costs ------------------------------------------------------------------------------
create or replace view villa_cost_facts with (security_barrier = true) as
with villa as (
  select p.id as plot_id, u.id as unit_id from plots p left join units u on u.plot_id = p.id
),
official as (
  select e.id, e.unit_id from estimator_estimates e
   where e.status = 'submitted' and not e.is_template and e.unit_id is not null
),
estimated as (
  select v.plot_id, v.unit_id, c.work_item_id, 'estimated_labour'::text as kind,
         c.labour_cost as amount, c.labour_cost is null as unpriced
    from estimator_estimate_line_costs c
    join official o on o.id = c.estimate_id
    join villa v on v.unit_id = o.unit_id
  union all
  select v.plot_id, v.unit_id, c.work_item_id, 'estimated_material', c.material_cost, c.material_cost is null
    from estimator_estimate_line_costs c
    join official o on o.id = c.estimate_id
    join villa v on v.unit_id = o.unit_id
),
indent_villa as (
  select il.id as indent_line_id, i.work_item_id,
         coalesce(i.plot_id, (select u.plot_id from units u where u.id = i.unit_id)) as plot_id
    from indent_lines il join indents i on i.id = il.indent_id
),
po_committed as (
  select iv.plot_id, iv.work_item_id, 'po_committed'::text as kind,
         l.quantity * l.rate - coalesce(l.quantity * l.rate * l.discount_pct / 100, 0) - coalesce(l.discount_amount, 0) as amount,
         l.rate is null as unpriced
    from purchase_order_lines l
    join purchase_orders po on po.id = l.po_id and po.status in ('issued', 'deletion_requested', 'completed')
    join indent_villa iv on iv.indent_line_id = l.indent_line_id
),
issued_line as (
  select si.plot_id, si.work_item_id, sil.quantity,
         sum(m.quantity * r.rate) as valued,
         coalesce(sum(m.quantity) filter (where r.rate is not null), 0) as valued_quantity
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
  select plot_id, work_item_id, kind, amount, unpriced from estimated
  union all select plot_id, work_item_id, kind, amount, unpriced from po_committed
  union all select plot_id, work_item_id, kind, amount, unpriced from material_spent
  union all select plot_id, work_item_id, kind, amount, unpriced from wo_committed
  union all select plot_id, work_item_id, kind, amount, unpriced from billed
)
select e.plot_id,
       v.unit_id,
       e.work_item_id,
       e.kind,
       round(sum(coalesce(e.amount, 0)), 2) as amount,
       bool_or(e.unpriced or e.amount is null) as unpriced
  from everything e
  join villa v on v.plot_id = e.plot_id
 where has_app('/estimator') or has_app('/bills') or has_app('/reporter')
 group by e.plot_id, v.unit_id, e.work_item_id, e.kind;

revoke insert, update, delete, truncate on villa_cost_facts from anon, authenticated;
revoke all on villa_cost_facts from anon;
grant select on villa_cost_facts to authenticated;

-- Checks ----------------------------------------------------------------------------------------
do $$
begin
  if position('has_app(''/estimator''' in pg_get_viewdef('villa_cost_facts'::regclass)) = 0
     or position('has_app(''/bills''' in pg_get_viewdef('villa_cost_facts'::regclass)) = 0 then
    raise exception '0136: villa_cost_facts must keep its gate';
  end if;
  if position('has_app(''/bills''' in pg_get_viewdef('work_order_line_billing_facts'::regclass)) = 0 then
    raise exception '0136: work_order_line_billing_facts must keep its gate';
  end if;
  if has_table_privilege('authenticated', 'villa_cost_facts', 'insert')
     or has_table_privilege('authenticated', 'work_order_line_billing_facts', 'update') then
    raise exception '0136: both views must stay read-only';
  end if;
end $$;
