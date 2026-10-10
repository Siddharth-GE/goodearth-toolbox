-- 0106 — Bills have lines; labour logs become bills
--
-- FOUNDER, 2026-10-08 (plan.md, B7) — reversing 0025's "a bill has no
-- lines": material bills list the PO's materials, labour bills list the
-- labour log, and totals are calculated ("2 cum at ₹4,000 should show
-- ₹8,000").
--
--   * bill_lines — what a bill is for, line by line. A line is a material
--     (from a PO line), daily wages by trade (nmr), piece-work by
--     quantity (pw_qty) or lump sum (pw_lump), or anything else (other).
--     Amount = quantity × rate − discount (a lump sum: the rate), GST on
--     that, plus other charges after tax — the PO formula (0102).
--     Editable only while the bill is recorded. Gated like bills (/bills
--     or /reporter on SELECT, /bills to write).
--   * THE HEADER FOLLOWS ITS LINES. Every money view (bill_facts,
--     bill_money_facts, po_billing_totals) reads bills.taxable_amount,
--     gst_amount and total_amount, so they stay stored: a trigger on
--     bill_lines rewrites them from the lines, rounded to the paisa. A
--     bill with no lines (every bill before today) keeps its typed
--     figures. An NMR bill may carry a different total than its lines
--     when the muster roll says so — total_override_note says why, and
--     the trigger then leaves the total alone.
--   * po_line_billing_facts — per PO line: ordered, received, billed, and
--     the PO's rate, GST, discount and charges, so a material bill can be
--     pre-filled from its PO. MONEY: WHERE-gated to /purchase-orders or
--     /bills, security_barrier — the second sanctioned window between the
--     two tools beside po_billing_totals. For the Fable review.
--   * po_billing_totals is redefined with the same columns and the same
--     gate, so its ordered total counts 0102's discount and charges.
--   * send_labour_logs_to_bill() — "Send to Bill". SECURITY DEFINER,
--     because it stamps labour_logs.bill_id and the billing team holds
--     /bills, not /supervisors; its body checks has_app('/bills') first —
--     that check is its boundary (SECURITY.md). The quantities come from
--     the logs, never from the browser: the caller supplies only rates.
--     One transaction: the bill, its lines, and every log stamped, or
--     nothing.
--
-- Re-runnable throughout.

-- ---------------------------------------------------------------------
-- 1. bill_lines
-- ---------------------------------------------------------------------

alter table bills add column if not exists total_override_note text;
alter table bills drop constraint if exists bills_override_nmr_only;
alter table bills add constraint bills_override_nmr_only
  check (total_override_note is null or (kind = 'nmr' and length(trim(total_override_note)) > 0));

create table if not exists bill_lines (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references bills (id),
  sort_order int not null default 0,
  line_kind text not null check (line_kind in ('material', 'nmr', 'pw_qty', 'pw_lump', 'other')),
  po_line_id uuid references purchase_order_lines (id),
  item_id uuid references items (id),
  labour_log_id uuid references labour_logs (id),
  work_item_id uuid references work_items (id),
  description text not null check (length(trim(description)) > 0),
  uom text references uoms (name) on update cascade,
  quantity numeric check (quantity is null or quantity > 0),
  rate numeric not null check (rate >= 0),
  gst_pct numeric not null default 0 check (gst_pct >= 0 and gst_pct <= 100),
  discount_amount numeric check (discount_amount is null or discount_amount >= 0),
  other_charges numeric check (other_charges is null or other_charges >= 0),
  note text,
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bill_lines_shape check (
    (line_kind = 'pw_lump' and quantity is null)
    or (line_kind <> 'pw_lump' and quantity is not null)
  ),
  constraint bill_lines_material_names_item check (line_kind <> 'material' or item_id is not null)
);

create index if not exists bill_lines_bill_idx on bill_lines (bill_id);
create index if not exists bill_lines_po_line_idx on bill_lines (po_line_id);
create index if not exists bill_lines_log_idx on bill_lines (labour_log_id);

-- A material line belongs to its bill's PO.
create or replace function bill_lines_guard()
returns trigger
language plpgsql
as $$
declare
  v_bill uuid;
  v_status text;
  v_po uuid;
begin
  v_bill := case when tg_op = 'DELETE' then old.bill_id else new.bill_id end;
  select status, po_id into v_status, v_po from bills where id = v_bill for share;
  if v_status is distinct from 'recorded' then
    raise exception 'This bill is % — its lines can no longer change', coalesce(v_status, 'gone');
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  if tg_op = 'UPDATE' and new.bill_id <> old.bill_id then
    raise exception 'A line stays on the bill it was made on';
  end if;
  if new.po_line_id is not null and not exists (
    select 1 from purchase_order_lines l where l.id = new.po_line_id and l.po_id = v_po
  ) then
    raise exception 'That material is not on this bill''s purchase order';
  end if;
  return new;
end $$;

drop trigger if exists bill_lines_guard on bill_lines;
create trigger bill_lines_guard
  before insert or update or delete on bill_lines
  for each row execute function bill_lines_guard();

-- The header follows the lines. Lump sum: the rate is the amount.
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

  select total_override_note into v_override from bills where id = v_bill;

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

drop trigger if exists bill_lines_roll_up on bill_lines;
create trigger bill_lines_roll_up
  after insert or update or delete on bill_lines
  for each row execute function bill_lines_roll_up();

drop trigger if exists audit_bill_lines on bill_lines;
create trigger audit_bill_lines
  after insert or update or delete on bill_lines
  for each row execute function audit_row();

drop trigger if exists set_updated_at on bill_lines;
create trigger set_updated_at
  before update on bill_lines
  for each row execute function set_updated_at();

alter table bill_lines enable row level security;

drop policy if exists "bill_lines readable by bills or reporter" on bill_lines;
create policy "bill_lines readable by bills or reporter" on bill_lines
  for select to authenticated using (has_app('/bills') or has_app('/reporter'));
drop policy if exists "bill_lines insertable by bills app" on bill_lines;
create policy "bill_lines insertable by bills app" on bill_lines
  for insert to authenticated with check (has_app('/bills'));
drop policy if exists "bill_lines updatable by bills app" on bill_lines;
create policy "bill_lines updatable by bills app" on bill_lines
  for update to authenticated using (has_app('/bills')) with check (has_app('/bills'));
drop policy if exists "bill_lines deletable by bills app" on bill_lines;
create policy "bill_lines deletable by bills app" on bill_lines
  for delete to authenticated using (has_app('/bills'));

-- A recorded bill deleted takes its lines (the bill's own data, not the
-- line chain) and gives back the labour entries it billed, so they can
-- be sent again. SECURITY DEFINER because freeing a labour entry writes
-- labour_logs, which the billing team cannot; the body repeats the
-- recorded-bill delete policy (0025) exactly — that check is its boundary.
create or replace function delete_recorded_bill(p_bill_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_created_by uuid;
begin
  if not has_app('/bills') then
    raise exception 'Only the Bills tool can delete a bill';
  end if;
  select status, created_by into v_status, v_created_by from bills where id = p_bill_id for update;
  if not found then
    raise exception 'That bill no longer exists';
  end if;
  if v_status <> 'recorded' or not (is_admin() or v_created_by = auth.uid()) then
    raise exception 'Only a recorded bill can be deleted, by whoever recorded it or an admin';
  end if;

  perform set_config('toolbox.labour_billing', 'on', true);
  update labour_logs set bill_id = null where bill_id = p_bill_id;
  perform set_config('toolbox.labour_billing', '', true);
  delete from bill_lines where bill_id = p_bill_id;
  delete from bills where id = p_bill_id;
end $$;

revoke execute on function delete_recorded_bill(uuid) from public, anon;
grant execute on function delete_recorded_bill(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 2. po_line_billing_facts — a PO line, for the bill made against it
-- ---------------------------------------------------------------------

create or replace view po_line_billing_facts with (security_barrier) as
select l.id as po_line_id,
       l.po_id,
       l.item_id,
       l.uom,
       l.quantity as ordered_quantity,
       coalesce(received.qty, 0) as received_quantity,
       coalesce(billed.qty, 0) as billed_quantity,
       l.rate,
       l.gst_pct,
       l.discount_pct,
       l.discount_amount,
       l.other_charges
from purchase_order_lines l
left join (
  select g.po_line_id, sum(g.quantity) as qty
  from goods_receipt_lines g group by g.po_line_id
) received on received.po_line_id = l.id
left join (
  select b.po_line_id, sum(b.quantity) as qty
  from bill_lines b where b.po_line_id is not null group by b.po_line_id
) billed on billed.po_line_id = l.id
where has_app('/purchase-orders') or has_app('/bills');

revoke all on po_line_billing_facts from public, anon;
revoke insert, update, delete, truncate on po_line_billing_facts from anon, authenticated;
grant select on po_line_billing_facts to authenticated;

-- ---------------------------------------------------------------------
-- 3. po_billing_totals — same columns, same gate; 0102's charges count
-- ---------------------------------------------------------------------

create or replace view po_billing_totals
with (security_barrier) as
select po.id as po_id,
       coalesce(ordered.total, 0) as ordered_total,
       coalesce(billed.total, 0) as billed_total,
       coalesce(billed.n, 0) as bill_count
from purchase_orders po
left join (
  select t.po_id,
         sum(t.taxable * (1 + coalesce(t.gst_pct, 0) / 100) + t.other) as total
  from (
    select l.po_id, l.gst_pct,
           l.quantity * l.rate
             - coalesce(l.quantity * l.rate * l.discount_pct / 100, 0)
             - coalesce(l.discount_amount, 0) as taxable,
           coalesce(l.other_charges, 0) as other
    from purchase_order_lines l
  ) t
  group by t.po_id
) ordered on ordered.po_id = po.id
left join (
  select b.po_id, sum(b.total_amount) as total, count(*) as n
  from bills b
  where b.po_id is not null
  group by b.po_id
) billed on billed.po_id = po.id
where has_app('/purchase-orders') or has_app('/bills');

revoke all on po_billing_totals from public, anon;
revoke insert, update, delete, truncate on po_billing_totals from anon, authenticated;
grant select on po_billing_totals to authenticated;

-- ---------------------------------------------------------------------
-- 4. send_labour_logs_to_bill() — "Send to Bill"
-- ---------------------------------------------------------------------
-- p_rates (rupees; nothing else is taken from the caller):
--   NMR:  {"mason": 900, "helper": 700, "other": 650, "gst_pct": 0}
--   PW:   {"<log id>": {"rate": 4000, "gst_pct": 18}, …}
-- An NMR bill is for the logs' plot when they share one, else GEN; a PW
-- bill is against p_labour_contract_id (an approved work order of the
-- logs' contractor and project).

create or replace function send_labour_logs_to_bill(
  p_log_ids uuid[],
  p_labour_contract_id uuid,
  p_bill_reference text,
  p_bill_date date,
  p_rates jsonb,
  p_total_override numeric,
  p_override_note text,
  p_note text
)
returns uuid
language plpgsql
security definer
set search_path = public
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
    if p_labour_contract_id is null then
      raise exception 'Piece-work is billed against the contractor''s work order — pick one';
    end if;
    select id, vendor_id, project_id, status, is_active into v_contract
      from labour_contracts where id = p_labour_contract_id;
    if not found or v_contract.status <> 'approved' or not v_contract.is_active then
      raise exception 'That work order is not approved and active';
    end if;
    if v_contract.vendor_id <> v_contractors[1] or v_contract.project_id <> v_projects[1] then
      raise exception 'That work order is for another contractor or project';
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

    v_bill := create_bill(null, p_labour_contract_id, p_bill_reference, p_bill_date,
                          v_total, 0, v_total, p_note);

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
             else r.work_name || ' — ' || r.work_code || ' (' || to_char(r.log_date, 'DD Mon') || ')' end,
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

revoke execute on function send_labour_logs_to_bill(uuid[], uuid, text, date, jsonb, numeric, text, text) from public, anon;
grant execute on function send_labour_logs_to_bill(uuid[], uuid, text, date, jsonb, numeric, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 5. Prove it
-- ---------------------------------------------------------------------

do $$
declare
  v int;
begin
  if not exists (select 1 from pg_class where relname = 'bill_lines' and relrowsecurity) then
    raise exception '0106: bill_lines is missing or has RLS off';
  end if;
  select count(*) into v from pg_policies
    where schemaname = 'public' and tablename = 'bill_lines' and cmd = 'SELECT';
  if v <> 1 then raise exception '0106: bill_lines has % SELECT policies, expected 1', v; end if;

  if not exists (select 1 from pg_views where viewname = 'po_line_billing_facts'
    and definition like '%has_app(''/purchase-orders''%' and definition like '%has_app(''/bills''%') then
    raise exception '0106: po_line_billing_facts must be gated to /purchase-orders or /bills';
  end if;
  if not exists (select 1 from pg_views where viewname = 'po_billing_totals'
    and definition like '%has_app(''/purchase-orders''%' and definition like '%has_app(''/bills''%') then
    raise exception '0106: po_billing_totals lost its gate';
  end if;
  if exists (select 1 from information_schema.role_table_grants
    where table_schema = 'public' and table_name in ('po_line_billing_facts', 'po_billing_totals')
      and grantee in ('anon', 'authenticated', 'PUBLIC')
      and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')) then
    raise exception '0106: a billing view is writable';
  end if;

  if not exists (select 1 from pg_proc where proname = 'send_labour_logs_to_bill' and prosecdef) then
    raise exception '0106: send_labour_logs_to_bill must be security definer';
  end if;
  if position('has_app(''/bills'')' in (select prosrc from pg_proc where proname = 'send_labour_logs_to_bill')) = 0 then
    raise exception '0106: send_labour_logs_to_bill must check /bills in its body';
  end if;
  if position('has_app(''/bills'')' in (select prosrc from pg_proc where proname = 'delete_recorded_bill')) = 0 then
    raise exception '0106: delete_recorded_bill must check /bills in its body';
  end if;
  if exists (select 1 from information_schema.routine_privileges
    where routine_schema = 'public' and routine_name in ('send_labour_logs_to_bill', 'delete_recorded_bill')
      and grantee in ('PUBLIC', 'anon') and privilege_type = 'EXECUTE') then
    raise exception '0106: anon can execute a bills function';
  end if;
end $$;
