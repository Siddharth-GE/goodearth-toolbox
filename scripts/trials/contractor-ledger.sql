-- Behaviour trial for 0156 — contractor numbers, each vendor's bill count, labour by name, and billing only
-- what arrived. Runs inside the dry-run transaction; always rolled back. The billing steps run UNDER
-- ROW-LEVEL SECURITY (BUGCATCHER #19) as the staff account made /bills-only.
--
--   npx tsx scripts/dry-run-migrations.ts --project ipstebqawrvhkyntctrv \
--     supabase/migrations/0156_*.sql --trial scripts/trials/contractor-ledger.sql
do $trial$
declare
  v_user uuid := (select id from auth.users where email = 'siddharth.cyriac.99@gmail.com');
  s_user uuid := gen_random_uuid();
  v_project uuid := '041b4401-ab9c-4ee5-b6d7-3443f58dbc6a';
  v_plot uuid;
  v_unit uuid;
  v_ucode text;
  v_vendor uuid := (select id from vendors where not is_contractor and is_active order by name limit 1);
  v_contractor uuid := (select id from vendors where is_contractor and is_active order by name limit 1);
  v_item uuid := (select id from items where kind = 'material' and is_active and default_uom is not null order by code limit 1);
  v_uom text;
  v_work uuid := (select id from work_items where is_active order by code limit 1);
  v_store uuid := (select id from stores where is_active limit 1);
  v_max int := (select max(substring(contractor_no from 5)::int) from vendors where contractor_no ~ '^CON/[0-9]+$');
  v_new uuid;
  v_no text;
  v_po uuid;
  v_pl uuid;
  v_grn uuid;
  v_named uuid;
  v_bill uuid;
  v_bill2 uuid;
  v_line uuid;
  v_seq int;
  v_desc text;
  v_refused boolean;
begin
  select default_uom into v_uom from items where id = v_item;
  select p.id, u.id, u.code into v_plot, v_unit, v_ucode
    from plots p join units u on u.plot_id = p.id
    where p.project_id = v_project and u.code is not null limit 1;
  if v_user is null or v_plot is null or v_vendor is null or v_contractor is null or v_item is null then
    raise exception 'TRIAL SETUP: staging is missing an account, a plot, a vendor, a contractor or a material';
  end if;
  insert into auth_verified_sessions (session_id, user_id, method) values (s_user, v_user, 'otp');
  alter table purchase_order_lines drop constraint if exists purchase_order_lines_from_an_indent;

  -- 1. Every contractor has a number; a new one takes the next; unticking keeps it; a typed one is ignored.
  if exists (select 1 from vendors where is_contractor and contractor_no is null) then
    raise exception 'TRIAL 1 FAILED: a contractor has no number';
  end if;
  insert into vendors (name, is_contractor, contractor_no) values ('Trial Contractor 0156', true, 'CON/999')
    returning id, contractor_no into v_new, v_no;
  if v_no is distinct from 'CON/' || lpad((coalesce(v_max, 0) + 1)::text, 3, '0') then
    raise exception 'TRIAL 1 FAILED: the new contractor is %, after CON/%', v_no, v_max;
  end if;
  update vendors set is_contractor = false, contractor_no = 'CON/777' where id = v_new;
  if (select contractor_no from vendors where id = v_new) is distinct from v_no then
    raise exception 'TRIAL 1 FAILED: unticking or typing changed the number';
  end if;
  insert into vendors (name, is_contractor) values ('Trial Supplier 0156', false) returning contractor_no into v_no;
  if v_no is not null then raise exception 'TRIAL 1 FAILED: a supplier got a contractor number'; end if;

  -- 2. Labour by name: only Additional or Rework, daily wages or a lump sum, never both a work and a name.
  insert into labour_logs (plot_id, work_item_id, custom_name, contractor_id, log_date, kind, masons, helpers, others, work_class, created_by, updated_by)
  values (v_plot, null, 'Extra parapet on the terrace', v_contractor, current_date - 3, 'nmr', 1, 0.5, 0, 'additional', v_user, v_user)
  returning id into v_named;
  v_refused := false;
  begin
    insert into labour_logs (plot_id, work_item_id, custom_name, contractor_id, log_date, kind, masons, helpers, others, created_by, updated_by)
    values (v_plot, null, 'No class', v_contractor, current_date - 3, 'nmr', 1, 0, 0, v_user, v_user);
  exception when check_violation then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 2 FAILED: a standard log took a name instead of a work'; end if;
  v_refused := false;
  begin
    insert into labour_logs (plot_id, work_item_id, custom_name, contractor_id, log_date, kind, masons, helpers, others, quantity, uom, work_class, created_by, updated_by)
    values (v_plot, null, 'By quantity', v_contractor, current_date - 3, 'pw_qty', 0, 0, 0, 2, 'cum', 'rework', v_user, v_user);
  exception when check_violation then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 2 FAILED: a named log was piece-work by quantity'; end if;
  v_refused := false;
  begin
    insert into labour_logs (plot_id, work_item_id, custom_name, contractor_id, log_date, kind, masons, helpers, others, work_class, created_by, updated_by)
    values (v_plot, v_work, 'Both', v_contractor, current_date - 3, 'nmr', 1, 0, 0, 'rework', v_user, v_user);
  exception when check_violation then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 2 FAILED: a log took a work and a name'; end if;

  -- Setup, as the owner: a PO of 10, issued, 6 received.
  insert into purchase_orders (project_id, unit_id, scope_code, vendor_id, po_no, reference, status, created_by, updated_by)
  values (v_project, v_unit, v_ucode, v_vendor, 9356, 'PO/TRIAL/356', 'draft', v_user, v_user)
  returning id into v_po;
  insert into purchase_order_lines (po_id, item_id, quantity, uom, rate, gst_pct, created_by, updated_by)
  values (v_po, v_item, 10, v_uom, 400, 18, v_user, v_user) returning id into v_pl;
  update purchase_orders set status = 'issued', issued_by = v_user, issued_at = now() where id = v_po;
  insert into goods_receipts (project_id, po_id, store_id, to_site, grn_no, reference, received_at, created_by, updated_by)
  values (v_project, v_po, v_store, false, 9356, 'GRN/TRIAL/356', current_date, v_user, v_user)
  returning id into v_grn;
  insert into goods_receipt_lines (receipt_id, po_line_id, item_id, quantity, uom, created_by, updated_by)
  values (v_grn, v_pl, v_item, 6, v_uom, v_user, v_user);

  -- The staff account becomes a /bills-only person.
  delete from user_apps where user_id = v_user;
  insert into user_apps (user_id, app) values (v_user, '/bills');
  perform set_config('request.jwt.claims', json_build_object('sub', v_user,
    'role', 'authenticated', 'session_id', s_user)::text, true);
  set local role authenticated;

  -- 3. A bill takes its vendor's next count, which never changes.
  v_bill := create_bill(v_po, null, 'INV-0156-A', current_date, 100, 0, 100, null);
  select vendor_seq into v_seq from bills where id = v_bill;
  if v_seq is distinct from (select count(*) from bills where vendor_id = v_vendor)::int then
    raise exception 'TRIAL 3 FAILED: the vendor''s bill count is %', v_seq;
  end if;
  v_refused := false;
  begin
    update bills set vendor_seq = 99 where id = v_bill;
  exception when raise_exception then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 3 FAILED: a bill''s count was changed'; end if;

  -- 4. Only what arrived is billed: 6 of 6 goes, a 7th is refused, on this bill or another.
  insert into bill_lines (bill_id, sort_order, line_kind, po_line_id, item_id, description, uom, quantity, rate, gst_pct, created_by, updated_by)
  values (v_bill, 0, 'material', v_pl, v_item, 'Trial material', v_uom, 6, 400, 18, v_user, v_user)
  returning id into v_line;
  v_refused := false;
  begin
    update bill_lines set quantity = 7 where id = v_line;
  exception when raise_exception then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 4 FAILED: 7 billed of 6 received'; end if;
  update bill_lines set quantity = 5 where id = v_line;
  v_bill2 := create_bill(v_po, null, 'INV-0156-B', current_date, 100, 0, 100, null);
  if (select vendor_seq from bills where id = v_bill2) is distinct from v_seq + 1 then
    raise exception 'TRIAL 4 FAILED: the second bill did not take the next count';
  end if;
  v_refused := false;
  begin
    insert into bill_lines (bill_id, sort_order, line_kind, po_line_id, item_id, description, uom, quantity, rate, gst_pct, created_by, updated_by)
    values (v_bill2, 0, 'material', v_pl, v_item, 'Trial material', v_uom, 2, 400, 18, v_user, v_user);
  exception when raise_exception then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 4 FAILED: a second bill took the billed total past what arrived'; end if;
  insert into bill_lines (bill_id, sort_order, line_kind, po_line_id, item_id, description, uom, quantity, rate, gst_pct, created_by, updated_by)
  values (v_bill2, 0, 'material', v_pl, v_item, 'Trial material', v_uom, 1, 400, 18, v_user, v_user);

  -- A deleted bill's count is never handed out again.
  delete from bill_lines where bill_id = v_bill2;
  delete from bills where id = v_bill2;
  if found is not true then raise exception 'TRIAL 4 SETUP: the recorded bill was not deleted'; end if;
  v_bill2 := create_bill(v_po, null, 'INV-0156-C', current_date, 100, 0, 100, null);
  if (select vendor_seq from bills where id = v_bill2) is distinct from v_seq + 2 then
    raise exception 'TRIAL 4 FAILED: a deleted bill''s count was reused';
  end if;

  -- 5. Send to Bill puts the name on the line and bills the half day.
  v_bill := send_labour_logs_to_bill(array[v_named], null, 'MISC 0156', current_date,
    jsonb_build_object('mason', 1000, 'helper', 800, 'gst_pct', 0), null, null, null);
  if (select total_amount from bills where id = v_bill) <> 1400 then
    raise exception 'TRIAL 5 FAILED: 1 mason and half a helper billed %, expected 1,400',
      (select total_amount from bills where id = v_bill);
  end if;
  v_refused := false;
  begin
    update labour_logs set custom_name = 'Renamed' where id = v_named;
  exception when raise_exception then v_refused := true;
  end;
  reset role;
  if not v_refused and (select custom_name from labour_logs where id = v_named) = 'Renamed' then
    raise exception 'TRIAL 5 FAILED: a billed entry''s name changed';
  end if;

  -- A send of a piece-work named lump sum, as the owner flags the billing: its line carries the name.
  insert into labour_logs (plot_id, work_item_id, custom_name, contractor_id, log_date, kind, masons, helpers, others, description, work_class, created_by, updated_by)
  values (v_plot, null, 'Shifting the sump', v_contractor, current_date - 2, 'pw_lump', 0, 0, 0, 'Break and relay', 'rework', v_user, v_user)
  returning id into v_named;
  set local role authenticated;
  v_bill := send_labour_logs_to_bill(array[v_named], null, 'MISC 0156 B', current_date,
    jsonb_build_object(v_named::text, jsonb_build_object('rate', 5000, 'gst_pct', 0)), null, null, null);
  select description into v_desc from bill_lines where bill_id = v_bill;
  if v_desc not like 'Break and relay (Shifting the sump, % · Rework' then
    raise exception 'TRIAL 5 FAILED: the named lump sum reads "%"', v_desc;
  end if;

  reset role;
  raise exception 'ALL TRIALS PASSED';
end $trial$;
