-- 0166 — Combined contractor bills (plan.md, founder 2026-10-28): one bill per contractor per company, each line
-- naming its villa, instead of a bill per villa.
--
-- 1. bill_lines.project_id, plot_id, unit_id: the line's villa. Null means the bill's own, so every bill made before
--    reads as it did.
-- 2. bill_lines_guard: a line's villa fills its project; on a contractor's labour bill (kind nmr, a contractor) it
--    may be any villa of the header project's company; on any other bill only the header's own.
-- 3. send_labour_logs_to_bill: several projects of one company on one bill (still one with a work order), the
--    header on the project with the most entries; daily wages a line per trade per villa; every line its villa.
-- 4. villa_cost_facts: a billed line's villa is its log's, else its own, else the header's, else its indent's.
--
-- Re-runnable throughout.

-- 1. A line's villa -------------------------------------------------------------------------------------------
alter table bill_lines add column if not exists project_id uuid references projects (id);
alter table bill_lines add column if not exists plot_id uuid references plots (id);
alter table bill_lines add column if not exists unit_id uuid references units (id);

alter table bill_lines drop constraint if exists bill_lines_one_villa;
alter table bill_lines add constraint bill_lines_one_villa check (plot_id is null or unit_id is null);

create index if not exists bill_lines_project_idx on bill_lines (project_id);
create index if not exists bill_lines_plot_idx on bill_lines (plot_id);
create index if not exists bill_lines_unit_idx on bill_lines (unit_id);

-- 2. The guard, as 0156 left it, with the villa rules last ---------------------------------------------------------
create or replace function bill_lines_guard()
returns trigger
language plpgsql
as $$
declare
  v_bill uuid;
  v_status text;
  v_po uuid;
  v_contract uuid;
  v_received numeric;
  v_billed numeric;
  v_header record;
  v_villa_project uuid;
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
  -- Only what arrived is billed: checked when a line's quantity rises or it moves to another PO line.
  if new.po_line_id is not null
     and (tg_op = 'INSERT'
          or new.po_line_id is distinct from old.po_line_id
          or coalesce(new.quantity, 0) > coalesce(old.quantity, 0)) then
    perform pg_advisory_xact_lock(hashtextextended('bill_lines_po_line:' || new.po_line_id::text, 0));
    select received_quantity into v_received from po_line_billing_facts where po_line_id = new.po_line_id;
    select coalesce(sum(quantity), 0) into v_billed
      from bill_lines where po_line_id = new.po_line_id and id <> new.id;
    if v_billed + coalesce(new.quantity, 0) > coalesce(v_received, 0) + 0.0005 then
      raise exception 'Only % of this material has arrived and is not yet billed — bill what was received',
        round(greatest(coalesce(v_received, 0) - v_billed, 0), 3);
    end if;
  end if;
  -- A work order line is /bills' own table, readable by whoever writes a bill line.
  if new.labour_contract_line_id is not null and not exists (
    select 1 from labour_contract_lines l where l.id = new.labour_contract_line_id and l.contract_id = v_contract
  ) then
    raise exception 'That stage is not on this bill''s work order';
  end if;

  -- The line's villa. Projects, plots, units and vendors are readable by everyone signed in.
  if new.plot_id is null and new.unit_id is null and new.project_id is null then
    return new;
  end if;
  if new.unit_id is not null then
    select project_id into v_villa_project from units where id = new.unit_id;
  elsif new.plot_id is not null then
    select project_id into v_villa_project from plots where id = new.plot_id;
  end if;
  if v_villa_project is not null then
    if new.project_id is not null and new.project_id <> v_villa_project then
      raise exception 'That villa is not in that project';
    end if;
    new.project_id := v_villa_project;
  end if;

  select b.kind, b.project_id, b.plot_id, b.unit_id, p.company_id,
         coalesce((select v.is_contractor from vendors v where v.id = b.vendor_id), false) as by_contractor
    into v_header
    from bills b join projects p on p.id = b.project_id
   where b.id = new.bill_id;
  if v_header.kind = 'nmr' and v_header.by_contractor then
    if new.project_id <> v_header.project_id
       and (v_header.company_id is null
            or v_header.company_id is distinct from (select company_id from projects where id = new.project_id)) then
      raise exception 'That project is another company''s — a contractor''s bill is for one company';
    end if;
  elsif new.project_id is distinct from v_header.project_id
        or (new.plot_id is not null and new.plot_id is distinct from v_header.plot_id)
        or (new.unit_id is not null and new.unit_id is distinct from v_header.unit_id) then
    raise exception 'Only a contractor''s labour bill can put its lines on different villas';
  end if;
  return new;
end $$;

-- 3. Send to Bill, as 0165 left it, across one company's projects -------------------------------------------------
create or replace function send_labour_logs_to_bill(
  p_log_ids uuid[], p_labour_contract_id uuid, p_bill_reference text, p_bill_date date,
  p_rates jsonb, p_total_override numeric, p_override_note text, p_note text
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_count int;
  v_kinds text[];
  v_contractors uuid[];
  v_projects uuid[];
  v_plots uuid[];
  v_main_project uuid;
  v_is_nmr boolean;
  v_bill uuid;
  v_masons numeric;
  v_helpers numeric;
  v_others numeric;
  v_gst numeric;
  v_total numeric;
  v_contract record;
  r record;
  v_rate numeric;
  v_line_gst numeric;
  v_sort int := 0;
begin
  if not has_app('/bills') then
    raise exception 'Only the Bills tool can send labour to a bill';
  end if;
  if p_log_ids is null or cardinality(p_log_ids) = 0 then
    raise exception 'Tick at least one labour entry';
  end if;
  if p_bill_date is null then
    raise exception 'Pick the bill date';
  end if;

  -- Lock the logs so two people cannot bill the same day twice.
  perform 1 from labour_logs where id = any(p_log_ids) for update;

  select count(*),
         array_agg(distinct case when l.kind = 'nmr' then 'nmr' else 'pw' end),
         array_agg(distinct l.contractor_id),
         array_agg(distinct p.project_id),
         array_agg(distinct l.plot_id)
  into v_count, v_kinds, v_contractors, v_projects, v_plots
  from labour_logs l join plots p on p.id = l.plot_id
  where l.id = any(p_log_ids);

  if v_count <> cardinality(p_log_ids) then
    raise exception 'Some of those entries no longer exist — refresh and tick again';
  end if;
  if exists (select 1 from labour_logs where id = any(p_log_ids) and bill_id is not null) then
    raise exception 'Some of those entries are already billed — refresh and tick again';
  end if;
  if cardinality(v_kinds) <> 1 then
    raise exception 'Daily wages and piece-work go on separate bills — tick one kind';
  end if;
  if cardinality(v_contractors) <> 1 then
    raise exception 'A bill is for one contractor — tick entries of one contractor';
  end if;
  if cardinality(v_projects) > 1 then
    if p_labour_contract_id is not null then
      raise exception 'A bill against a work order is for its one project — tick entries of that project';
    end if;
    if (select count(distinct company_id) <> 1 or bool_or(company_id is null)
          from projects where id = any(v_projects)) then
      raise exception 'A bill is for one company — tick entries of one company''s projects';
    end if;
  end if;

  -- The header sits on the project with the most entries; every line names its own villa.
  select p.project_id into v_main_project
    from labour_logs l join plots p on p.id = l.plot_id join projects pr on pr.id = p.project_id
   where l.id = any(p_log_ids)
   group by p.project_id, pr.name
   order by count(*) desc, pr.name
   limit 1;

  v_is_nmr := v_kinds[1] = 'nmr';

  if v_is_nmr then
    if p_labour_contract_id is not null then
      raise exception 'Daily wages are billed without a work order';
    end if;
    select sum(masons), sum(helpers), sum(others)
      into v_masons, v_helpers, v_others
      from labour_logs where id = any(p_log_ids);
    v_gst := coalesce((p_rates ->> 'gst_pct')::numeric, 0);
    if (v_masons > 0 and (p_rates ->> 'mason') is null)
       or (v_helpers > 0 and (p_rates ->> 'helper') is null)
       or (v_others > 0 and (p_rates ->> 'other') is null) then
      raise exception 'Give a day rate for every trade on these entries';
    end if;
    v_total := round(
      (v_masons * coalesce((p_rates ->> 'mason')::numeric, 0)
       + v_helpers * coalesce((p_rates ->> 'helper')::numeric, 0)
       + v_others * coalesce((p_rates ->> 'other')::numeric, 0)) * (1 + v_gst / 100), 2);
    if p_total_override is not null then
      if p_override_note is null or length(trim(p_override_note)) = 0 then
        raise exception 'Say why the total differs from heads × rates';
      end if;
      v_total := p_total_override;
    end if;
    if v_total <= 0 then
      raise exception 'The bill total must be more than zero';
    end if;

    v_bill := create_nmr_bill(
      v_contractors[1], v_main_project,
      case when cardinality(v_plots) = 1 then v_plots[1] else null end, null,
      p_bill_reference, p_bill_date, v_total, 0, v_total, p_note
    );

    if p_total_override is not null then
      update bills set total_override_note = trim(p_override_note) where id = v_bill;
    end if;

    -- A line per trade per villa, so each villa's cost stays its own.
    for r in
      select l.plot_id, p.project_id, sum(l.masons) as masons, sum(l.helpers) as helpers, sum(l.others) as others
        from labour_logs l join plots p on p.id = l.plot_id join projects pr on pr.id = p.project_id
       where l.id = any(p_log_ids)
       group by l.plot_id, p.project_id, pr.name, p.code
       order by pr.name, p.code
    loop
      if r.masons > 0 then
        v_sort := v_sort + 1;
        insert into bill_lines (bill_id, sort_order, line_kind, description, quantity, rate, gst_pct, project_id, plot_id, created_by, updated_by)
        values (v_bill, v_sort, 'nmr', 'Masons (man-days)', r.masons, (p_rates ->> 'mason')::numeric, v_gst, r.project_id, r.plot_id, auth.uid(), auth.uid());
      end if;
      if r.helpers > 0 then
        v_sort := v_sort + 1;
        insert into bill_lines (bill_id, sort_order, line_kind, description, quantity, rate, gst_pct, project_id, plot_id, created_by, updated_by)
        values (v_bill, v_sort, 'nmr', 'Helpers (man-days)', r.helpers, (p_rates ->> 'helper')::numeric, v_gst, r.project_id, r.plot_id, auth.uid(), auth.uid());
      end if;
      if r.others > 0 then
        v_sort := v_sort + 1;
        insert into bill_lines (bill_id, sort_order, line_kind, description, quantity, rate, gst_pct, project_id, plot_id, created_by, updated_by)
        values (v_bill, v_sort, 'nmr', 'Other labour (man-days)', r.others, (p_rates ->> 'other')::numeric, v_gst, r.project_id, r.plot_id, auth.uid(), auth.uid());
      end if;
    end loop;
  else
    if p_labour_contract_id is not null then
      select id, vendor_id, project_id, status, is_active into v_contract
        from labour_contracts where id = p_labour_contract_id;
      if not found or v_contract.status <> 'approved' or not v_contract.is_active then
        raise exception 'That work order is not approved and active';
      end if;
      if v_contract.vendor_id <> v_contractors[1] or v_contract.project_id <> v_main_project then
        raise exception 'That work order is for another contractor or project';
      end if;
    end if;

    -- Price every log first, so the bill is created with its true total.
    v_total := 0;
    for r in select l.* from labour_logs l where l.id = any(p_log_ids) loop
      v_rate := (p_rates -> r.id::text ->> 'rate')::numeric;
      v_line_gst := coalesce((p_rates -> r.id::text ->> 'gst_pct')::numeric, 0);
      if v_rate is null or v_rate < 0 then
        raise exception 'Give a rate for every piece-work entry';
      end if;
      v_total := v_total + round(coalesce(r.quantity, 1) * v_rate * (1 + v_line_gst / 100), 2);
    end loop;
    if v_total <= 0 then
      raise exception 'The bill total must be more than zero';
    end if;

    -- With a work order the bill hangs on it; without one it is a direct labour bill for the contractor.
    if p_labour_contract_id is not null then
      v_bill := create_bill(null, p_labour_contract_id, p_bill_reference, p_bill_date,
                            v_total, 0, v_total, p_note);
    else
      v_bill := create_nmr_bill(
        v_contractors[1], v_main_project,
        case when cardinality(v_plots) = 1 then v_plots[1] else null end, null,
        p_bill_reference, p_bill_date, v_total, 0, v_total, p_note, true
      );
    end if;

    -- A named entry has no work: its line carries the name where the work's name and code would be.
    for r in
      select l.*, w.code as work_code, w.name as work_name, p.project_id as villa_project_id
      from labour_logs l
      join plots p on p.id = l.plot_id
      join projects pr on pr.id = p.project_id
      left join work_items w on w.id = l.work_item_id
      where l.id = any(p_log_ids)
      order by pr.name, p.code, l.log_date, w.code nulls last, l.custom_name
    loop
      v_sort := v_sort + 1;
      insert into bill_lines (
        bill_id, sort_order, line_kind, labour_log_id, work_item_id, description,
        uom, quantity, rate, gst_pct, project_id, plot_id, created_by, updated_by
      ) values (
        v_bill, v_sort, r.kind, r.id, r.work_item_id,
        case when r.kind = 'pw_lump'
               then trim(r.description) || ' (' || coalesce(r.work_code, trim(r.custom_name)) || ', ' || to_char(r.log_date, 'DD Mon') || ')'
             when r.work_item_id is null
               then trim(r.custom_name) || ' (' || to_char(r.log_date, 'DD Mon') || ')'
             else r.work_name || ' — ' || r.work_code || ' (' || to_char(r.log_date, 'DD Mon') || ')' end
          || case when r.work_class = 'additional' then ' · Additional work'
                  when r.work_class = 'rework' then ' · Rework' else '' end,
        case when r.kind = 'pw_qty' then r.uom else null end,
        case when r.kind = 'pw_qty' then r.quantity else null end,
        (p_rates -> r.id::text ->> 'rate')::numeric,
        coalesce((p_rates -> r.id::text ->> 'gst_pct')::numeric, 0),
        r.villa_project_id, r.plot_id,
        auth.uid(), auth.uid()
      );
    end loop;
  end if;

  perform set_config('toolbox.labour_billing', 'on', true);
  update labour_logs set bill_id = v_bill, updated_by = auth.uid() where id = any(p_log_ids);
  perform set_config('toolbox.labour_billing', '', true);

  return v_bill;
end $$;

revoke all on function send_labour_logs_to_bill(uuid[], uuid, text, date, jsonb, numeric, text, text) from public, anon;

-- 4. Villa costs read the line's villa ------------------------------------------------------------------------
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
  select coalesce(ll.plot_id, bl.plot_id, (select u.plot_id from units u where u.id = bl.unit_id),
                  b.plot_id, (select u.plot_id from units u where u.id = b.unit_id), iv.plot_id) as plot_id,
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
  if (select count(*) from information_schema.columns
       where table_name = 'bill_lines' and column_name in ('project_id', 'plot_id', 'unit_id')) <> 3 then
    raise exception '0166: a bill line''s villa columns are missing';
  end if;
  if (select prosecdef from pg_proc where oid = 'bill_lines_guard()'::regprocedure) then
    raise exception '0166: the line guard must run as the person saving the line';
  end if;
  if has_function_privilege('anon', 'send_labour_logs_to_bill(uuid[], uuid, text, date, jsonb, numeric, text, text)', 'execute') then
    raise exception '0166: anon can send labour to a bill';
  end if;
  if position('has_app(''/estimator''' in pg_get_viewdef('villa_cost_facts'::regclass)) = 0
     or has_table_privilege('authenticated', 'villa_cost_facts', 'insert') then
    raise exception '0166: villa_cost_facts must keep its gate and stay read-only';
  end if;
end $$;
