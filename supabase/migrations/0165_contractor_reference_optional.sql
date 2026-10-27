-- 0165 — A contractor's own reference is optional (founder 2026-10-27: contractors hand over no number of their own)
--
-- A contractor's bill (0164) is numbered by the toolbox, so the reference typed beside it — the contractor's
-- muster roll or bill number, kept as invoice_no — may be left blank; the bill then carries its own number there.
-- A material bill, or a muster roll paid directly, still needs one.
--
-- 1. bills_contractor_reference fills a blank invoice_no with the number it mints (constraints check after it).
-- 2. create_bill and create_nmr_bill let a blank through only for a contractor; otherwise as they were.
-- 3. send_labour_logs_to_bill drops its own blank check and leaves it to those two.
--
-- Re-runnable throughout.

-- 1. A blank reference takes the bill's number --------------------------------------------------------------
create or replace function bills_contractor_reference()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vendor record;
  v_company record;
  v_no int;
begin
  if tg_op = 'UPDATE' then
    if new.work_type is distinct from old.work_type then
      raise exception 'A bill''s PW or NMR is permanent';
    end if;
    return new;
  end if;

  new.work_type := case new.kind when 'contract' then 'PW' when 'nmr' then coalesce(new.work_type, 'NMR') end;
  if new.work_type is null or new.vendor_id is null then
    return new;
  end if;

  select name, bill_code, is_contractor into v_vendor from vendors where id = new.vendor_id;
  if not found or not v_vendor.is_contractor then
    return new;
  end if;

  select c.id, c.name, c.code into v_company
    from projects p left join companies c on c.id = p.company_id
   where p.id = new.project_id;
  if v_company.id is null then
    raise exception 'This project has no company yet — pick one in Masters → Projects before billing a contractor';
  end if;
  if v_company.code is null then
    raise exception '% has no bill code yet — type one in Masters → Companies before billing a contractor', v_company.name;
  end if;
  if v_vendor.bill_code is null then
    raise exception '% has no bill code yet — type one in Masters → Vendors', v_vendor.name;
  end if;

  insert into contractor_bill_numbers (vendor_id, company_id, last_no, app_numbering, updated_by)
  values (new.vendor_id, v_company.id, 1, true, auth.uid())
  on conflict (vendor_id, company_id) do update
    set last_no = contractor_bill_numbers.last_no + 1, app_numbering = true, updated_by = auth.uid()
  returning last_no into v_no;

  new.reference := v_vendor.bill_code || '-' || new.work_type || '-' || v_company.code || '-'
    || lpad(v_no::text, greatest(2, length(v_no::text)), '0');
  if coalesce(trim(new.invoice_no), '') = '' then
    new.invoice_no := new.reference;
  end if;
  return new;
end $$;

revoke all on function bills_contractor_reference() from public, anon, authenticated;

-- 2a. create_bill, as 0026 left it, with the reference optional on a contractor's work order -----------------
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

  -- A contractor's work-order bill is numbered by bills_contractor_reference, which fills a blank reference.
  if coalesce(trim(p_invoice_no), '') = ''
     and not (v_kind = 'contract'
              and exists (select 1 from vendors where id = v_vendor_id and is_contractor)) then
    raise exception 'Type the invoice number as printed on the vendor''s bill';
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
    nullif(trim(p_invoice_no), ''), p_invoice_date,
    p_taxable_amount, p_gst_amount, p_total_amount,
    nullif(trim(p_note), ''), auth.uid(), auth.uid()
  )
  returning id into v_id;

  return v_id;
end $$;

revoke all on function create_bill(uuid, uuid, text, date, numeric, numeric, numeric, text) from public, anon;
grant execute on function create_bill(uuid, uuid, text, date, numeric, numeric, numeric, text) to authenticated;

-- 2b. create_nmr_bill, as 0164 left it, with the reference optional for a contractor -------------------------
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
  p_note text,
  p_piece_work boolean default false
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
  -- A contractor's bill is numbered by bills_contractor_reference, which fills a blank reference.
  if coalesce(trim(p_invoice_no), '') = ''
     and not exists (select 1 from vendors where id = p_vendor_id and is_contractor) then
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
    po_id, labour_contract_id, kind, work_type, bill_no, reference,
    invoice_no, invoice_date, taxable_amount, gst_amount, total_amount,
    note, created_by, updated_by
  )
  values (
    p_project_id, p_plot_id, p_unit_id, v_scope, p_vendor_id,
    null, null, 'nmr', case when p_piece_work then 'PW' else 'NMR' end, v_no,
    'BILL/' || v_project_code || '/' || v_scope || '/'
      || lpad(v_no::text, greatest(3, length(v_no::text)), '0'),
    nullif(trim(p_invoice_no), ''), p_invoice_date,
    p_taxable_amount, p_gst_amount, p_total_amount,
    nullif(trim(p_note), ''), auth.uid(), auth.uid()
  )
  returning id into v_id;

  return v_id;
end $$;

revoke all on function create_nmr_bill(uuid, uuid, uuid, uuid, text, date, numeric, numeric, numeric, text, boolean) from public, anon;
grant execute on function create_nmr_bill(uuid, uuid, uuid, uuid, text, date, numeric, numeric, numeric, text, boolean) to authenticated;

-- 3. Send to Bill, as 0164 left it, without its own reference check ------------------------------------------
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
        p_bill_reference, p_bill_date, v_total, 0, v_total, p_note, true
      );
    end if;

    -- A named entry has no work: its line carries the name where the work's name and code would be.
    for r in
      select l.*, w.code as work_code, w.name as work_name
      from labour_logs l left join work_items w on w.id = l.work_item_id
      where l.id = any(p_log_ids)
      order by l.log_date, w.code nulls last, l.custom_name
    loop
      v_sort := v_sort + 1;
      insert into bill_lines (
        bill_id, sort_order, line_kind, labour_log_id, work_item_id, description,
        uom, quantity, rate, gst_pct, created_by, updated_by
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
