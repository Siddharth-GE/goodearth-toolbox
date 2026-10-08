-- Behaviour trial for 0101–0108. Runs inside the dry-run transaction; always rolled back.
do $trial$
declare
  v_user uuid := (select id from auth.users where email = 'siddharth.cyriac.99@gmail.com');
  v_project uuid := '041b4401-ab9c-4ee5-b6d7-3443f58dbc6a';
  v_plot uuid; v_unit uuid; v_ucode text;
  v_vendor uuid := (select id from vendors where not is_contractor order by name limit 1);
  v_contractor uuid := (select id from vendors where is_contractor order by name limit 1);
  v_item uuid := (select id from items where code = 'CVL/08');
  v_uom text := (select default_uom from items where code = 'CVL/08');
  v_old_price numeric := (select indicative_price from items where code = 'CVL/08');
  v_store uuid := (select id from stores where is_active limit 1);
  v_work uuid := (select id from work_items where code = 'FD.15');
  v_po uuid; v_pl uuid; v_grn1 uuid; v_grn2 uuid; v_gl1 uuid; v_gl2 uuid; v_iss uuid; v_il uuid;
  v_bill uuid; v_n numeric; v_txt text; v_wo uuid;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  select p.id, u.id, u.code into v_plot, v_unit, v_ucode
    from plots p join units u on u.plot_id = p.id
    where p.project_id = v_project and u.code is not null limit 1;

  -- 1. PO: 50 bags at Masters + 100, 10% off. Issuing raises the Masters rate.
  insert into purchase_orders (project_id, unit_id, scope_code, vendor_id, po_no, reference, status, created_by, updated_by)
  values (v_project, v_unit, v_ucode, v_vendor, 9001, 'PO/TRIAL/001', 'draft', v_user, v_user) returning id into v_po;
  insert into purchase_order_lines (po_id, item_id, quantity, uom, rate, gst_pct, discount_pct, other_charges, created_by, updated_by)
  values (v_po, v_item, 50, v_uom, v_old_price + 100, 18, 10, 500, v_user, v_user) returning id into v_pl;
  update purchase_orders set status = 'issued', issued_by = v_user, issued_at = now() where id = v_po;

  select indicative_price into v_n from items where id = v_item;
  if round((v_old_price + 100) * 0.9, 2) > v_old_price and v_n <> round((v_old_price + 100) * 0.9, 2) then
    raise exception 'TRIAL 1 FAILED: price % expected %', v_n, round((v_old_price + 100) * 0.9, 2);
  end if;
  if round((v_old_price + 100) * 0.9, 2) > v_old_price
     and not exists (select 1 from item_price_changes where po_id = v_po) then
    raise exception 'TRIAL 1 FAILED: no item_price_changes row';
  end if;

  -- 2. Two deliveries into the store, 30 then 20; each copies the PO's net rate.
  insert into goods_receipts (project_id, po_id, store_id, to_site, grn_no, reference, received_at, created_by, updated_by)
  values (v_project, v_po, v_store, false, 9001, 'GRN/TRIAL/001', current_date - 2, v_user, v_user) returning id into v_grn1;
  insert into goods_receipt_lines (receipt_id, po_line_id, item_id, quantity, uom, created_by, updated_by)
  values (v_grn1, v_pl, v_item, 30, v_uom, v_user, v_user) returning id into v_gl1;
  insert into goods_receipts (project_id, po_id, store_id, to_site, grn_no, reference, received_at, created_by, updated_by)
  values (v_project, v_po, v_store, false, 9002, 'GRN/TRIAL/002', current_date - 1, v_user, v_user) returning id into v_grn2;
  insert into goods_receipt_lines (receipt_id, po_line_id, item_id, quantity, uom, created_by, updated_by)
  values (v_grn2, v_pl, v_item, 20, v_uom, v_user, v_user) returning id into v_gl2;

  select rate into v_n from goods_receipt_line_rates where receipt_line_id = v_gl1;
  if v_n is distinct from round((v_old_price + 100) * 0.9, 4) then
    raise exception 'TRIAL 2 FAILED: receipt rate % expected %', v_n, round((v_old_price + 100) * 0.9, 4);
  end if;

  -- 3. Issue 40 to the villa for Footing: 30 from the older batch, 10 from the newer.
  insert into stock_issues (project_id, store_id, plot_id, iss_no, reference, issued_at, work_item_id, created_by, updated_by)
  values (v_project, v_store, v_plot, 9001, 'ISS/TRIAL/001', current_date, v_work, v_user, v_user)
  returning id into v_iss;
  insert into stock_issue_lines (issue_id, item_id, quantity, uom, created_by, updated_by)
  values (v_iss, v_item, 40, v_uom, v_user, v_user) returning id into v_il;

  select quantity into v_n from batch_on_hand where receipt_line_id = v_gl1 and store_id = v_store;
  if v_n <> 0 then raise exception 'TRIAL 3 FAILED: older batch left % expected 0', v_n; end if;
  select quantity into v_n from batch_on_hand where receipt_line_id = v_gl2 and store_id = v_store;
  if v_n <> 10 then raise exception 'TRIAL 3 FAILED: newer batch left % expected 10', v_n; end if;

  -- 4. Breakage of 4 draws from what is left.
  insert into stock_adjustments (store_id, item_id, quantity, uom, reason, created_by, updated_by)
  values (v_store, v_item, -4, v_uom, 'trial breakage', v_user, v_user);
  select quantity into v_n from batch_on_hand where receipt_line_id = v_gl2 and store_id = v_store;
  if v_n <> 6 then raise exception 'TRIAL 4 FAILED: after breakage % expected 6', v_n; end if;

  -- 5. A bill with one line of 2 x 4,000: the header says 8,000.
  insert into bills (project_id, unit_id, scope_code, vendor_id, po_id, kind, bill_no, reference,
                     invoice_no, invoice_date, taxable_amount, gst_amount, total_amount, created_by, updated_by)
  values (v_project, v_unit, v_ucode, v_vendor, v_po, 'po', 9001, 'BILL/TRIAL/001',
          'INV-1', current_date, 1, 0, 1, v_user, v_user) returning id into v_bill;
  insert into bill_lines (bill_id, line_kind, po_line_id, item_id, description, uom, quantity, rate, gst_pct, created_by, updated_by)
  values (v_bill, 'material', v_pl, v_item, 'Cement', v_uom, 2, 4000, 0, v_user, v_user);
  select total_amount into v_n from bills where id = v_bill;
  if v_n <> 8000 then raise exception 'TRIAL 5 FAILED: 2 x 4000 gave %', v_n; end if;

  -- Approve it (the guard wants a named approver; bypassed for the trial only).
  alter table bills disable trigger bills_guard;
  update bills set status = 'approved', approved_by = v_user, approved_at = now() where id = v_bill;
  alter table bills enable trigger bills_guard;

  -- 6. Pay 5,000: still approved, 3,000 pending.
  insert into bill_payments (bill_id, amount, payment_ref, created_by, updated_by) values (v_bill, 5000, 'UTR1', v_user, v_user);
  select status into v_txt from bills where id = v_bill;
  if v_txt <> 'approved' then raise exception 'TRIAL 6 FAILED: part-paid bill is %', v_txt; end if;

  -- 7. Paying 4,000 more is refused.
  begin
    insert into bill_payments (bill_id, amount, payment_ref, created_by, updated_by) values (v_bill, 4000, 'UTR2', v_user, v_user);
    raise exception 'TRIAL 7 FAILED: overpayment accepted';
  exception when others then
    if sqlerrm like 'TRIAL%' then raise; end if;
  end;

  -- 8. 1,000 of an advance recovered, then 2,000 paid: the bill is paid.
  insert into contractor_advances (vendor_id, project_id, amount, payment_ref, created_by, updated_by)
  values (v_vendor, v_project, 1000, 'ADV-TRIAL', v_user, v_user);
  insert into advance_recoveries (advance_id, bill_id, amount, created_by, updated_by)
  values ((select id from contractor_advances where payment_ref = 'ADV-TRIAL'), v_bill, 1000, v_user, v_user);
  insert into bill_payments (bill_id, amount, payment_ref, created_by, updated_by) values (v_bill, 2000, 'UTR3', v_user, v_user);
  select status into v_txt from bills where id = v_bill;
  if v_txt <> 'paid' then raise exception 'TRIAL 8 FAILED: settled bill is %', v_txt; end if;

  -- 9. Piece-work by quantity needs a quantity.
  begin
    insert into labour_logs (plot_id, work_item_id, contractor_id, kind, created_by, updated_by)
    values (v_plot, v_work, v_contractor, 'pw_qty', v_user, v_user);
    raise exception 'TRIAL 9 FAILED: pw_qty with no quantity accepted';
  exception when others then
    if sqlerrm like 'TRIAL%' then raise; end if;
  end;

  -- 10. A log cannot be billed except through Send to Bill.
  insert into labour_logs (plot_id, work_item_id, contractor_id, kind, quantity, uom, created_by, updated_by)
  values (v_plot, v_work, v_contractor, 'pw_qty', 2, 'cum', v_user, v_user);
  begin
    update labour_logs set bill_id = v_bill where kind = 'pw_qty' and plot_id = v_plot and created_by = v_user;
    raise exception 'TRIAL 10 FAILED: a log was billed outside Send to Bill';
  exception when others then
    if sqlerrm like 'TRIAL%' then raise; end if;
  end;

  -- 11. A work order is numbered, and its lines set its value.
  insert into labour_contracts (vendor_id, project_id, unit_id, description, contract_value, created_by, updated_by)
  values (v_contractor, v_project, v_unit, 'Footing works (trial)', 1, v_user, v_user) returning id, reference into v_wo, v_txt;
  if v_txt not like 'WO/SAA/%' then raise exception 'TRIAL 11 FAILED: reference %', v_txt; end if;
  insert into labour_contract_lines (contract_id, work_item_id, description, uom, quantity, rate, created_by, updated_by)
  values (v_wo, v_work, 'Footing', 'cum', 2, 4000, v_user, v_user);
  select contract_value into v_n from labour_contracts where id = v_wo;
  if v_n <> 8000 then raise exception 'TRIAL 11 FAILED: value % expected 8000', v_n; end if;

  raise exception 'ALL TRIALS PASSED';
end $trial$;
