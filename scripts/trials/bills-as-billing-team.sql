-- Behaviour trial for the B7 screens' writes, as the billing team.
-- Runs inside the dry-run transaction; always rolled back.
--
-- Everything after the setup runs UNDER ROW-LEVEL SECURITY (set local
-- role authenticated) as a /bills-only person — the founder's staging
-- account, made so inside this transaction. A trial run as the database
-- owner bypasses every policy; that is how 0106's guard passed review
-- while refusing this very person (0111).
--
-- Needs 0111 in the same run:
--   npx tsx scripts/dry-run-migrations.ts --project ipstebqawrvhkyntctrv \
--     supabase/migrations/0110_*.sql supabase/migrations/0111_*.sql \
--     --trial scripts/trials/bills-as-billing-team.sql
do $trial$
declare
  v_user uuid := (select id from auth.users where email = 'siddharth.cyriac.99@gmail.com');
  v_project uuid := '041b4401-ab9c-4ee5-b6d7-3443f58dbc6a';
  v_plot uuid;
  v_unit uuid;
  v_ucode text;
  v_vendor uuid := (select id from vendors where not is_contractor order by name limit 1);
  v_contractor uuid := (select id from vendors where is_contractor order by name limit 1);
  v_item uuid := (select id from items where code = 'CVL/08');
  v_uom text := (select default_uom from items where code = 'CVL/08');
  v_work uuid := (select id from work_items where code = 'FD.15');
  v_store uuid := (select id from stores where is_active limit 1);
  v_po uuid;
  v_pl uuid;
  v_grn uuid;
  v_wo uuid;
  v_nmr_log uuid;
  v_pw_log uuid;
  v_bill uuid;
  v_line uuid;
  v_nmr_bill uuid;
  v_pw_bill uuid;
  v_n numeric;
  v_count int;
begin
  select p.id, u.id, u.code into v_plot, v_unit, v_ucode
    from plots p join units u on u.plot_id = p.id
    where p.project_id = v_project and u.code is not null limit 1;

  -- Setup, as the owner: an issued PO, 30 received of it, an approved
  -- work order for the contractor, and two unbilled labour entries.
  insert into purchase_orders (project_id, unit_id, scope_code, vendor_id, po_no, reference, status, created_by, updated_by)
  values (v_project, v_unit, v_ucode, v_vendor, 9201, 'PO/TRIAL/201', 'draft', v_user, v_user)
  returning id into v_po;
  insert into purchase_order_lines (po_id, item_id, quantity, uom, rate, gst_pct, discount_pct, created_by, updated_by)
  values (v_po, v_item, 50, v_uom, 400, 18, 10, v_user, v_user) returning id into v_pl;
  update purchase_orders set status = 'issued', issued_by = v_user, issued_at = now() where id = v_po;
  insert into goods_receipts (project_id, po_id, store_id, to_site, grn_no, reference, received_at, created_by, updated_by)
  values (v_project, v_po, v_store, false, 9201, 'GRN/TRIAL/201', current_date, v_user, v_user)
  returning id into v_grn;
  insert into goods_receipt_lines (receipt_id, po_line_id, item_id, quantity, uom, created_by, updated_by)
  values (v_grn, v_pl, v_item, 30, v_uom, v_user, v_user);

  insert into bill_approvers (user_id) values (v_user) on conflict do nothing;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  insert into labour_contracts (vendor_id, project_id, unit_id, description, contract_value, created_by, updated_by)
  values (v_contractor, v_project, v_unit, 'Trial footing', 8000, v_user, v_user)
  returning id into v_wo;
  insert into labour_contract_lines (contract_id, work_item_id, description, is_lump_sum, uom, quantity, rate, created_by, updated_by)
  values (v_wo, v_work, 'Footing', false, 'cum', 2, 4000, v_user, v_user);
  update labour_contracts set status = 'approved', approved_by = v_user, approved_at = now() where id = v_wo;

  insert into labour_logs (plot_id, work_item_id, contractor_id, log_date, kind, masons, helpers, others, created_by, updated_by)
  values (v_plot, v_work, v_contractor, current_date - 20, 'nmr', 2, 3, 0, v_user, v_user)
  returning id into v_nmr_log;
  insert into labour_logs (plot_id, work_item_id, contractor_id, log_date, kind, masons, helpers, others, quantity, uom, created_by, updated_by)
  values (v_plot, v_work, v_contractor, current_date - 20, 'pw_qty', 0, 0, 0, 2, 'cum', v_user, v_user)
  returning id into v_pw_log;

  -- The founder becomes a /bills-only person.
  delete from user_apps where user_id = v_user
    and app in ('/purchase-orders', '/reporter', '/supervisors', '/inventory', '/estimator');
  insert into user_apps (user_id, app) values (v_user, '/bills') on conflict do nothing;
  set local role authenticated;

  -- 1. A material bill: minted as the person, its line from the PO
  --    (received 30, billed 0), and the header follows the line.
  v_bill := create_bill(v_po, null, 'INV-T201', current_date, 1, 0, 1, null);
  insert into bill_lines (bill_id, sort_order, line_kind, po_line_id, item_id, description, uom, quantity, rate, gst_pct, discount_amount, created_by, updated_by)
  values (v_bill, 0, 'material', v_pl, v_item, 'Cement', v_uom, 30, 400, 18, 1200, v_user, v_user)
  returning id into v_line;
  select total_amount into v_n from bills where id = v_bill;
  -- 30 × 400 = 12,000 − 1,200 = 10,800, + 18% = 12,744.
  if v_n <> 12744 then raise exception 'TRIAL 1 FAILED: material bill total % expected 12744', v_n; end if;
  select billed_quantity into v_n from po_line_billing_facts where po_line_id = v_pl;
  if v_n <> 30 then raise exception 'TRIAL 1 FAILED: billed quantity % expected 30', v_n; end if;

  -- 2. Changing the line's rate moves the header; an "other" line adds to it.
  update bill_lines set rate = 410, updated_by = v_user where id = v_line;
  insert into bill_lines (bill_id, sort_order, line_kind, description, quantity, rate, gst_pct, created_by, updated_by)
  values (v_bill, 1, 'other', 'Unloading', 1, 500, 0, v_user, v_user);
  select total_amount into v_n from bills where id = v_bill;
  -- 30 × 410 = 12,300 − 1,200 = 11,100, + 18% = 13,098, + 500 = 13,598.
  if v_n <> 13598 then raise exception 'TRIAL 2 FAILED: total % expected 13598', v_n; end if;

  -- 3. Daily wages: Send to Bill makes the bill, its lines, and stamps the entry.
  v_nmr_bill := send_labour_logs_to_bill(array[v_nmr_log], null, 'NMR T1', current_date,
    '{"mason": 900, "helper": 700, "gst_pct": 0}'::jsonb, null, null, null);
  select total_amount into v_n from bills where id = v_nmr_bill;
  if v_n <> 2 * 900 + 3 * 700 then raise exception 'TRIAL 3 FAILED: NMR total % expected 3900', v_n; end if;
  select count(*) into v_count from labour_logs where id = v_nmr_log and bill_id = v_nmr_bill;
  if v_count <> 1 then raise exception 'TRIAL 3 FAILED: the entry is not stamped (seen %)', v_count; end if;

  -- 4. The muster roll says otherwise: a total by hand with its reason.
  update bills set total_amount = 3800, total_override_note = 'Half day for one helper',
    updated_by = v_user where id = v_nmr_bill;
  select total_amount into v_n from bills where id = v_nmr_bill;
  if v_n <> 3800 then raise exception 'TRIAL 4 FAILED: override total %', v_n; end if;

  -- 5. Piece-work against the work order: 2 cum at 4,000 is 8,000.
  v_pw_bill := send_labour_logs_to_bill(array[v_pw_log], v_wo, 'PW T1', current_date,
    jsonb_build_object(v_pw_log::text, jsonb_build_object('rate', 4000, 'gst_pct', 0)), null, null, null);
  select total_amount into v_n from bills where id = v_pw_bill;
  if v_n <> 8000 then raise exception 'TRIAL 5 FAILED: piece-work total % expected 8000', v_n; end if;

  -- 6. Deleting the NMR bill gives its entry back to be sent again.
  perform delete_recorded_bill(v_nmr_bill);
  select count(*) into v_count from labour_logs where id = v_nmr_log and bill_id is null;
  if v_count <> 1 then raise exception 'TRIAL 6 FAILED: the entry was not set free'; end if;
  select count(*) into v_count from bills where id = v_nmr_bill;
  if v_count <> 0 then raise exception 'TRIAL 6 FAILED: the bill is still there'; end if;

  -- 7. A line is removed; the header follows.
  delete from bill_lines where bill_id = v_bill and line_kind = 'other';
  select total_amount into v_n from bills where id = v_bill;
  if v_n <> 13098 then raise exception 'TRIAL 7 FAILED: total % expected 13098', v_n; end if;

  reset role;
  raise notice 'TRIAL B7 OK — the billing team bills materials and labour under RLS';
end $trial$;
