-- 0167 — Combine a contractor's bills (plan.md, founder 2026-10-28): several bills of one contractor, one company and
-- one kind (PW or NMR) become one. The oldest keeps its number; the others' lines move onto it, each naming its villa
-- (0166), their labour entries follow, and they are deleted, their numbers staying spent as a deleted bill's do.
--
-- combine_contractor_bills(p_bill_ids) is a bill approver's or an admin's, as a send-back is. A bill may be recorded,
-- or approved with no money on it (it is sent back on the way). Refused, naming the bill: any payment or recovery on
-- record, a place on a cash request, additional charges, a total set by hand, or no lines. The kept bill comes out
-- recorded, waiting for approval, its note naming the bills it took in.
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
      v_refs := concat_ws(', ', v_refs, r.reference);
    end if;
  end loop;

  -- An approved bill goes back to recorded first, exactly as a send-back takes it (bills_guard checks the same).
  update bills
     set status = 'recorded', approved_by = null, approved_at = null,
         rejection_note = 'Combined with other bills — approve the combined bill',
         updated_by = auth.uid()
   where id = any(v_ids) and status = 'approved';

  -- A line with no villa of its own was on its bill's; on the kept bill it names that villa.
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
     set note = concat_ws(E'\n', note, 'Combined with ' || v_refs || '.'), updated_by = auth.uid()
   where id = v_keep;
  return v_keep;
end $$;

revoke all on function combine_contractor_bills(uuid[]) from public, anon;
grant execute on function combine_contractor_bills(uuid[]) to authenticated;

-- Checks ---------------------------------------------------------------------------------------------------
do $$
begin
  if not (select prosecdef from pg_proc where oid = 'combine_contractor_bills(uuid[])'::regprocedure) then
    raise exception '0167: combine_contractor_bills must be a definer, to move the labour entries';
  end if;
  if has_function_privilege('anon', 'combine_contractor_bills(uuid[])', 'execute') then
    raise exception '0167: anon can combine bills';
  end if;
end $$;
