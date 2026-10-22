-- Behaviour trial for 0136 — the villa's costs and stage billing. Runs inside the dry-run
-- transaction; always rolled back, UNDER ROW-LEVEL SECURITY (BUGCATCHER #19), as the staff account
-- made /bills-only, then /supervisors-only, and as the probe (/estimator, /inventory).
--
--   npx tsx scripts/dry-run-migrations.ts --project ipstebqawrvhkyntctrv \
--     supabase/migrations/0136_*.sql --trial scripts/trials/villa-costs.sql
do $trial$
declare
  v_user uuid := (select id from auth.users where email = 'siddharth.cyriac.99@gmail.com');
  v_probe uuid := (select id from auth.users where email = 'siddharth.cyriac.99+probe@gmail.com');
  s_user uuid := gen_random_uuid();
  s_probe uuid := gen_random_uuid();
  v_project uuid := '041b4401-ab9c-4ee5-b6d7-3443f58dbc6a';
  v_plot uuid;
  v_unit uuid;
  v_contractor uuid := (select id from vendors where is_contractor and is_active order by name limit 1);
  v_work uuid := (select id from work_items where is_active order by code limit 1);
  v_wo uuid;
  v_other_wo uuid;
  v_stage uuid;
  v_other_stage uuid;
  v_bill uuid;
  v_n numeric;
  v_expected numeric;
  v_count int;
  v_refused boolean;
begin
  select p.id, u.id into v_plot, v_unit from plots p join units u on u.plot_id = p.id
   where p.project_id = v_project and u.code is not null limit 1;
  if v_user is null or v_probe is null or v_plot is null or v_contractor is null then
    raise exception 'TRIAL SETUP: staging is missing an account, a villa or a contractor';
  end if;
  insert into auth_verified_sessions (session_id, user_id, method) values (s_user, v_user, 'otp'), (s_probe, v_probe, 'otp');

  -- Setup, as the owner signed in as the staff account (an approver): two approved work orders for
  -- the villa, one with two stage lines.
  insert into bill_approvers (user_id) values (v_user) on conflict do nothing;
  perform set_config('request.jwt.claims', json_build_object('sub', v_user,
    'role', 'authenticated', 'session_id', s_user)::text, true);
  insert into labour_contracts (vendor_id, project_id, unit_id, description, contract_value, created_by, updated_by)
  values (v_contractor, v_project, v_unit, 'Trial superstructure', 1, v_user, v_user) returning id into v_wo;
  insert into labour_contract_lines (contract_id, sort_order, work_item_id, description, is_lump_sum, uom, quantity, rate, created_by, updated_by)
  values (v_wo, 1, v_work, 'Block work to GF lintel', false, 'sqft', 2000, 27.6, v_user, v_user) returning id into v_stage;
  insert into labour_contract_lines (contract_id, sort_order, work_item_id, description, is_lump_sum, uom, quantity, rate, created_by, updated_by)
  values (v_wo, 2, v_work, 'GF lintel', false, 'sqft', 2000, 18.4, v_user, v_user);
  update labour_contracts set status = 'approved', approved_by = v_user, approved_at = now() where id = v_wo;
  insert into labour_contracts (vendor_id, project_id, unit_id, description, contract_value, created_by, updated_by)
  values (v_contractor, v_project, v_unit, 'Trial other', 1, v_user, v_user) returning id into v_other_wo;
  insert into labour_contract_lines (contract_id, sort_order, work_item_id, description, is_lump_sum, uom, quantity, rate, created_by, updated_by)
  values (v_other_wo, 1, v_work, 'Other', false, 'sqft', 10, 1, v_user, v_user) returning id into v_other_stage;

  -- The direct sum to check the view against: approved, active work order lines for this villa.
  select round(sum(coalesce(l.quantity, 1) * l.rate), 2) into v_expected
    from labour_contract_lines l join labour_contracts lc on lc.id = l.contract_id
   where lc.status = 'approved' and lc.is_active and coalesce(lc.plot_id, (select plot_id from units where id = lc.unit_id)) = v_plot;

  -- The staff account becomes a /bills-only person.
  delete from user_apps where user_id = v_user;
  insert into user_apps (user_id, app) values (v_user, '/bills');
  perform set_config('request.jwt.claims', json_build_object('sub', v_user,
    'role', 'authenticated', 'session_id', s_user)::text, true);
  set local role authenticated;

  -- 1. The villa's committed labour is its approved work orders.
  select sum(amount) into v_n from villa_cost_facts where plot_id = v_plot and kind = 'wo_committed';
  if v_n is distinct from v_expected then
    raise exception 'TRIAL 1 FAILED: committed labour % expected %', v_n, v_expected;
  end if;

  -- 2. A bill names its stage; a stage of another order is refused; the line shows what is billed.
  v_bill := create_bill(null, v_wo, 'WO STAGE T1', current_date, 1, 0, 1, null);
  insert into bill_lines (bill_id, sort_order, line_kind, work_item_id, labour_contract_line_id, description, uom, quantity, rate, gst_pct, created_by, updated_by)
  values (v_bill, 1, 'pw_qty', v_work, v_stage, 'Block work to GF lintel, half', 'sqft', 1000, 27.6, 0, v_user, v_user);
  v_refused := false;
  begin
    insert into bill_lines (bill_id, sort_order, line_kind, work_item_id, labour_contract_line_id, description, uom, quantity, rate, gst_pct, created_by, updated_by)
    values (v_bill, 2, 'pw_qty', v_work, v_other_stage, 'Wrong order', 'sqft', 1, 1, 0, v_user, v_user);
  exception when raise_exception then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 2 FAILED: a stage of another work order was billed'; end if;
  select line_value, billed_value into v_expected, v_n from work_order_line_billing_facts where labour_contract_line_id = v_stage;
  if (v_expected, v_n) is distinct from (55200::numeric, 27600::numeric) then
    raise exception 'TRIAL 2 FAILED: stage value % billed %, expected 55,200 and 27,600', v_expected, v_n;
  end if;

  -- 3. The bill counts as labour billed for the villa.
  select sum(amount) into v_n from villa_cost_facts where plot_id = v_plot and kind = 'labour_billed';
  if v_n is null or v_n < 27600 then raise exception 'TRIAL 3 FAILED: labour billed reads %', v_n; end if;

  -- 4. The estimator reads it too; a supervisor reads nothing of it.
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_probe,
    'role', 'authenticated', 'session_id', s_probe)::text, true);
  set local role authenticated;
  select count(*) into v_count from villa_cost_facts where plot_id = v_plot;
  if v_count = 0 then raise exception 'TRIAL 4 FAILED: the estimator reads no villa costs'; end if;
  select count(*) into v_count from work_order_line_billing_facts;
  if v_count <> 0 then raise exception 'TRIAL 4 FAILED: the estimator reads work order billing'; end if;

  reset role;
  delete from user_apps where user_id = v_user;
  insert into user_apps (user_id, app) values (v_user, '/supervisors');
  perform set_config('request.jwt.claims', json_build_object('sub', v_user,
    'role', 'authenticated', 'session_id', s_user)::text, true);
  set local role authenticated;
  select count(*) into v_count from villa_cost_facts;
  if v_count <> 0 then raise exception 'TRIAL 4 FAILED: a supervisor reads % villa cost rows', v_count; end if;

  reset role;
  raise exception 'ALL TRIALS PASSED';
end $trial$;
