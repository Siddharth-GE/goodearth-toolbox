-- Behaviour trial for 0112 — replaying stock history from before batches.
-- Runs inside the dry-run transaction; always rolled back.
--
--   npx tsx scripts/dry-run-migrations.ts --project ipstebqawrvhkyntctrv \
--     supabase/migrations/0112_*.sql \
--     --trial scripts/trials/replay-pre-batch-history.sql
--
-- A store-keeper (/inventory only, under RLS) records a history in two
-- throwaway stores through the real receipt and issue functions. Then, as
-- the database owner, the trial makes that history look as it would have
-- before 0108 — no batch movements, recorded before 0108 was applied —
-- and replays it. The replay is owner-only, so the owner runs it; what it
-- proves is the arithmetic, not a policy.
--
-- The history, in the order it was recorded (store A unless named):
--   t1 opening stock +10 (no batch)       t6 breakage −4
--   t2 R1: 30 received (dated d−10)       t7 I3: 12 out of store B
--   t3 I1: 25 out                         t8 I4: 15 out
--   t4 R2: 20 received (dated d−8)        t9 R3: 8 received, dated d−20 —
--   t5 I2: 15 moved A → B                     oldest by date, recorded last
--
-- Expected: I1 25 from R1 · I2 5 from R1 and 10 from R2, landing in B ·
-- the breakage 4 from R2 · I3 5 from R1 and 7 from R2 in B · I4 6 from R2
-- and 9 from no batch — never from R3, which did not exist yet. Left: A
-- holds R3 8 (of 9 in all), B holds R2 3 (of 3).
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
  v_cut timestamptz := (select applied_at from applied_migrations where filename = '0108_inventory_batches.sql');
  v_a uuid;
  v_b uuid;
  v_po uuid;
  v_pl uuid;
  v_grn uuid;
  v_iss uuid;
  v_open uuid;
  v_brk uuid;
  v_r1 uuid;
  v_r2 uuid;
  v_r3 uuid;
  v_i1 uuid;
  v_i2 uuid;
  v_i3 uuid;
  v_i4 uuid;
  v_i5 uuid;
  v_n numeric;
  v_moves int;
begin
  select u.id, u.code, p.id into v_unit, v_ucode, v_plot
    from plots p join units u on u.plot_id = p.id
    where p.project_id = v_project and u.code is not null limit 1;

  -- Setup, as the owner: two stores, an issued PO for 200 at ₹100.
  insert into stores (name, project_id) values ('Replay store A', v_project) returning id into v_a;
  insert into stores (name, project_id) values ('Replay store B', v_project) returning id into v_b;
  insert into purchase_orders (project_id, unit_id, scope_code, vendor_id, po_no, reference, status, created_by, updated_by)
  values (v_project, v_unit, v_ucode, v_vendor, 9412, 'PO/TRIAL/412', 'draft', v_user, v_user)
  returning id into v_po;
  insert into purchase_order_lines (po_id, item_id, quantity, uom, rate, gst_pct, created_by, updated_by)
  values (v_po, v_item, 200, v_uom, 100, 18, v_user, v_user)
  returning id into v_pl;
  update purchase_orders set status = 'issued', issued_by = v_user, issued_at = now() where id = v_po;

  delete from user_apps where user_id = v_user and app <> '/inventory';
  insert into user_apps (user_id, app) values (v_user, '/inventory') on conflict do nothing;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- The history, through the real functions, as the store-keeper.
  insert into stock_adjustments (store_id, item_id, quantity, uom, reason, created_by, updated_by)
  values (v_a, v_item, 10, v_uom, 'Replay trial: opening stock', v_user, v_user) returning id into v_open;
  v_grn := create_goods_receipt(p_po_id => v_po, p_store_id => v_a, p_to_site => false,
    p_work_item_id => null, p_challan_no => 'R1', p_received_at => current_date - 10, p_note => null);
  insert into goods_receipt_lines (receipt_id, po_line_id, item_id, quantity, uom, created_by, updated_by)
  values (v_grn, v_pl, v_item, 30, v_uom, v_user, v_user) returning id into v_r1;
  v_iss := create_stock_issue(p_store_id => v_a, p_to_store_id => null, p_plot_id => v_plot,
    p_work_item_id => v_work, p_project_id => null, p_issued_at => current_date - 9, p_note => null);
  insert into stock_issue_lines (issue_id, item_id, quantity, uom, created_by, updated_by)
  values (v_iss, v_item, 25, v_uom, v_user, v_user) returning id into v_i1;
  v_grn := create_goods_receipt(p_po_id => v_po, p_store_id => v_a, p_to_site => false,
    p_work_item_id => null, p_challan_no => 'R2', p_received_at => current_date - 8, p_note => null);
  insert into goods_receipt_lines (receipt_id, po_line_id, item_id, quantity, uom, created_by, updated_by)
  values (v_grn, v_pl, v_item, 20, v_uom, v_user, v_user) returning id into v_r2;
  v_iss := create_stock_issue(p_store_id => v_a, p_to_store_id => v_b, p_plot_id => null,
    p_work_item_id => null, p_project_id => null, p_issued_at => current_date - 7, p_note => null);
  insert into stock_issue_lines (issue_id, item_id, quantity, uom, created_by, updated_by)
  values (v_iss, v_item, 15, v_uom, v_user, v_user) returning id into v_i2;
  insert into stock_adjustments (store_id, item_id, quantity, uom, reason, created_by, updated_by)
  values (v_a, v_item, -4, v_uom, 'Replay trial: breakage', v_user, v_user) returning id into v_brk;
  v_iss := create_stock_issue(p_store_id => v_b, p_to_store_id => null, p_plot_id => v_plot,
    p_work_item_id => v_work, p_project_id => null, p_issued_at => current_date - 6, p_note => null);
  insert into stock_issue_lines (issue_id, item_id, quantity, uom, created_by, updated_by)
  values (v_iss, v_item, 12, v_uom, v_user, v_user) returning id into v_i3;
  v_iss := create_stock_issue(p_store_id => v_a, p_to_store_id => null, p_plot_id => v_plot,
    p_work_item_id => v_work, p_project_id => null, p_issued_at => current_date - 5, p_note => null);
  insert into stock_issue_lines (issue_id, item_id, quantity, uom, created_by, updated_by)
  values (v_iss, v_item, 15, v_uom, v_user, v_user) returning id into v_i4;
  v_grn := create_goods_receipt(p_po_id => v_po, p_store_id => v_a, p_to_site => false,
    p_work_item_id => null, p_challan_no => 'R3', p_received_at => current_date - 20, p_note => null);
  insert into goods_receipt_lines (receipt_id, po_line_id, item_id, quantity, uom, created_by, updated_by)
  values (v_grn, v_pl, v_item, 8, v_uom, v_user, v_user) returning id into v_r3;

  -- As the owner: make it history from before 0108 — no movements, and
  -- recorded an hour apart in the nine hours before 0108 was applied.
  reset role;
  delete from stock_batch_movements
    where issue_line_id in (v_i1, v_i2, v_i3, v_i4) or adjustment_id in (v_open, v_brk);
  update stock_adjustments set created_at = v_cut - interval '9 hours' where id = v_open;
  update goods_receipt_lines set created_at = v_cut - interval '8 hours' where id = v_r1;
  update stock_issue_lines set created_at = v_cut - interval '7 hours' where id = v_i1;
  update goods_receipt_lines set created_at = v_cut - interval '6 hours' where id = v_r2;
  update stock_issue_lines set created_at = v_cut - interval '5 hours' where id = v_i2;
  update stock_adjustments set created_at = v_cut - interval '4 hours' where id = v_brk;
  update stock_issue_lines set created_at = v_cut - interval '3 hours' where id = v_i3;
  update stock_issue_lines set created_at = v_cut - interval '2 hours' where id = v_i4;
  update goods_receipt_lines set created_at = v_cut - interval '1 hour' where id = v_r3;

  select quantity into v_n from batch_on_hand where store_id = v_a and receipt_line_id = v_r1;
  if v_n is distinct from 30 then raise exception 'TRIAL 0 FAILED: before the replay R1 should read 30 (the bug), reads %', v_n; end if;

  -- 1. The safety net: an issue recorded after 0108 but before the replay
  --    already drew batches the replay would draw again (R3 8, then R1 1),
  --    so R1 would end at −1. The replay must refuse and change nothing.
  begin
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
    set local role authenticated;
    v_iss := create_stock_issue(p_store_id => v_a, p_to_store_id => null, p_plot_id => v_plot,
      p_work_item_id => v_work, p_project_id => null, p_issued_at => current_date, p_note => null);
    insert into stock_issue_lines (issue_id, item_id, quantity, uom, created_by, updated_by)
    values (v_iss, v_item, 9, v_uom, v_user, v_user);
    reset role;
    perform replay_pre_batch_history();
    raise exception 'TRIAL 1 FAILED: the replay drew a batch below zero and did not refuse';
  exception when others then
    if sqlerrm not like '%below zero%' then raise; end if;
  end;
  select count(*) into v_n from stock_batch_movements
    where issue_line_id in (v_i1, v_i2, v_i3, v_i4) or adjustment_id in (v_open, v_brk);
  if v_n <> 0 then raise exception 'TRIAL 1 FAILED: the refused replay left % movements', v_n; end if;

  -- 2. The replay itself: nine movements.
  v_moves := replay_pre_batch_history();
  if v_moves <> 9 then raise exception 'TRIAL 2 FAILED: % movements written, expected 9', v_moves; end if;

  -- 3. Each event drew what it would have drawn at the time.
  select -sum(quantity) into v_n from stock_batch_movements where issue_line_id = v_i1 and receipt_line_id = v_r1;
  if v_n is distinct from 25 then raise exception 'TRIAL 3 FAILED: I1 took % from R1, expected 25', v_n; end if;
  select sum(quantity) into v_n from stock_batch_movements where issue_line_id = v_i2 and store_id = v_b;
  if v_n is distinct from 15 then raise exception 'TRIAL 3 FAILED: the transfer landed % in B, expected 15', v_n; end if;
  select -sum(quantity) into v_n from stock_batch_movements where issue_line_id = v_i2 and store_id = v_a and receipt_line_id = v_r1;
  if v_n is distinct from 5 then raise exception 'TRIAL 3 FAILED: the transfer took % of R1, expected 5', v_n; end if;
  select -sum(quantity) into v_n from stock_batch_movements where adjustment_id = v_brk and receipt_line_id = v_r2;
  if v_n is distinct from 4 then raise exception 'TRIAL 3 FAILED: the breakage took % from R2, expected 4', v_n; end if;
  select -sum(quantity) into v_n from stock_batch_movements where issue_line_id = v_i3 and store_id = v_b;
  if v_n is distinct from 12 then raise exception 'TRIAL 3 FAILED: I3 took % in B, expected 12', v_n; end if;
  select -sum(quantity) into v_n from stock_batch_movements where issue_line_id = v_i4;
  if v_n is distinct from 6 then raise exception 'TRIAL 3 FAILED: I4 took % from batches, expected 6 (9 had no batch)', v_n; end if;
  if exists (select 1 from stock_batch_movements where issue_line_id = v_i4 and receipt_line_id = v_r3) then
    raise exception 'TRIAL 3 FAILED: I4 drew R3, a delivery recorded after it';
  end if;
  if exists (select 1 from stock_batch_movements where adjustment_id = v_open) then
    raise exception 'TRIAL 3 FAILED: opening stock (an addition) moved a batch';
  end if;
  select created_at into v_n from (select extract(epoch from created_at)::numeric as created_at
    from stock_batch_movements where issue_line_id = v_i3 limit 1) s;
  if v_n is distinct from extract(epoch from v_cut - interval '3 hours')::numeric then
    raise exception 'TRIAL 3 FAILED: a movement does not carry its event''s time';
  end if;

  -- 4. What is left adds up: A holds R3 8 of 9 in all, B holds R2 3 of 3.
  select coalesce(sum(quantity) filter (where quantity > 0), 0) into v_n from batch_on_hand where store_id = v_a and item_id = v_item;
  if v_n is distinct from 8 then raise exception 'TRIAL 4 FAILED: A''s batches hold %, expected 8', v_n; end if;
  select quantity into v_n from batch_on_hand where store_id = v_a and receipt_line_id = v_r3;
  if v_n is distinct from 8 then raise exception 'TRIAL 4 FAILED: R3 in A holds %, expected 8', v_n; end if;
  select quantity into v_n from stock_on_hand where store_id = v_a and item_id = v_item;
  if v_n is distinct from 9 then raise exception 'TRIAL 4 FAILED: A holds % in all, expected 9', v_n; end if;
  select quantity into v_n from batch_on_hand where store_id = v_b and receipt_line_id = v_r2;
  if v_n is distinct from 3 then raise exception 'TRIAL 4 FAILED: R2 in B holds %, expected 3', v_n; end if;
  if exists (select 1 from batch_on_hand where store_id in (v_a, v_b) and quantity < 0) then
    raise exception 'TRIAL 4 FAILED: a batch is below zero';
  end if;

  -- 5. A second replay changes nothing.
  v_moves := replay_pre_batch_history();
  if v_moves <> 0 then raise exception 'TRIAL 5 FAILED: a second replay wrote % movements', v_moves; end if;

  -- 6. Life goes on: a new issue of 5 from A draws R3, the only batch left.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_iss := create_stock_issue(p_store_id => v_a, p_to_store_id => null, p_plot_id => v_plot,
    p_work_item_id => v_work, p_project_id => null, p_issued_at => current_date, p_note => null);
  insert into stock_issue_lines (issue_id, item_id, quantity, uom, created_by, updated_by)
  values (v_iss, v_item, 5, v_uom, v_user, v_user) returning id into v_i5;
  reset role;
  select -sum(quantity) into v_n from stock_batch_movements where issue_line_id = v_i5 and receipt_line_id = v_r3;
  if v_n is distinct from 5 then raise exception 'TRIAL 6 FAILED: a new issue took % from R3, expected 5', v_n; end if;

  -- 7. Nobody signed in may run the replay.
  set local role authenticated;
  begin
    perform replay_pre_batch_history();
    raise exception 'TRIAL 7 FAILED: a signed-in person ran the replay';
  exception when others then
    if sqlerrm not like '%permission denied%' then raise; end if;
  end;
  reset role;

  raise notice 'TRIAL 0112 OK — history from before batches is drawn as it would have been, once';
end $trial$;
