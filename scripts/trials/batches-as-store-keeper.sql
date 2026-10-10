-- Behaviour trial for B9's screens' writes (0108), as a store-keeper.
-- Runs inside the dry-run transaction; always rolled back.
--
-- Everything after the setup runs UNDER ROW-LEVEL SECURITY (set local
-- role authenticated) as an /inventory-only person — the staff Siddharth
-- account (the gmail one, not the founder's admin login), made so inside
-- this transaction. Then the same person loses /inventory and must see no
-- rates. A trial run as the database owner bypasses every policy.
--
--   npx tsx scripts/dry-run-migrations.ts --project ipstebqawrvhkyntctrv \
--     supabase/migrations/0108_*.sql \
--     --trial scripts/trials/batches-as-store-keeper.sql
do $trial$
declare
  v_user uuid := (select id from auth.users where email = 'siddharth.cyriac.99@gmail.com');
  v_project uuid := '041b4401-ab9c-4ee5-b6d7-3443f58dbc6a';
  v_unit uuid;
  v_ucode text;
  v_plot uuid;
  v_vendor uuid := (select id from vendors where not is_contractor order by name limit 1);
  v_item uuid := (select id from items where code = 'CVL/08');
  v_uom text := (select default_uom from items where code = 'CVL/08');
  v_work uuid := (select id from work_items where code = 'FD.15');
  v_store_a uuid;
  v_store_b uuid;
  v_po uuid;
  v_po_line uuid;
  v_grn uuid;
  v_batch1 uuid;
  v_batch2 uuid;
  v_issue uuid;
  v_issue_line uuid;
  v_n numeric;
  v_rows int;
begin
  select u.id, u.code, p.id into v_unit, v_ucode, v_plot
    from plots p join units u on u.plot_id = p.id
    where p.project_id = v_project and u.code is not null limit 1;

  -- Setup, as the owner: two stores, and an issued PO for 50 at ₹400
  -- less 5% (₹380 net) with 18% GST.
  insert into stores (name, project_id) values ('Trial store A', v_project) returning id into v_store_a;
  insert into stores (name, project_id) values ('Trial store B', v_project) returning id into v_store_b;
  insert into purchase_orders (project_id, unit_id, scope_code, vendor_id, po_no, reference, status, created_by, updated_by)
  values (v_project, v_unit, v_ucode, v_vendor, 9401, 'PO/TRIAL/401', 'draft', v_user, v_user)
  returning id into v_po;
  insert into purchase_order_lines (po_id, item_id, quantity, uom, rate, discount_pct, gst_pct, created_by, updated_by)
  values (v_po, v_item, 50, v_uom, 400, 5, 18, v_user, v_user)
  returning id into v_po_line;
  update purchase_orders set status = 'issued', issued_by = v_user, issued_at = now() where id = v_po;

  -- The person becomes /inventory only.
  delete from user_apps where user_id = v_user and app <> '/inventory';
  insert into user_apps (user_id, app) values (v_user, '/inventory') on conflict do nothing;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- 1. Two deliveries into store A, a day apart: 30, then 20. Each line
  --    takes the PO's net rate through the definer trigger — the keeper
  --    cannot read purchase_order_lines.
  v_grn := create_goods_receipt(p_po_id => v_po, p_store_id => v_store_a, p_to_site => false,
    p_work_item_id => null, p_challan_no => 'CH-1', p_received_at => current_date - 2, p_note => null);
  insert into goods_receipt_lines (receipt_id, po_line_id, item_id, quantity, uom, created_by, updated_by)
  values (v_grn, v_po_line, v_item, 30, v_uom, v_user, v_user) returning id into v_batch1;
  v_grn := create_goods_receipt(p_po_id => v_po, p_store_id => v_store_a, p_to_site => false,
    p_work_item_id => null, p_challan_no => 'CH-2', p_received_at => current_date - 1, p_note => null);
  insert into goods_receipt_lines (receipt_id, po_line_id, item_id, quantity, uom, created_by, updated_by)
  values (v_grn, v_po_line, v_item, 20, v_uom, v_user, v_user) returning id into v_batch2;

  select rate into v_n from goods_receipt_line_rates where receipt_line_id = v_batch1
    and po_rate = 380 and gst_pct = 18 and po_gst_pct = 18;
  if v_n is distinct from 380 then raise exception 'TRIAL 1 FAILED: batch 1 rate is %, expected 380', v_n; end if;

  -- 2. The second delivery's bill says ₹395: the keeper changes it, and
  --    the PO's rate stays beside it.
  update goods_receipt_line_rates set rate = 395, note = 'Bill 4521', updated_by = v_user
    where receipt_line_id = v_batch2;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then raise exception 'TRIAL 2 FAILED: the rate update touched % rows', v_rows; end if;
  select po_rate into v_n from goods_receipt_line_rates where receipt_line_id = v_batch2 and rate = 395;
  if v_n is distinct from 380 then raise exception 'TRIAL 2 FAILED: PO rate beside it is %', v_n; end if;

  -- 3. The PO's rate itself never moves.
  begin
    update goods_receipt_line_rates set po_rate = 1 where receipt_line_id = v_batch2;
    raise exception 'TRIAL 3 FAILED: the PO''s rate was rewritten';
  exception when others then
    if sqlerrm not like '%never changes%' then raise; end if;
  end;

  -- 4. Nobody writes a rate row, a batch movement or the allocation by hand.
  begin
    insert into goods_receipt_line_rates (receipt_line_id, rate) values (v_batch1, 1);
    raise exception 'TRIAL 4 FAILED: a rate row was inserted by hand';
  exception when others then
    if sqlerrm not like '%row-level security%' and sqlerrm not like '%duplicate key%' then raise; end if;
  end;
  begin
    insert into stock_batch_movements (receipt_line_id, store_id, quantity, adjustment_id)
    values (v_batch1, v_store_a, -1, null);
    raise exception 'TRIAL 4 FAILED: a batch movement was written by hand';
  exception when others then
    if sqlerrm not like '%row-level security%' and sqlerrm not like '%one_cause%' then raise; end if;
  end;
  begin
    perform allocate_batches(v_store_a, v_item, 1, null, null, null, null);
    raise exception 'TRIAL 4 FAILED: the keeper ran the allocation directly';
  exception when others then
    if sqlerrm not like '%permission denied%' then raise; end if;
  end;

  -- 5. An issue of 40 to the plot takes the oldest first: 30 from batch 1,
  --    10 from batch 2 — worth 30 × 380 + 10 × 395 = ₹15,350.
  v_issue := create_stock_issue(p_store_id => v_store_a, p_to_store_id => null, p_plot_id => v_plot,
    p_work_item_id => v_work, p_project_id => null, p_issued_at => current_date, p_note => null);
  insert into stock_issue_lines (issue_id, item_id, quantity, uom, created_by, updated_by)
  values (v_issue, v_item, 40, v_uom, v_user, v_user) returning id into v_issue_line;
  select sum(-m.quantity) filter (where m.receipt_line_id = v_batch1) into v_n
    from stock_batch_movements m where m.issue_line_id = v_issue_line;
  if v_n is distinct from 30 then raise exception 'TRIAL 5 FAILED: % from batch 1, expected 30', v_n; end if;
  select sum(-m.quantity * r.rate) into v_n
    from stock_batch_movements m join goods_receipt_line_rates r on r.receipt_line_id = m.receipt_line_id
    where m.issue_line_id = v_issue_line;
  if v_n is distinct from 15350 then raise exception 'TRIAL 5 FAILED: issue worth %, expected 15350', v_n; end if;

  -- 6. The keeper picks batch 2 for an issue of 4; then a transfer of 3 to
  --    store B carries batch 2 with it; then a breakage of 2 draws oldest
  --    first. Store A: batch 1 empty, batch 2 holds 1. Store B: batch 2, 3.
  v_issue := create_stock_issue(p_store_id => v_store_a, p_to_store_id => null, p_plot_id => v_plot,
    p_work_item_id => v_work, p_project_id => null, p_issued_at => current_date, p_note => null);
  insert into stock_issue_lines (issue_id, item_id, quantity, uom, preferred_receipt_line_id, created_by, updated_by)
  values (v_issue, v_item, 4, v_uom, v_batch2, v_user, v_user);
  v_issue := create_stock_issue(p_store_id => v_store_a, p_to_store_id => v_store_b, p_plot_id => null,
    p_work_item_id => null, p_project_id => null, p_issued_at => current_date, p_note => null);
  insert into stock_issue_lines (issue_id, item_id, quantity, uom, created_by, updated_by)
  values (v_issue, v_item, 3, v_uom, v_user, v_user);
  insert into stock_adjustments (store_id, item_id, quantity, uom, reason, created_by, updated_by)
  values (v_store_a, v_item, -2, v_uom, 'Trial breakage', v_user, v_user);

  select quantity into v_n from batch_on_hand where store_id = v_store_a and receipt_line_id = v_batch1;
  if v_n is distinct from 0 then raise exception 'TRIAL 6 FAILED: batch 1 in A holds %', v_n; end if;
  select quantity into v_n from batch_on_hand where store_id = v_store_a and receipt_line_id = v_batch2;
  if v_n is distinct from 1 then raise exception 'TRIAL 6 FAILED: batch 2 in A holds %', v_n; end if;
  select quantity into v_n from batch_on_hand where store_id = v_store_b and receipt_line_id = v_batch2;
  if v_n is distinct from 3 then raise exception 'TRIAL 6 FAILED: batch 2 in B holds %', v_n; end if;
  select quantity into v_n from stock_on_hand where store_id = v_store_a and item_id = v_item;
  if v_n is distinct from 1 then raise exception 'TRIAL 6 FAILED: store A holds % in all', v_n; end if;

  -- 7. Without /inventory, the same person sees the batches (quantities
  --    are open) but no rate, and cannot change one.
  reset role;
  delete from user_apps where user_id = v_user;
  insert into user_apps (user_id, app) values (v_user, '/supervisors');
  set local role authenticated;
  select count(*) into v_n from goods_receipt_line_rates;
  if v_n <> 0 then raise exception 'TRIAL 7 FAILED: % rates visible without /inventory', v_n; end if;
  select count(*) into v_n from batch_on_hand where store_id in (v_store_a, v_store_b);
  if v_n < 3 then raise exception 'TRIAL 7 FAILED: only % batch rows readable', v_n; end if;
  update goods_receipt_line_rates set rate = 1 where receipt_line_id = v_batch1;
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then raise exception 'TRIAL 7 FAILED: a rate changed without /inventory'; end if;

  reset role;
  raise notice 'TRIAL B9 OK — a store-keeper receives, re-rates and issues by batch under RLS';
end $trial$;
