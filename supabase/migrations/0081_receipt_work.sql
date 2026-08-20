-- 0081 — A direct-to-site delivery names the work it serves
--
-- FOUNDER, 2026-08-20, closing the gap 0080 left: an issue records the
-- work when material leaves a STORE — but a PO received straight to
-- site never passes through a store at all. Without the work recorded
-- at the receiving moment, it never gets recorded ("the record of what
-- work must happen there immediately else it will slip"), and the
-- issued-vs-estimated comparison quietly under-counts everything
-- delivered directly.
--
-- So goods_receipts grows the same optional work_item_id as
-- stock_issues, with the same shape everywhere: mandatory for NEW
-- to-site receipts (a NOT VALID check excuses history), meaningless
-- for store receipts (material in a store serves no work yet — the
-- issue names it later), the same works vocabulary, the stage derived
-- from the work's category, retagging allowed because it is a label
-- with no quantity effect (audit_row() records it), and the old
-- function signature kept as a delegating wrapper for the
-- migrate-before-deploy window.
--
-- Re-runnable throughout.

alter table goods_receipts
  add column if not exists work_item_id uuid references work_items (id);

create index if not exists goods_receipts_work_item_idx
  on goods_receipts (work_item_id)
  where work_item_id is not null;

alter table goods_receipts
  drop constraint if exists goods_receipts_site_needs_work;
alter table goods_receipts
  add constraint goods_receipts_site_needs_work
  check (not to_site or work_item_id is not null)
  not valid;

-- ---------------------------------------------------------------------
-- create_goods_receipt() grows a work argument
-- ---------------------------------------------------------------------
-- Body is 0024's, plus the work validations. Both signatures carry the
-- full revoke set ('revoke from public' alone leaves anon able to call
-- a function — 0071's lesson).

create or replace function create_goods_receipt(
  p_po_id uuid,
  p_store_id uuid,
  p_to_site boolean,
  p_work_item_id uuid,
  p_challan_no text,
  p_received_at date,
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
  v_status text;
  v_reference text;
  v_project_code text;
  v_store_active boolean;
  v_work_active boolean;
  v_no int;
  v_id uuid;
begin
  if (p_store_id is not null) = coalesce(p_to_site, false) then
    raise exception 'Choose where the goods went: a store, or the site';
  end if;

  -- The work: mandatory straight-to-site, meaningless into a store.
  if coalesce(p_to_site, false) and p_work_item_id is null then
    raise exception 'Say which work this delivery is for';
  end if;
  if p_store_id is not null and p_work_item_id is not null then
    raise exception 'A delivery into a store serves no work yet — the issue names it later';
  end if;
  if p_work_item_id is not null then
    select is_active into v_work_active from work_items where id = p_work_item_id;
    if v_work_active is null then
      raise exception 'That work no longer exists';
    end if;
    if not v_work_active then
      raise exception 'That work is marked inactive in Masters';
    end if;
  end if;

  select f.project_id, f.plot_id, f.unit_id, f.status, f.reference
    into v_project_id, v_plot_id, v_unit_id, v_status, v_reference
  from po_facts f
  where f.id = p_po_id;

  if v_project_id is null then
    raise exception 'That purchase order no longer exists';
  end if;
  if v_status <> 'issued' then
    raise exception 'Goods can only be received against an ISSUED purchase order (% is %)',
      v_reference, v_status;
  end if;

  if coalesce(p_to_site, false) and v_plot_id is null and v_unit_id is null then
    raise exception 'This is a general purchase order with no plot or unit, so there is no site to deliver to — receive it into a store';
  end if;

  if p_store_id is not null then
    select is_active into v_store_active from stores where id = p_store_id;
    if v_store_active is null then
      raise exception 'Pick a store for this delivery';
    end if;
    if not v_store_active then
      raise exception 'That store is marked inactive in Masters';
    end if;
  end if;

  select code into v_project_code from projects where id = v_project_id;
  if v_project_code is null then
    raise exception 'This project has no short code yet — set one in Masters before recording deliveries';
  end if;

  insert into grn_counters (project_id, last_no)
  values (v_project_id, 1)
  on conflict (project_id) do update set last_no = grn_counters.last_no + 1
  returning last_no into v_no;

  insert into goods_receipts (
    project_id, po_id, store_id, to_site, plot_id, unit_id, work_item_id,
    grn_no, reference, challan_no, received_at, note, created_by, updated_by
  )
  values (
    v_project_id, p_po_id, p_store_id, coalesce(p_to_site, false),
    case when coalesce(p_to_site, false) then v_plot_id end,
    case when coalesce(p_to_site, false) then v_unit_id end,
    p_work_item_id,
    v_no,
    'GRN/' || v_project_code || '/'
      || lpad(v_no::text, greatest(3, length(v_no::text)), '0'),
    nullif(trim(p_challan_no), ''), coalesce(p_received_at, current_date),
    nullif(trim(p_note), ''), auth.uid(), auth.uid()
  )
  returning id into v_id;

  return v_id;
end $$;

-- The pre-0081 signature, now a wrapper.
create or replace function create_goods_receipt(
  p_po_id uuid,
  p_store_id uuid,
  p_to_site boolean,
  p_challan_no text,
  p_received_at date,
  p_note text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
begin
  return create_goods_receipt(
    p_po_id, p_store_id, p_to_site, null, p_challan_no, p_received_at, p_note
  );
end $$;

revoke execute on function create_goods_receipt(uuid, uuid, boolean, uuid, text, date, text)
  from public, anon;
grant execute on function create_goods_receipt(uuid, uuid, boolean, uuid, text, date, text)
  to authenticated;
revoke execute on function create_goods_receipt(uuid, uuid, boolean, text, date, text)
  from public, anon;
grant execute on function create_goods_receipt(uuid, uuid, boolean, text, date, text)
  to authenticated;

-- Prove it all landed.
do $$
declare
  v int;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'goods_receipts' and column_name = 'work_item_id'
  ) then
    raise exception '0081: goods_receipts.work_item_id is missing';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'goods_receipts_site_needs_work' and not convalidated
  ) then
    raise exception '0081: the NOT VALID site-needs-work check is missing';
  end if;

  select count(*) into v from pg_proc where proname = 'create_goods_receipt';
  if v <> 2 then
    raise exception '0081: expected both create_goods_receipt signatures, found %', v;
  end if;

  if exists (
    select 1
    from information_schema.routine_privileges
    where routine_schema = 'public'
      and routine_name = 'create_goods_receipt'
      and grantee in ('PUBLIC', 'anon')
      and privilege_type = 'EXECUTE'
  ) then
    raise exception '0081: anon can still execute create_goods_receipt';
  end if;
end $$;
