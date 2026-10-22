-- 0133 — Piece-work billed without a work order, and charges kept apart from the rate
-- (plan.md, OS process updates, Wave 2, items 4 and 8). DRAFT FOR A FABLE REVIEW: it redefines a
-- definer (send_labour_logs_to_bill) and money (a money view and the bill roll-up). Not applied.
--
-- 1. Piece-work without a work order (founder, 2026-10-22: "make work order selection optional for
--    piecework entries"). send_labour_logs_to_bill() accepts no work order for piece-work: the bill
--    is then a direct labour bill (kind 'nmr', no anchor, the contractor as vendor), its lines the
--    same piece-work lines a work-order bill gets. Daily wages are unchanged.
-- 2. Additional charges (freight, loading, transport) on a purchase order and on a bill as their
--    own amount with their own GST % and a note, not folded into a material's rate. A PO's header
--    is frozen once issued and a bill's once approved by the guards already there. The bill
--    roll-up takes the charges into the header's taxable, GST and total; po_billing_totals takes
--    them into what was ordered, so "billed against ordered" stays like for like. The per-line
--    "other charges" (added after GST) stay as they are.

-- 2a. The columns -------------------------------------------------------------------------------
alter table purchase_orders add column if not exists charges_amount numeric;
alter table purchase_orders add column if not exists charges_gst_pct numeric;
alter table purchase_orders add column if not exists charges_note text;
alter table bills add column if not exists charges_amount numeric;
alter table bills add column if not exists charges_gst_pct numeric;
alter table bills add column if not exists charges_note text;

alter table purchase_orders drop constraint if exists purchase_orders_charges_shape;
alter table purchase_orders add constraint purchase_orders_charges_shape check (
  (charges_amount is null and charges_gst_pct is null)
  or (charges_amount > 0 and charges_gst_pct is not null and charges_gst_pct >= 0 and charges_gst_pct <= 100)
);
alter table bills drop constraint if exists bills_charges_shape;
alter table bills add constraint bills_charges_shape check (
  (charges_amount is null and charges_gst_pct is null)
  or (charges_amount > 0 and charges_gst_pct is not null and charges_gst_pct >= 0 and charges_gst_pct <= 100)
);

-- 2b. The bill's header follows its lines and its charges ---------------------------------------
create or replace function bill_lines_roll_up()
returns trigger
language plpgsql
as $$
declare
  v_bill uuid;
  v_taxable numeric;
  v_gst numeric;
  v_other numeric;
  v_override text;
  v_charges numeric;
  v_charges_gst numeric;
begin
  v_bill := case when tg_op = 'DELETE' then old.bill_id else new.bill_id end;

  select
    round(sum(t.taxable), 2),
    round(sum(t.taxable * t.gst_pct / 100), 2),
    round(sum(t.other), 2)
  into v_taxable, v_gst, v_other
  from (
    select coalesce(quantity, 1) * rate - coalesce(discount_amount, 0) as taxable,
           gst_pct,
           coalesce(other_charges, 0) as other
    from bill_lines where bill_id = v_bill
  ) t;

  if v_taxable is null then
    return null; -- the last line went; the header keeps its figures
  end if;

  select total_override_note, coalesce(charges_amount, 0), coalesce(charges_gst_pct, 0)
    into v_override, v_charges, v_charges_gst
    from bills where id = v_bill;

  v_gst := v_gst + round(v_charges * v_charges_gst / 100, 2);
  v_taxable := v_taxable + v_charges;

  update bills set
    taxable_amount = greatest(v_taxable, 0),
    gst_amount = greatest(v_gst, 0),
    total_amount = case
      when v_override is not null then total_amount
      else greatest(v_taxable + v_gst + v_other, 0.01)
    end
  where id = v_bill;

  return null;
end $$;

-- A change to the charges alone re-sums the header the same way, for a bill with lines; a bill
-- from before lines keeps its typed figures.
create or replace function bills_charges_roll_up()
returns trigger
language plpgsql
as $$
declare
  v_taxable numeric;
  v_gst numeric;
  v_other numeric;
begin
  if (new.charges_amount, new.charges_gst_pct) is not distinct from (old.charges_amount, old.charges_gst_pct) then
    return new;
  end if;

  select
    round(sum(t.taxable), 2),
    round(sum(t.taxable * t.gst_pct / 100), 2),
    round(sum(t.other), 2)
  into v_taxable, v_gst, v_other
  from (
    select coalesce(quantity, 1) * rate - coalesce(discount_amount, 0) as taxable,
           gst_pct,
           coalesce(other_charges, 0) as other
    from bill_lines where bill_id = new.id
  ) t;
  if v_taxable is null then
    return new;
  end if;

  v_gst := v_gst + round(coalesce(new.charges_amount, 0) * coalesce(new.charges_gst_pct, 0) / 100, 2);
  v_taxable := v_taxable + coalesce(new.charges_amount, 0);
  new.taxable_amount := greatest(v_taxable, 0);
  new.gst_amount := greatest(v_gst, 0);
  if new.total_override_note is null then
    new.total_amount := greatest(v_taxable + v_gst + v_other, 0.01);
  end if;
  return new;
end $$;

drop trigger if exists bills_charges_roll_up on bills;
create trigger bills_charges_roll_up
  before update of charges_amount, charges_gst_pct on bills
  for each row execute function bills_charges_roll_up();

revoke all on function bills_charges_roll_up() from public, anon, authenticated;

-- 2c. What was ordered counts the PO's charges ---------------------------------------------------
create or replace view po_billing_totals with (security_barrier = true) as
 select po.id as po_id,
    coalesce(ordered.total, 0::numeric)
      + coalesce(po.charges_amount * (1 + coalesce(po.charges_gst_pct, 0) / 100), 0) as ordered_total,
    coalesce(billed.total, 0::numeric) as billed_total,
    coalesce(billed.n, 0::bigint) as bill_count
   from purchase_orders po
     left join ( select t.po_id,
            sum(t.taxable * (1::numeric + coalesce(t.gst_pct, 0::numeric) / 100::numeric) + t.other) as total
           from ( select l.po_id,
                    l.gst_pct,
                    l.quantity * l.rate - coalesce(l.quantity * l.rate * l.discount_pct / 100::numeric, 0::numeric) - coalesce(l.discount_amount, 0::numeric) as taxable,
                    coalesce(l.other_charges, 0::numeric) as other
                   from purchase_order_lines l) t
          group by t.po_id) ordered on ordered.po_id = po.id
     left join ( select b.po_id,
            sum(b.total_amount) as total,
            count(*) as n
           from bills b
          where b.po_id is not null
          group by b.po_id) billed on billed.po_id = po.id
  where has_app('/purchase-orders'::text) or has_app('/bills'::text);

revoke insert, update, delete, truncate on po_billing_totals from anon, authenticated;

-- 1. Piece-work without a work order ------------------------------------------------------------
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
  if p_bill_reference is null or length(trim(p_bill_reference)) = 0 then
    raise exception 'Type the muster roll or bill reference';
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
  if cardinality(v_projects) <> 1 then
    raise exception 'A bill is for one project — tick entries of one project';
  end if;

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
      v_contractors[1], v_projects[1],
      case when cardinality(v_plots) = 1 then v_plots[1] else null end, null,
      p_bill_reference, p_bill_date, v_total, 0, v_total, p_note
    );

    if p_total_override is not null then
      update bills set total_override_note = trim(p_override_note) where id = v_bill;
    end if;

    if v_masons > 0 then
      v_sort := v_sort + 1;
      insert into bill_lines (bill_id, sort_order, line_kind, description, quantity, rate, gst_pct, created_by, updated_by)
      values (v_bill, v_sort, 'nmr', 'Masons (man-days)', v_masons, (p_rates ->> 'mason')::numeric, v_gst, auth.uid(), auth.uid());
    end if;
    if v_helpers > 0 then
      v_sort := v_sort + 1;
      insert into bill_lines (bill_id, sort_order, line_kind, description, quantity, rate, gst_pct, created_by, updated_by)
      values (v_bill, v_sort, 'nmr', 'Helpers (man-days)', v_helpers, (p_rates ->> 'helper')::numeric, v_gst, auth.uid(), auth.uid());
    end if;
    if v_others > 0 then
      v_sort := v_sort + 1;
      insert into bill_lines (bill_id, sort_order, line_kind, description, quantity, rate, gst_pct, created_by, updated_by)
      values (v_bill, v_sort, 'nmr', 'Other labour (man-days)', v_others, (p_rates ->> 'other')::numeric, v_gst, auth.uid(), auth.uid());
    end if;
  else
    if p_labour_contract_id is not null then
      select id, vendor_id, project_id, status, is_active into v_contract
        from labour_contracts where id = p_labour_contract_id;
      if not found or v_contract.status <> 'approved' or not v_contract.is_active then
        raise exception 'That work order is not approved and active';
      end if;
      if v_contract.vendor_id <> v_contractors[1] or v_contract.project_id <> v_projects[1] then
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
        v_contractors[1], v_projects[1],
        case when cardinality(v_plots) = 1 then v_plots[1] else null end, null,
        p_bill_reference, p_bill_date, v_total, 0, v_total, p_note
      );
    end if;

    for r in
      select l.*, w.code as work_code, w.name as work_name
      from labour_logs l join work_items w on w.id = l.work_item_id
      where l.id = any(p_log_ids)
      order by l.log_date, w.code
    loop
      v_sort := v_sort + 1;
      insert into bill_lines (
        bill_id, sort_order, line_kind, labour_log_id, work_item_id, description,
        uom, quantity, rate, gst_pct, created_by, updated_by
      ) values (
        v_bill, v_sort, r.kind, r.id, r.work_item_id,
        case when r.kind = 'pw_lump' then trim(r.description) || ' (' || r.work_code || ', ' || to_char(r.log_date, 'DD Mon') || ')'
             else r.work_name || ' — ' || r.work_code || ' (' || to_char(r.log_date, 'DD Mon') || ')' end
          || case when r.work_class = 'additional' then ' · Additional work'
                  when r.work_class = 'rework' then ' · Rework' else '' end,
        case when r.kind = 'pw_qty' then r.uom else null end,
        case when r.kind = 'pw_qty' then r.quantity else null end,
        (p_rates -> r.id::text ->> 'rate')::numeric,
        coalesce((p_rates -> r.id::text ->> 'gst_pct')::numeric, 0),
        auth.uid(), auth.uid()
      );
    end loop;
  end if;

  perform set_config('toolbox.labour_billing', 'on', true);
  update labour_logs set bill_id = v_bill, updated_by = auth.uid() where id = any(p_log_ids);
  perform set_config('toolbox.labour_billing', '', true);

  return v_bill;
end $$;

-- Checks ----------------------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_proc where proname = 'send_labour_logs_to_bill' and prosecdef) then
    raise exception '0133: send_labour_logs_to_bill must stay a definer';
  end if;
  if position('has_app(''/bills'')' in pg_get_functiondef('send_labour_logs_to_bill(uuid[],uuid,text,date,jsonb,numeric,text,text)'::regprocedure)) = 0 then
    raise exception '0133: send_labour_logs_to_bill must check /bills first';
  end if;
  if has_function_privilege('authenticated', 'bills_charges_roll_up()', 'execute') then
    raise exception '0133: the charges trigger function must not be callable';
  end if;
  if has_table_privilege('authenticated', 'po_billing_totals', 'insert')
     or has_table_privilege('authenticated', 'po_billing_totals', 'update') then
    raise exception '0133: po_billing_totals must stay read-only';
  end if;
  if position('has_app(''/bills''' in pg_get_viewdef('po_billing_totals'::regclass)) = 0 then
    raise exception '0133: po_billing_totals must keep its gate';
  end if;
end $$;
