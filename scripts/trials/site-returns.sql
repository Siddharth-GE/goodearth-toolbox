-- Behaviour trial for 0159 — material returned from a villa to a store. Runs inside the dry-run transaction; always
-- rolled back. The store's steps run UNDER ROW-LEVEL SECURITY as the staff account holding /inventory alone
-- (BUGCATCHER #19).
--
--   npx tsx scripts/dry-run-migrations.ts --project ipstebqawrvhkyntctrv \
--     supabase/migrations/0159_*.sql --trial scripts/trials/site-returns.sql
do $trial$
declare
  v_user uuid := (select id from auth.users where email = 'siddharth.cyriac.99@gmail.com');
  s_user uuid := gen_random_uuid();
  v_project uuid := '041b4401-ab9c-4ee5-b6d7-3443f58dbc6a';
  v_plot uuid;
  v_unit uuid;
  v_ucode text;
  v_vendor uuid := (select id from vendors where not is_contractor and is_active order by name limit 1);
  v_item uuid := (select id from items where kind = 'material' and is_active and default_uom is not null order by code limit 1);
  v_uom text;
  v_store uuid;
  v_work uuid := (select id from work_items where is_active order by code limit 1);
  v_store2 uuid;
  v_po uuid;
  v_pl uuid;
  v_grn uuid;
  v_grl uuid;
  v_issue uuid;
  v_return uuid;
  v_pl2 uuid;
  v_grn2 uuid;
  v_grl2 uuid;
  v_n numeric;
  v_refused boolean;
  v_msg text;
begin
  select default_uom into v_uom from items where id = v_item;
  select p.id, u.id, u.code into v_plot, v_unit, v_ucode
    from plots p join units u on u.plot_id = p.id
    where p.project_id = v_project and u.code is not null limit 1;
  select id into v_store from stores where is_active order by name limit 1;
  select id into v_store2 from stores where is_active and id <> v_store order by name limit 1;
  if v_user is null or v_plot is null or v_vendor is null or v_item is null or v_store2 is null then
    raise exception 'TRIAL SETUP: staging is missing an account, a plot, a vendor, a material or two stores';
  end if;
  insert into auth_verified_sessions (session_id, user_id, method) values (s_user, v_user, 'otp');
  alter table purchase_order_lines drop constraint if exists purchase_order_lines_from_an_indent;

  -- Setup, as the owner: 10 received into the first store at ₹100.
  insert into purchase_orders (project_id, unit_id, scope_code, vendor_id, po_no, reference, status, created_by, updated_by)
  values (v_project, v_unit, v_ucode, v_vendor, 9359, 'PO/TRIAL/359', 'draft', v_user, v_user)
  returning id into v_po;
  insert into purchase_order_lines (po_id, item_id, quantity, uom, rate, gst_pct, created_by, updated_by)
  values (v_po, v_item, 10, v_uom, 100, 18, v_user, v_user) returning id into v_pl;
  insert into purchase_order_lines (po_id, item_id, quantity, uom, rate, gst_pct, created_by, updated_by)
  values (v_po, v_item, 3, v_uom, 100, 18, v_user, v_user) returning id into v_pl2;
  update purchase_orders set status = 'issued', issued_by = v_user, issued_at = now() where id = v_po;
  insert into goods_receipts (project_id, po_id, store_id, to_site, grn_no, reference, received_at, created_by, updated_by)
  values (v_project, v_po, v_store, false, 9359, 'GRN/TRIAL/359', current_date, v_user, v_user)
  returning id into v_grn;
  insert into goods_receipt_lines (receipt_id, po_line_id, item_id, quantity, uom, created_by, updated_by)
  values (v_grn, v_pl, v_item, 10, v_uom, v_user, v_user) returning id into v_grl;

  -- The store-keeper: /inventory alone.
  update profiles set role_id = null where id = v_user;
  delete from user_apps where user_id = v_user;
  insert into user_apps (user_id, app) values (v_user, '/inventory');
  perform set_config('request.jwt.claims', json_build_object('sub', v_user,
    'role', 'authenticated', 'session_id', s_user)::text, true);
  set local role authenticated;

  -- 1. Issue 6 to the villa, then return 4 of them to the second store.
  v_issue := create_stock_issue(v_store, null, v_plot, v_work, null, current_date, 'Trial');
  insert into stock_issue_lines (issue_id, item_id, quantity, uom, created_by, updated_by)
  values (v_issue, v_item, 6, v_uom, v_user, v_user);
  insert into site_returns (plot_id, store_id, reason, created_by, updated_by)
  values (v_plot, v_store2, 'Left over after the slab', v_user, v_user) returning id into v_return;
  insert into site_return_lines (return_id, item_id, quantity, uom, created_by, updated_by)
  values (v_return, v_item, 4, 'nonsense', v_user, v_user);

  select quantity into v_n from stock_on_hand where store_id = v_store2 and item_id = v_item;
  if v_n is distinct from 4 then raise exception 'TRIAL 1 FAILED: the second store holds %, expected 4', v_n; end if;
  select quantity into v_n from stock_by_location where location_kind = 'plot' and location_id = v_plot and item_id = v_item;
  if v_n is distinct from 2 then raise exception 'TRIAL 1 FAILED: the villa holds %, expected 2', v_n; end if;
  select quantity into v_n from batch_on_hand where store_id = v_store2 and receipt_line_id = v_grl;
  if v_n is distinct from 4 then raise exception 'TRIAL 1 FAILED: the batch in the second store is %, expected 4', v_n; end if;
  if (select uom from site_return_lines where return_id = v_return) is distinct from v_uom then
    raise exception 'TRIAL 1 FAILED: the line did not take the item''s own unit';
  end if;

  -- 2. Never more than is still at the villa.
  --    Through record_site_return, as the screen saves: a refused line leaves no empty return behind.
  v_refused := false;
  begin
    perform record_site_return(v_plot, v_store, current_date, 'Too much',
      jsonb_build_array(jsonb_build_object('item_id', v_item, 'quantity', 3)));
  exception when raise_exception then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 2 FAILED: more came back than was at the villa'; end if;
  if (select count(*) from site_returns where plot_id = v_plot) <> 1 then
    raise exception 'TRIAL 2 FAILED: a refused return left a header behind';
  end if;
  v_return := record_site_return(v_plot, v_store, current_date, 'A second return',
    jsonb_build_array(jsonb_build_object('item_id', v_item, 'quantity', 2)));
  -- The second return empties the villa back into the first store, at the batch the villa drew.
  select quantity into v_n from batch_on_hand where store_id = v_store and receipt_line_id = v_grl;
  if v_n is distinct from 6 then raise exception 'TRIAL 2 FAILED: the first store''s batch is %, expected 6', v_n; end if;

  -- 3. A return stands: an edit changes nothing (no update policy, and a guard behind it); and the issue it came
  --    from cannot be deleted now.
  update site_return_lines set quantity = 1 where return_id = v_return;
  if (select quantity from site_return_lines where return_id = v_return) <> 2 then
    raise exception 'TRIAL 3 FAILED: a return line was changed';
  end if;
  v_refused := false;
  begin
    perform delete_stock_issue(v_issue, 'Trial');
  exception when raise_exception then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 3 FAILED: the issue was deleted after a return'; end if;

  reset role;

  -- 4. The villa's material cost: 6 issued at ₹100, all 6 back = ₹0.
  -- villa_cost_facts is gated: the trial person reads it with /estimator.
  insert into user_apps (user_id, app) values (v_user, '/estimator');
  select sum(amount) into v_n from villa_cost_facts where plot_id = v_plot and kind = 'material_issued';
  if v_n is distinct from 0 then raise exception 'TRIAL 4 FAILED: the villa''s material issued is %, expected 0', v_n; end if;

  -- The issue counts +600 under its work, the returns -600 with no work: not two zeros.
  if (select amount from villa_cost_facts where plot_id = v_plot and kind = 'material_issued' and work_item_id = v_work) <> 600
     or (select amount from villa_cost_facts where plot_id = v_plot and kind = 'material_issued' and work_item_id is null) <> -600 then
    raise exception 'TRIAL 4 FAILED: the issue and the returns are not valued +600 and -600';
  end if;

  -- 5. Material delivered straight to the villa comes back as a batch of its own, at its delivery's rate; and that
  --    delivery cannot be deleted once some of it came back.
  insert into goods_receipts (project_id, po_id, store_id, to_site, plot_id, unit_id, work_item_id, grn_no, reference, received_at, created_by, updated_by)
  values (v_project, v_po, null, true, null, v_unit, v_work, 9360, 'GRN/TRIAL/360', current_date, v_user, v_user)
  returning id into v_grn2;
  insert into goods_receipt_lines (receipt_id, po_line_id, item_id, quantity, uom, created_by, updated_by)
  values (v_grn2, v_pl2, v_item, 3, v_uom, v_user, v_user) returning id into v_grl2;
  set local role authenticated;
  perform record_site_return(v_plot, v_store2, current_date, 'Delivered too much',
    jsonb_build_array(jsonb_build_object('item_id', v_item, 'quantity', 3)));
  select quantity into v_n from batch_on_hand where store_id = v_store2 and receipt_line_id = v_grl2;
  if v_n is distinct from 3 then raise exception 'TRIAL 5 FAILED: the delivery''s batch in the store is %, expected 3', v_n; end if;
  reset role;
  if (select amount from villa_cost_facts where plot_id = v_plot and kind = 'material_issued' and work_item_id is null) <> -900 then
    raise exception 'TRIAL 5 FAILED: the direct delivery''s return is not valued at ₹300';
  end if;
  -- The delivery names the house, not the plot, and still counts at the villa.
  if (select amount from villa_cost_facts where plot_id = v_plot and kind = 'material_delivered') is distinct from 300 then
    raise exception 'TRIAL 5 FAILED: the delivery to the house is not ₹300 at its villa';
  end if;
  v_msg := null;
  begin
    delete from goods_receipt_lines where id = v_grl2;
  exception when others then v_msg := sqlerrm;
  end;
  if v_msg is null or v_msg not like '%come back from that villa%' then
    raise exception 'TRIAL 5 FAILED: the delivery was deleted after a return (%)', v_msg;
  end if;

  -- 6. Every line must be an item: an unknown id is refused, not dropped.
  set local role authenticated;
  v_refused := false;
  begin
    perform record_site_return(v_plot, v_store, current_date, 'Unknown item',
      jsonb_build_array(jsonb_build_object('item_id', gen_random_uuid(), 'quantity', 1)));
  exception when raise_exception then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 6 FAILED: a return with an unknown item was saved'; end if;
  reset role;

  raise exception 'ALL TRIALS PASSED';
end $trial$;
