-- Behaviour trial for 0146 — deleting a delivery or an issue while nothing has touched it. Runs inside the dry-run
-- transaction; always rolled back, UNDER ROW-LEVEL SECURITY (BUGCATCHER #19), as the staff account holding /inventory
-- only — who cannot read bills or POs, which both functions must still see.
--
--   npx tsx scripts/dry-run-migrations.ts --project ipstebqawrvhkyntctrv \
--     supabase/migrations/0146_*.sql --trial scripts/trials/delete-untouched-stock.sql
do $trial$
declare
  v_user uuid := (select id from auth.users where email = 'siddharth.cyriac.99@gmail.com');
  s_user uuid := gen_random_uuid();
  v_project uuid;
  v_unit uuid;
  v_ucode text;
  v_plot uuid;
  v_vendor uuid := (select id from vendors where not is_contractor and is_active order by name limit 1);
  v_item uuid;
  v_uom text;
  v_work uuid := (select id from work_items where is_active order by code limit 1);
  v_store_a uuid;
  v_store_b uuid;
  v_po uuid;
  v_po_line uuid;
  v_grn uuid;
  v_grn2 uuid;
  v_issue uuid;
  v_transfer uuid;
  v_onward uuid;
  v_request uuid;
  v_bill uuid;
  v_text text;
  v_refused boolean;
begin
  -- Its PO line is a fixture with no indent behind it (the rule since 0113 is lifted for this rolled-back trial only).
  alter table purchase_order_lines drop constraint if exists purchase_order_lines_from_an_indent;
  select p.project_id, u.id, u.code, p.id into v_project, v_unit, v_ucode, v_plot
    from plots p join units u on u.plot_id = p.id join projects pr on pr.id = p.project_id
   where u.code is not null and pr.code is not null and not pr.is_test
   order by u.id limit 1;
  select id, default_uom into v_item, v_uom from items
   where default_uom is not null and is_active and kind = 'material' order by code limit 1;
  if v_user is null or v_project is null or v_vendor is null or v_item is null or v_work is null then
    raise exception 'TRIAL SETUP: staging is missing the staff account, a coded villa, a vendor, a material or a work';
  end if;

  -- Setup, as the owner: two stores and an issued PO for 50.
  insert into stores (name, project_id) values ('Trial store A', v_project) returning id into v_store_a;
  insert into stores (name, project_id) values ('Trial store B', v_project) returning id into v_store_b;
  insert into purchase_orders (project_id, unit_id, scope_code, vendor_id, po_no, reference, status, created_by, updated_by)
  values (v_project, v_unit, v_ucode, v_vendor, 9461, 'PO/TRIAL/461', 'draft', v_user, v_user) returning id into v_po;
  insert into purchase_order_lines (po_id, item_id, quantity, uom, rate, gst_pct, created_by, updated_by)
  values (v_po, v_item, 50, v_uom, 400, 18, v_user, v_user) returning id into v_po_line;
  update purchase_orders set status = 'issued', issued_by = v_user, issued_at = now() where id = v_po;

  insert into auth_verified_sessions (session_id, user_id, method) values (s_user, v_user, 'otp');
  update profiles set role_id = null where id = v_user;
  delete from user_apps where user_id = v_user;
  insert into user_apps (user_id, app) values (v_user, '/inventory');
  perform set_config('request.jwt.claims', json_build_object('sub', v_user,
    'role', 'authenticated', 'session_id', s_user)::text, true);
  set local role authenticated;

  -- The whole PO arrives in store A, and completes it.
  v_grn := create_goods_receipt(p_po_id => v_po, p_store_id => v_store_a, p_to_site => false,
    p_work_item_id => null, p_challan_no => 'CH-T1', p_received_at => current_date, p_note => null);
  insert into goods_receipt_lines (receipt_id, po_line_id, item_id, quantity, uom, created_by, updated_by)
  values (v_grn, v_po_line, v_item, 50, v_uom, v_user, v_user);
  reset role;
  if (select status from purchase_orders where id = v_po) <> 'completed' then
    raise exception 'TRIAL SETUP: the delivery did not complete the PO';
  end if;
  -- A supervisor's request, which the issue below fulfils.
  insert into issue_requests (plot_id, work_item_id, item_id, quantity, created_by)
  values (v_plot, v_work, v_item, 10, v_user) returning id into v_request;
  set local role authenticated;

  -- 10 go to the villa against the request.
  v_issue := create_stock_issue(p_store_id => v_store_a, p_to_store_id => null, p_plot_id => v_plot,
    p_work_item_id => v_work, p_project_id => null, p_issued_at => current_date, p_note => null);
  insert into stock_issue_lines (issue_id, item_id, quantity, uom, created_by, updated_by)
  values (v_issue, v_item, 10, v_uom, v_user, v_user);
  update issue_requests set status = 'fulfilled', fulfilled_issue_id = v_issue where id = v_request;

  -- 1. A delivery something was issued from stays.
  v_text := null;
  begin
    perform delete_goods_receipt(v_grn, 'Entered twice');
  exception when others then v_text := sqlerrm;
  end;
  if v_text not like 'Material from this delivery has already been issued%' then
    raise exception 'TRIAL 1 FAILED: a drawn-on delivery gave %', coalesce(v_text, 'no refusal');
  end if;

  -- 2. No reason, no delete; and a person without /inventory cannot.
  v_refused := false;
  begin
    perform delete_stock_issue(v_issue, ' ');
  exception when others then v_refused := sqlerrm like 'Say why%';
  end;
  if not v_refused then raise exception 'TRIAL 2a FAILED: an issue was deleted with no reason'; end if;
  reset role;
  delete from user_apps where user_id = v_user;
  insert into user_apps (user_id, app) values (v_user, '/supervisors');
  set local role authenticated;
  v_refused := false;
  begin
    perform delete_stock_issue(v_issue, 'Wrong villa');
  exception when others then v_refused := sqlerrm like 'Only the store can delete%';
  end;
  if not v_refused then raise exception 'TRIAL 2b FAILED: a supervisor deleted an issue'; end if;
  reset role;
  delete from user_apps where user_id = v_user;
  insert into user_apps (user_id, app) values (v_user, '/inventory');
  set local role authenticated;

  -- 3. The issue goes: the stock is back, the request is open again, and the deletion is on record.
  perform delete_stock_issue(v_issue, 'Wrong villa');
  if stock_qty_on_hand(v_store_a, v_item) <> 50 then
    raise exception 'TRIAL 3a FAILED: store A holds %, expected 50', stock_qty_on_hand(v_store_a, v_item);
  end if;
  if (select (status, fulfilled_issue_id) from issue_requests where id = v_request)
     is distinct from ('requested'::text, null::uuid) then
    raise exception 'TRIAL 3b FAILED: the request did not reopen';
  end if;
  if not exists (select 1 from stock_deletions where kind = 'issue' and reason = 'Wrong villa' and deleted_by = v_user) then
    raise exception 'TRIAL 3c FAILED: the deletion is not on record';
  end if;

  -- 4. A transfer whose material has moved on stays; once that onward issue goes, so can the transfer.
  v_transfer := create_stock_issue(p_store_id => v_store_a, p_to_store_id => v_store_b, p_plot_id => null,
    p_work_item_id => null, p_project_id => v_project, p_issued_at => current_date, p_note => null);
  insert into stock_issue_lines (issue_id, item_id, quantity, uom, created_by, updated_by)
  values (v_transfer, v_item, 20, v_uom, v_user, v_user);
  v_onward := create_stock_issue(p_store_id => v_store_b, p_to_store_id => null, p_plot_id => v_plot,
    p_work_item_id => v_work, p_project_id => null, p_issued_at => current_date, p_note => null);
  insert into stock_issue_lines (issue_id, item_id, quantity, uom, created_by, updated_by)
  values (v_onward, v_item, 5, v_uom, v_user, v_user);
  v_text := null;
  begin
    perform delete_stock_issue(v_transfer, 'Wrong store');
  exception when others then v_text := sqlerrm;
  end;
  if v_text not like 'Material from this transfer has already left%' then
    raise exception 'TRIAL 4a FAILED: a transfer moved on gave %', coalesce(v_text, 'no refusal');
  end if;
  perform delete_stock_issue(v_onward, 'Not sent');
  perform delete_stock_issue(v_transfer, 'Wrong store');
  if stock_qty_on_hand(v_store_a, v_item) <> 50 or stock_qty_on_hand(v_store_b, v_item) <> 0 then
    raise exception 'TRIAL 4b FAILED: stores hold % and %', stock_qty_on_hand(v_store_a, v_item),
      stock_qty_on_hand(v_store_b, v_item);
  end if;

  -- 5. A confirmed issue stays.
  v_issue := create_stock_issue(p_store_id => v_store_a, p_to_store_id => null, p_plot_id => v_plot,
    p_work_item_id => v_work, p_project_id => null, p_issued_at => current_date, p_note => null);
  insert into stock_issue_lines (issue_id, item_id, quantity, uom, created_by, updated_by)
  values (v_issue, v_item, 3, v_uom, v_user, v_user);
  reset role;
  insert into site_receipt_confirmations (issue_id, confirmed_by) values (v_issue, v_user);
  set local role authenticated;
  v_refused := false;
  begin
    perform delete_stock_issue(v_issue, 'Wrong villa');
  exception when others then v_refused := sqlerrm like 'The site has confirmed this issue%';
  end;
  if not v_refused then raise exception 'TRIAL 5 FAILED: a confirmed issue was deleted'; end if;
  reset role;
  delete from site_receipt_confirmations where issue_id = v_issue;
  set local role authenticated;
  perform delete_stock_issue(v_issue, 'Wrong villa');

  -- 6. The untouched delivery goes, and the PO is open to receive again.
  perform delete_goods_receipt(v_grn, 'Entered twice');
  reset role;
  if exists (select 1 from goods_receipts where id = v_grn)
     or (select status from purchase_orders where id = v_po) <> 'issued'
     or stock_qty_on_hand(v_store_a, v_item) <> 0 then
    raise exception 'TRIAL 6 FAILED: the delivery, the PO or the stock did not follow';
  end if;

  -- 7. A delivery a bill counts on stays — the store-keeper cannot read the bill, but the function can.
  set local role authenticated;
  v_grn2 := create_goods_receipt(p_po_id => v_po, p_store_id => v_store_a, p_to_site => false,
    p_work_item_id => null, p_challan_no => 'CH-T2', p_received_at => current_date, p_note => null);
  insert into goods_receipt_lines (receipt_id, po_line_id, item_id, quantity, uom, created_by, updated_by)
  values (v_grn2, v_po_line, v_item, 10, v_uom, v_user, v_user);
  reset role;
  insert into bills (project_id, unit_id, scope_code, vendor_id, po_id, kind, bill_no, reference,
                     invoice_no, invoice_date, taxable_amount, gst_amount, total_amount, created_by, updated_by)
  values (v_project, v_unit, v_ucode, v_vendor, v_po, 'po', 9461, 'BILL/TRIAL/461',
          'INV-T461', current_date, 1, 0, 1, v_user, v_user)
  returning id into v_bill;
  -- bill_lines_guard reads as the claimed /inventory-only person, so it is set aside for this one fixture row.
  alter table bill_lines disable trigger bill_lines_guard;
  insert into bill_lines (bill_id, line_kind, po_line_id, item_id, description, uom, quantity, rate, gst_pct, created_by, updated_by)
  values (v_bill, 'material', v_po_line, v_item, 'Trial', v_uom, 10, 400, 0, v_user, v_user);
  alter table bill_lines enable trigger bill_lines_guard;
  set local role authenticated;
  v_refused := false;
  begin
    perform delete_goods_receipt(v_grn2, 'Entered twice');
  exception when others then v_refused := sqlerrm like 'A bill already counts this delivery%';
  end;
  if not v_refused then raise exception 'TRIAL 7 FAILED: a billed delivery was deleted'; end if;

  reset role;
  raise exception 'ALL TRIALS PASSED';
end $trial$;
