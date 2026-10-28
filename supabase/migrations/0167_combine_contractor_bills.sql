-- 0167 — Combine a contractor's bills (plan.md, founder 2026-10-28): several bills of one contractor, one company and
-- one kind (PW or NMR) become one. The oldest keeps its number; the others' lines move onto it, each naming its villa
-- (0166), their labour entries follow, and they are deleted, their numbers staying spent as a deleted bill's do.
--
-- combine_contractor_bills(p_bill_ids) is a bill approver's or an admin's, as a send-back is. A bill may be recorded,
-- or approved with no money on it (it is sent back on the way). Refused, naming the bill: any payment or recovery on
-- record, a place on a cash request, additional charges, a total set by hand, or no lines. The kept bill comes out
-- recorded, waiting for approval, its note naming the bills it took in, with their own references and notes.
--
-- villa_cost_facts: a line falls back to its bill's villa only when it names none of its own. A line naming a whole
-- project is on no villa, even on its header's project (0166 put it on the header's villa).
--
-- Re-runnable.

create or replace function combine_contractor_bills(p_bill_ids uuid[])
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[];
  v_keep uuid;
  v_others uuid[];
  v_refs text;
  v_notes text;
  v_sort int;
  r record;
begin
  if not has_app('/bills') then
    raise exception 'Only the Bills tool can combine bills';
  end if;
  if not (is_admin() or can_approve_bills(auth.uid())) then
    raise exception 'Only a named bill approver or an admin can combine bills';
  end if;
  v_ids := array(select distinct unnest(p_bill_ids));
  if cardinality(v_ids) < 2 then
    raise exception 'Tick at least two bills to combine';
  end if;

  perform 1 from bills where id = any(v_ids) order by id for update;
  if (select count(*) from bills where id = any(v_ids)) <> cardinality(v_ids) then
    raise exception 'Some of those bills no longer exist — refresh and tick again';
  end if;
  if exists (
    select 1 from bills b left join vendors v on v.id = b.vendor_id
     where b.id = any(v_ids) and (b.kind <> 'nmr' or not coalesce(v.is_contractor, false))
  ) then
    raise exception 'Only contractors'' labour bills can be combined';
  end if;
  if (select count(distinct vendor_id) from bills where id = any(v_ids)) <> 1 then
    raise exception 'Combined bills are one contractor''s — tick bills of one contractor';
  end if;
  if (select count(distinct work_type) from bills where id = any(v_ids)) <> 1 then
    raise exception 'PW and NMR bills stay separate — tick bills of one kind';
  end if;
  if (select count(distinct p.company_id) <> 1 or bool_or(p.company_id is null)
        from bills b join projects p on p.id = b.project_id where b.id = any(v_ids)) then
    raise exception 'Combined bills are one company''s — tick bills of one company''s projects';
  end if;

  for r in select b.* from bills b where b.id = any(v_ids) order by b.created_at, b.id loop
    if r.status not in ('recorded', 'approved') then
      raise exception '% is % — it can''t be combined', r.reference, r.status;
    end if;
    if exists (select 1 from bill_payments where bill_id = r.id)
       or exists (select 1 from advance_recoveries where bill_id = r.id) then
      raise exception '% has money on record — it stays as it is', r.reference;
    end if;
    if exists (select 1 from cash_request_items where bill_id = r.id) then
      raise exception '% is on a cash request — take it off first', r.reference;
    end if;
    if coalesce(r.charges_amount, 0) <> 0 then
      raise exception '% has additional charges — put them on a line first', r.reference;
    end if;
    if r.total_override_note is not null then
      raise exception '% has its total set by hand — clear it first', r.reference;
    end if;
    if not exists (select 1 from bill_lines where bill_id = r.id) then
      raise exception '% has no lines — give it lines first', r.reference;
    end if;
    if v_keep is null then
      v_keep := r.id;
    else
      v_others := v_others || r.id;
      v_refs := concat_ws(', ', v_refs, r.reference
        || case when nullif(trim(r.invoice_no), '') is distinct from r.reference
                then ' (their ' || r.invoice_no || ', ' || to_char(r.invoice_date, 'DD Mon') || ')' else '' end);
      if nullif(trim(r.note), '') is not null then
        v_notes := concat_ws(E'\n', v_notes, r.reference || ': ' || trim(r.note));
      end if;
    end if;
  end loop;

  -- An approved bill goes back to recorded first, exactly as a send-back takes it (bills_guard checks the same).
  update bills
     set status = 'recorded', approved_by = null, approved_at = null,
         rejection_note = 'Combined with other bills — approve the combined bill',
         updated_by = auth.uid()
   where id = any(v_ids) and status = 'approved';

  -- A line with no villa of its own was on its bill's; on the kept bill it names that villa, or that bill's whole
  -- project when its bill named no villa (never the kept bill's villa: villa_cost_facts below).
  select coalesce(max(sort_order), 0) into v_sort from bill_lines where bill_id = v_keep;
  insert into bill_lines (
    bill_id, sort_order, line_kind, po_line_id, item_id, labour_log_id, labour_contract_line_id, work_item_id,
    description, uom, quantity, rate, gst_pct, discount_amount, other_charges, note,
    project_id, plot_id, unit_id, created_by, updated_by
  )
  select v_keep, v_sort + row_number() over (order by b.created_at, b.id, l.sort_order, l.id)::int,
         l.line_kind, l.po_line_id, l.item_id, l.labour_log_id, l.labour_contract_line_id, l.work_item_id,
         l.description, l.uom, l.quantity, l.rate, l.gst_pct, l.discount_amount, l.other_charges, l.note,
         case when own.none then b.project_id else l.project_id end,
         case when own.none then b.plot_id else l.plot_id end,
         case when own.none then b.unit_id else l.unit_id end,
         l.created_by, auth.uid()
    from bill_lines l
    join bills b on b.id = l.bill_id
    cross join lateral (select l.project_id is null and l.plot_id is null and l.unit_id is null as none) own
   where l.bill_id = any(v_others);

  perform set_config('toolbox.labour_billing', 'on', true);
  update labour_logs set bill_id = v_keep, updated_by = auth.uid() where bill_id = any(v_others);
  perform set_config('toolbox.labour_billing', '', true);
  delete from bill_lines where bill_id = any(v_others);
  delete from bills where id = any(v_others);

  update bills
     set note = concat_ws(E'\n', note, 'Combined with ' || v_refs || '.', v_notes), updated_by = auth.uid()
   where id = v_keep;
  return v_keep;
end $$;

revoke all on function combine_contractor_bills(uuid[]) from public, anon;
grant execute on function combine_contractor_bills(uuid[]) to authenticated;

-- villa_cost_facts, as 0166 left it, but for whole-project lines -------------------------------------------------
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
         -- An issue's movements leave the store, so they are negative: the villa received their opposite.
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
  -- A delivery to a house names its unit, not its plot: the villa is the unit's plot.
  select coalesce(u.plot_id, gr.plot_id), gr.work_item_id, 'material_delivered',
         grl.quantity * r.rate, r.rate is null
    from goods_receipt_lines grl
    join goods_receipts gr on gr.id = grl.receipt_id and gr.to_site
    left join units u on u.id = gr.unit_id
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
  -- The header's villa only for a line naming none of its own: one naming a whole project is on no villa.
  select coalesce(ll.plot_id, bl.plot_id, (select u.plot_id from units u where u.id = bl.unit_id),
                  case when bl.project_id is null
                       then coalesce(b.plot_id, (select u.plot_id from units u where u.id = b.unit_id)) end,
                  iv.plot_id) as plot_id,
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
  if not (select prosecdef from pg_proc where oid = 'combine_contractor_bills(uuid[])'::regprocedure) then
    raise exception '0167: combine_contractor_bills must be a definer, to move the labour entries';
  end if;
  if has_function_privilege('anon', 'combine_contractor_bills(uuid[])', 'execute') then
    raise exception '0167: anon can combine bills';
  end if;
  if position('has_app(''/estimator''' in pg_get_viewdef('villa_cost_facts'::regclass)) = 0
     or has_table_privilege('authenticated', 'villa_cost_facts', 'insert') then
    raise exception '0167: villa_cost_facts must keep its gate and stay read-only';
  end if;
end $$;
