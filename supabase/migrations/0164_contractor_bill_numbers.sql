-- 0164 — Contractor bill numbers (plan.md, founder 2026-10-27): a contractor's bill is numbered
-- <contractor code>-<PW|NMR>-<company code>-<number>, e.g. RAIJ-PW-ED-08.
--
-- 1. companies.code: ED, EF, EP — typed in Masters → Companies.
-- 2. vendors.bill_code: four letters or digits, made by the database from the name when a vendor is a contractor
--    (first four letters; when taken, the first three and a later letter, then a digit), editable in Masters,
--    never two alike, permanent once bills carry it. Existing contractors are given one in name order.
-- 3. bills.work_type: PW or NMR, permanent. A work-order bill is PW; an NMR-kind bill is PW only when made of
--    piece-work (create_nmr_bill's p_piece_work); a material bill has none.
-- 4. contractor_bill_numbers (a Masters list): a contractor's last bill number in each company. Masters types the
--    last paper number; once the toolbox makes that contractor's first bill there, bills count it and Masters can
--    only raise it.
-- 5. bills_contractor_reference: on insert, a bill with a work type and a contractor takes the next number of its
--    contractor in its project's company as its reference. Other bills keep BILL/<project>/<scope>/NNN.
-- 6. create_nmr_bill gains p_piece_work; send_labour_logs_to_bill passes it for direct piece-work.

-- 1. Company codes -----------------------------------------------------------------------------------
alter table companies add column if not exists code text
  check (code ~ '^[A-Z]{2,4}$');
create unique index if not exists companies_code_unique on companies (code) where code is not null;

-- 2. Contractor codes --------------------------------------------------------------------------------
alter table vendors add column if not exists bill_code text
  check (bill_code ~ '^[A-Z0-9]{4}$');
create unique index if not exists vendors_bill_code_unique on vendors (bill_code) where bill_code is not null;

create or replace function vendors_bill_code()
returns trigger
language plpgsql
as $$
declare
  v_letters text;
  v_candidate text;
  i int;
begin
  new.bill_code := nullif(upper(trim(new.bill_code)), '');
  -- A code on numbered bills stays, or a later contractor given it would clash with them.
  if tg_op = 'UPDATE' and old.bill_code is not null and new.bill_code is distinct from old.bill_code then
    if exists (select 1 from contractor_bill_numbers where vendor_id = old.id and app_numbering) then
      raise exception 'This contractor''s bills already carry the code %, so it can no longer change', old.bill_code;
    end if;
  end if;
  if new.bill_code is not null or not new.is_contractor then
    return new;
  end if;

  -- A bracketed nickname is not part of the name.
  v_letters := regexp_replace(upper(regexp_replace(coalesce(new.name, ''), '\([^)]*\)', '', 'g')), '[^A-Z]', '', 'g');
  if length(v_letters) < 4 then
    v_letters := rpad(v_letters, 4, 'X');
  end if;

  for i in 4..length(v_letters) loop
    v_candidate := left(v_letters, 3) || substr(v_letters, i, 1);
    if not exists (select 1 from vendors where bill_code = v_candidate and id is distinct from new.id) then
      new.bill_code := v_candidate;
      return new;
    end if;
  end loop;
  for i in 1..99 loop
    v_candidate := left(v_letters, 4 - length(i::text)) || i::text;
    if not exists (select 1 from vendors where bill_code = v_candidate and id is distinct from new.id) then
      new.bill_code := v_candidate;
      return new;
    end if;
  end loop;
  raise exception 'Could not make a bill code for % — type one in Masters → Vendors', new.name;
end $$;

revoke all on function vendors_bill_code() from public, anon, authenticated;

drop trigger if exists vendors_bill_code on vendors;
create trigger vendors_bill_code before insert or update on vendors
  for each row execute function vendors_bill_code();

-- updated_at should not claim every contractor changed today. The audit trigger stays on.
alter table vendors disable trigger set_updated_at;
do $$
declare
  r record;
begin
  for r in select id from vendors where is_contractor and bill_code is null order by lower(name), id loop
    update vendors set bill_code = null where id = r.id;
  end loop;
end $$;
alter table vendors enable trigger set_updated_at;

-- 3. PW or NMR on every labour bill --------------------------------------------------------------------
alter table bills add column if not exists work_type text check (work_type in ('PW', 'NMR'));

alter table bills disable trigger bills_guard;
alter table bills disable trigger set_updated_at;
update bills b
   set work_type = case
     when b.kind = 'contract' then 'PW'
     when exists (select 1 from bill_lines l where l.bill_id = b.id and l.line_kind in ('pw_qty', 'pw_lump'))
      and not exists (select 1 from bill_lines l where l.bill_id = b.id and l.line_kind = 'nmr') then 'PW'
     else 'NMR' end
 where b.kind in ('contract', 'nmr') and b.work_type is null;
alter table bills enable trigger bills_guard;
alter table bills enable trigger set_updated_at;

alter table bills drop constraint if exists bills_work_type_by_kind;
alter table bills add constraint bills_work_type_by_kind check ((kind = 'po') = (work_type is null));

-- 4. Each contractor's last bill number per company -----------------------------------------------------
create table if not exists contractor_bill_numbers (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references vendors (id),
  company_id uuid not null references companies (id),
  last_no int not null default 0 check (last_no >= 0),
  -- Set when the toolbox makes the first bill; from then on Masters may only raise last_no.
  app_numbering boolean not null default false,
  updated_by uuid references profiles (id),
  updated_at timestamptz not null default now(),
  unique (vendor_id, company_id)
);
create index if not exists contractor_bill_numbers_company_idx on contractor_bill_numbers (company_id);

alter table contractor_bill_numbers enable row level security;
revoke all on contractor_bill_numbers from public, anon;

drop policy if exists "contractor_bill_numbers readable by masters or bills" on contractor_bill_numbers;
create policy "contractor_bill_numbers readable by masters or bills" on contractor_bill_numbers
  for select to authenticated using ((select has_app('/masters')) or (select has_app('/bills')));
drop policy if exists "contractor_bill_numbers insertable by masters app" on contractor_bill_numbers;
create policy "contractor_bill_numbers insertable by masters app" on contractor_bill_numbers
  for insert to authenticated with check ((select has_app('/masters')));
drop policy if exists "contractor_bill_numbers updatable by masters app" on contractor_bill_numbers;
create policy "contractor_bill_numbers updatable by masters app" on contractor_bill_numbers
  for update to authenticated
  using ((select has_app('/masters'))) with check ((select has_app('/masters')));

drop trigger if exists audit_contractor_bill_numbers on contractor_bill_numbers;
create trigger audit_contractor_bill_numbers
  after insert or update or delete on contractor_bill_numbers
  for each row execute function audit_row();

-- A direct write is Masters typing the last paper number; a write from inside the bills trigger is a bill.
create or replace function contractor_bill_numbers_guard()
returns trigger
language plpgsql
as $$
begin
  if pg_trigger_depth() = 1 then
    if tg_op = 'UPDATE' and (new.vendor_id, new.company_id) is distinct from (old.vendor_id, old.company_id) then
      raise exception 'A bill count belongs to one contractor in one company for good';
    end if;
    -- Raising skips numbers, which never clash; lowering would hand out one already used.
    if tg_op = 'UPDATE' and old.app_numbering and new.last_no < old.last_no then
      raise exception 'The toolbox is already numbering this contractor''s bills in this company, so the last number can only go up';
    end if;
    new.app_numbering := case when tg_op = 'UPDATE' then old.app_numbering else false end;
    new.updated_by := auth.uid();
  end if;
  new.updated_at := now();
  return new;
end $$;

revoke all on function contractor_bill_numbers_guard() from public, anon, authenticated;

drop trigger if exists contractor_bill_numbers_guard on contractor_bill_numbers;
create trigger contractor_bill_numbers_guard before insert or update on contractor_bill_numbers
  for each row execute function contractor_bill_numbers_guard();

-- 5. The contractor's number on a new bill ----------------------------------------------------------------
-- Definer: a /bills person counts the number without a write policy on Masters' list. Trigger-only, execute revoked.
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
  return new;
end $$;

revoke all on function bills_contractor_reference() from public, anon, authenticated;

drop trigger if exists bills_contractor_reference on bills;
create trigger bills_contractor_reference before insert or update on bills
  for each row execute function bills_contractor_reference();

-- 6. create_nmr_bill knows piece-work ----------------------------------------------------------------------
-- As 0026 left it, with p_piece_work last so every call by position still reads the same.
drop function if exists create_nmr_bill(uuid, uuid, uuid, uuid, text, date, numeric, numeric, numeric, text);

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
  if p_invoice_no is null or length(trim(p_invoice_no)) = 0 then
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
    trim(p_invoice_no), p_invoice_date,
    p_taxable_amount, p_gst_amount, p_total_amount,
    nullif(trim(p_note), ''), auth.uid(), auth.uid()
  )
  returning id into v_id;

  return v_id;
end $$;

revoke all on function create_nmr_bill(uuid, uuid, uuid, uuid, text, date, numeric, numeric, numeric, text, boolean) from public, anon;
grant execute on function create_nmr_bill(uuid, uuid, uuid, uuid, text, date, numeric, numeric, numeric, text, boolean) to authenticated;

-- Send to Bill, as 0156 left it, with direct piece-work made a PW bill.
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
