-- 0156 — Bills and contractors (plan.md, the team's additions, B).
--
-- 1. vendors.contractor_no: CON/001… given by the database when a vendor is marked a contractor, kept for good
--    once given (unticking keeps it), never typed, never given twice (a sequence). Existing contractors numbered in
--    name order.
-- 2. bills.vendor_seq: the vendor's own running bill count (their 4th bill is 4), given on insert and permanent.
--    Counted in bill_vendor_counters, as bill_counters counts bill numbers, so a deleted recorded bill's number is
--    never handed out again. Existing bills numbered by when they were made.
-- 3. Labour logged as Additional work or Rework may carry a typed name instead of a Masters work
--    (labour_logs.custom_name). Such a log is daily wages or a lump sum: piece-work by quantity needs the work's unit.
--    The billed-entry guard freezes the name too, and Send to Bill puts the name on the bill line.
-- 4. A material bill never bills more of a PO line than was received: bill_lines_guard refuses a line whose
--    quantity would take the line's billed total past what arrived. Checked only when a quantity rises,
--    so a bill made before this stands.

-- 1. Contractor numbers ----------------------------------------------------------------------------
alter table vendors add column if not exists contractor_no text;
create unique index if not exists vendors_contractor_no_unique on vendors (contractor_no)
  where contractor_no is not null;

-- updated_at should not claim every contractor changed today. The audit trigger stays on.
alter table vendors disable trigger set_updated_at;
with numbered as (
  select id, row_number() over (order by lower(name), id) as n
    from vendors
   where is_contractor and contractor_no is null
)
update vendors v
   set contractor_no = 'CON/' || lpad((n + coalesce((
         select max(substring(contractor_no from 5)::int) from vendors where contractor_no ~ '^CON/[0-9]+$'
       ), 0))::text, 3, '0')
  from numbered
 where v.id = numbered.id;
alter table vendors enable trigger set_updated_at;

create sequence if not exists vendors_contractor_no_seq;
select setval('vendors_contractor_no_seq',
              greatest(1, coalesce((select max(substring(contractor_no from 5)::int)
                                      from vendors where contractor_no ~ '^CON/[0-9]+$'), 0)),
              exists (select 1 from vendors where contractor_no ~ '^CON/[0-9]+$'));
revoke all on sequence vendors_contractor_no_seq from public, anon;
grant usage on sequence vendors_contractor_no_seq to authenticated;

create or replace function vendors_contractor_no()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and old.contractor_no is not null then
    new.contractor_no := old.contractor_no;
    return new;
  end if;
  new.contractor_no := null;
  if new.is_contractor then
    new.contractor_no := 'CON/' || lpad(nextval('vendors_contractor_no_seq')::text, 3, '0');
  end if;
  return new;
end $$;

revoke all on function vendors_contractor_no() from public, anon, authenticated;

drop trigger if exists vendors_contractor_no on vendors;
create trigger vendors_contractor_no before insert or update on vendors
  for each row execute function vendors_contractor_no();

-- 2. Each vendor's running bill count ----------------------------------------------------------------
alter table bills add column if not exists vendor_seq int;

-- The backfill steps around the bill's own triggers: bills_guard refuses any edit to an approved bill,
-- and updated_at should not claim every old bill changed today. The audit trigger stays on.
alter table bills disable trigger bills_guard;
alter table bills disable trigger set_updated_at;
with numbered as (
  select id, row_number() over (partition by vendor_id order by created_at, id) as n
    from bills
   where vendor_id is not null and vendor_seq is null
)
update bills b set vendor_seq = numbered.n from numbered where b.id = numbered.id;
alter table bills enable trigger bills_guard;
alter table bills enable trigger set_updated_at;

create unique index if not exists bills_vendor_seq_unique on bills (vendor_id, vendor_seq)
  where vendor_id is not null;

create table if not exists bill_vendor_counters (
  vendor_id uuid primary key references vendors (id),
  last_seq int not null default 0
);
alter table bill_vendor_counters enable row level security;
revoke all on bill_vendor_counters from public, anon;

drop policy if exists "bill_vendor_counters readable by bills app" on bill_vendor_counters;
create policy "bill_vendor_counters readable by bills app"
  on bill_vendor_counters for select to authenticated using ((select has_app('/bills')));
drop policy if exists "bill_vendor_counters writable by bills app" on bill_vendor_counters;
create policy "bill_vendor_counters writable by bills app"
  on bill_vendor_counters for insert to authenticated with check ((select has_app('/bills')));
drop policy if exists "bill_vendor_counters updatable by bills app" on bill_vendor_counters;
create policy "bill_vendor_counters updatable by bills app"
  on bill_vendor_counters for update to authenticated
  using ((select has_app('/bills'))) with check ((select has_app('/bills')));

insert into bill_vendor_counters (vendor_id, last_seq)
select vendor_id, max(vendor_seq) from bills where vendor_id is not null group by vendor_id
on conflict (vendor_id) do update set last_seq = greatest(bill_vendor_counters.last_seq, excluded.last_seq);

create or replace function bills_vendor_seq()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    if new.vendor_seq is distinct from old.vendor_seq then
      raise exception 'A bill''s number for its vendor is permanent';
    end if;
    return new;
  end if;
  new.vendor_seq := null;
  if new.vendor_id is not null then
    insert into bill_vendor_counters (vendor_id, last_seq)
    values (new.vendor_id, 1)
    on conflict (vendor_id) do update set last_seq = bill_vendor_counters.last_seq + 1
    returning last_seq into new.vendor_seq;
  end if;
  return new;
end $$;

revoke all on function bills_vendor_seq() from public, anon, authenticated;

drop trigger if exists bills_vendor_seq on bills;
create trigger bills_vendor_seq before insert or update on bills
  for each row execute function bills_vendor_seq();

-- 3. Additional work and Rework by name ----------------------------------------------------------------
alter table labour_logs add column if not exists custom_name text;
alter table labour_logs alter column work_item_id drop not null;

alter table labour_logs drop constraint if exists labour_logs_work_or_name;
alter table labour_logs add constraint labour_logs_work_or_name check (
  (work_item_id is not null and custom_name is null)
  or (work_item_id is null
      and work_class in ('additional', 'rework')
      and kind in ('nmr', 'pw_lump')
      and custom_name is not null
      and length(trim(custom_name)) between 1 and 120)
);

create or replace function labour_logs_billed_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if old.bill_id is not null then
      raise exception 'This entry has been billed and can no longer be removed.';
    end if;
    return old;
  end if;

  -- The stamp moves (set by Send to Bill, cleared when a recorded bill
  -- is deleted) only under the transaction-local flag that 0106's two
  -- definer functions raise; nothing a client can call sets it. And the
  -- stamp is all they move.
  if new.bill_id is distinct from old.bill_id then
    if coalesce(current_setting('toolbox.labour_billing', true), '') <> 'on' then
      raise exception 'Labour entries are billed from Bills → Labour, with Send to Bill.';
    end if;
    if (new.plot_id, new.work_item_id, new.contractor_id, new.log_date, new.kind,
        new.masons, new.helpers, new.others, new.quantity, new.description, new.note,
        new.work_class, new.custom_name)
       is distinct from
       (old.plot_id, old.work_item_id, old.contractor_id, old.log_date, old.kind,
        old.masons, old.helpers, old.others, old.quantity, old.description, old.note,
        old.work_class, old.custom_name) then
      raise exception 'Billing an entry does not rewrite it.';
    end if;
    return new;
  end if;

  -- uom is left out of the comparison: a unit renamed in Masters cascades
  -- here (0082) and must not be refused.
  if old.bill_id is not null
     and (new.plot_id, new.work_item_id, new.contractor_id, new.log_date, new.kind,
          new.masons, new.helpers, new.others, new.quantity, new.description, new.note,
          new.work_class, new.custom_name)
         is distinct from
         (old.plot_id, old.work_item_id, old.contractor_id, old.log_date, old.kind,
          old.masons, old.helpers, old.others, old.quantity, old.description, old.note,
          old.work_class, old.custom_name) then
    raise exception 'This entry has been billed and can no longer be changed.';
  end if;

  return new;
end $$;

-- Send to Bill, as 0133 left it, with a named entry's line described by its name.
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

-- 4. Bill only what was received -----------------------------------------------------------------------
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
  return new;
end $$;

-- Checks ------------------------------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from vendors where is_contractor and contractor_no is null) then
    raise exception '0156: a contractor has no number';
  end if;
  if exists (select 1 from bills where vendor_id is not null and vendor_seq is null) then
    raise exception '0156: a bill with a vendor has no count';
  end if;
  if exists (
    select 1 from bills b
     where b.vendor_id is not null
       and b.vendor_seq > coalesce((select c.last_seq from bill_vendor_counters c where c.vendor_id = b.vendor_id), 0)
  ) then
    raise exception '0156: a vendor''s counter is behind their bills';
  end if;
  if (select count(*) from pg_trigger where tgrelid = 'vendors'::regclass and not tgisinternal and tgenabled = 'D') > 0 then
    raise exception '0156: a vendors trigger was left disabled';
  end if;
  if not exists (select 1 from pg_class where relname = 'bill_vendor_counters' and relrowsecurity) then
    raise exception '0156: bill_vendor_counters has RLS off';
  end if;
  if (select count(*) from pg_trigger where tgrelid = 'bills'::regclass and not tgisinternal and tgenabled = 'D') > 0 then
    raise exception '0156: a bills trigger was left disabled';
  end if;
  if (select prosecdef from pg_proc where oid = 'vendors_contractor_no()'::regprocedure)
     or (select prosecdef from pg_proc where oid = 'bills_vendor_seq()'::regprocedure) then
    raise exception '0156: the numbering triggers run as the caller';
  end if;
  if has_function_privilege('authenticated', 'vendors_contractor_no()', 'execute')
     or has_function_privilege('authenticated', 'bills_vendor_seq()', 'execute') then
    raise exception '0156: a numbering trigger is executable by a client role';
  end if;
  if not (select prosecdef from pg_proc where oid = 'send_labour_logs_to_bill(uuid[],uuid,text,date,jsonb,numeric,text,text)'::regprocedure) then
    raise exception '0156: send_labour_logs_to_bill must stay a definer';
  end if;
  if position('has_app(''/bills'')' in pg_get_functiondef('send_labour_logs_to_bill(uuid[],uuid,text,date,jsonb,numeric,text,text)'::regprocedure)) = 0 then
    raise exception '0156: send_labour_logs_to_bill must check /bills first';
  end if;
  if has_function_privilege('anon', 'send_labour_logs_to_bill(uuid[],uuid,text,date,jsonb,numeric,text,text)', 'execute') then
    raise exception '0156: anon can call send_labour_logs_to_bill';
  end if;
  if (select is_nullable from information_schema.columns
       where table_name = 'labour_logs' and column_name = 'work_item_id') <> 'YES' then
    raise exception '0156: labour_logs.work_item_id is still required';
  end if;
  if not exists (select 1 from pg_class where relname = 'labour_logs' and relrowsecurity)
     or not exists (select 1 from pg_class where relname = 'bills' and relrowsecurity)
     or not exists (select 1 from pg_class where relname = 'vendors' and relrowsecurity) then
    raise exception '0156: RLS is off on a table it touched';
  end if;
end $$;
