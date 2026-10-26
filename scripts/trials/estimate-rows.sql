-- Behaviour trial for 0157 — a work on an estimate more than once. Runs inside the dry-run transaction; always rolled
-- back. Everything after the setup runs UNDER ROW-LEVEL SECURITY as the staff account holding /estimator alone
-- (BUGCATCHER #19).
--
--   npx tsx scripts/dry-run-migrations.ts --project ipstebqawrvhkyntctrv \
--     supabase/migrations/0157_*.sql --trial scripts/trials/estimate-rows.sql
do $trial$
declare
  v_user uuid := (select id from auth.users where email = 'siddharth.cyriac.99@gmail.com');
  s_user uuid := gen_random_uuid();
  v_work uuid := (select id from work_items where is_active order by code limit 1);
  v_item uuid := (select id from items where kind = 'material' and is_active order by code limit 1);
  v_unit uuid;
  v_working uuid;
  v_w1 uuid;
  v_w2 uuid;
  v_official uuid;
  v_ref text;
  v_n numeric;
  v_count int;
begin
  if v_user is null or v_work is null or v_item is null then
    raise exception 'TRIAL SETUP: the staff account, a work or a material is missing on staging';
  end if;
  select u.id into v_unit from units u
   where not exists (select 1 from estimator_estimates e where e.unit_id = u.id)
   order by u.name limit 1;
  if v_unit is null then raise exception 'TRIAL SETUP: no villa without estimates on staging'; end if;
  insert into estimator_work_info (work_item_id, uom, labour_rate)
  values (v_work, 'cum', 100) on conflict (work_item_id) do nothing;

  insert into auth_verified_sessions (session_id, user_id, method) values (s_user, v_user, 'otp');
  update profiles set role_id = null where id = v_user;
  delete from user_apps where user_id = v_user;
  insert into user_apps (user_id, app) values (v_user, '/estimator');
  perform set_config('request.jwt.claims', json_build_object('sub', v_user,
    'role', 'authenticated', 'session_id', s_user)::text, true);
  set local role authenticated;

  -- 1. Two rows of one work, each with its own name, quantity, labour rate, material and measurement.
  v_working := start_villa_estimate(v_unit, null, false, null);
  insert into estimator_estimate_lines (estimate_id, work_item_id, label, qty, labour_rate, created_by, updated_by)
  values (v_working, v_work, null, 2, null, v_user, v_user) returning id into v_w1;
  insert into estimator_estimate_lines (estimate_id, work_item_id, label, qty, labour_rate, created_by, updated_by)
  values (v_working, v_work, 'W2 0.9 x 1.2', 3, 250, v_user, v_user) returning id into v_w2;
  insert into estimator_estimate_line_components (line_id, item_id, qty_per_unit, created_by, updated_by)
  values (v_w2, v_item, 4, v_user, v_user);
  insert into estimator_estimate_line_measurements (line_id, description, nos, sort_order, created_by, updated_by)
  values (v_w2, 'W2', 3, 1, v_user, v_user);

  -- 2. The model measures the unlabelled row, not the named one.
  perform import_model_rows(v_working,
    jsonb_build_array(jsonb_build_object('work_item_id', v_work, 'rows', jsonb_build_array(
      jsonb_build_object('description', 'From the model', 'nos', 2)))),
    jsonb_build_object('file', 'Trial.skp'));
  select count(*) into v_count from estimator_estimate_line_measurements where line_id = v_w1 and from_model;
  if v_count <> 1 then raise exception 'TRIAL 2 FAILED: the unlabelled row has % model rows', v_count; end if;
  select count(*) into v_count from estimator_estimate_lines where estimate_id = v_working;
  if v_count <> 2 then raise exception 'TRIAL 2 FAILED: the import added a row (% rows)', v_count; end if;

  -- 3. Made official: each row is copied with its own name, material and measurement, and priced on its own.
  v_ref := make_estimate_official(v_working,
    jsonb_build_array(
      jsonb_build_object('line_id', v_w1, 'qty', 2, 'uom', 'cum', 'labour_rate', 100,
                         'labour_cost', 200, 'material_cost', 0, 'total_cost', 200),
      jsonb_build_object('line_id', v_w2, 'qty', 3, 'uom', 'cum', 'labour_rate', 250,
                         'labour_cost', 750, 'material_cost', 1200, 'total_cost', 1950)),
    jsonb_build_array(jsonb_build_object('work_item_id', v_work, 'item_id', v_item,
                      'material_name', 'Trial', 'uom', 'nos', 'quantity', 12, 'rate', 100)));
  select id into v_official from estimator_estimates where unit_id = v_unit and status = 'submitted';
  if v_official is null then raise exception 'TRIAL 3 FAILED: nothing was made official (%)', v_ref; end if;
  select count(*) into v_count from estimator_estimate_lines where estimate_id = v_official;
  if v_count <> 2 then raise exception 'TRIAL 3 FAILED: the official has % rows', v_count; end if;
  if not exists (
    select 1 from estimator_estimate_lines l
      join estimator_estimate_line_costs c on c.line_id = l.id
     where l.estimate_id = v_official and l.label = 'W2 0.9 x 1.2' and l.copied_from = v_w2
       and c.total_cost = 1950 and c.labour_rate = 250
  ) then
    raise exception 'TRIAL 3 FAILED: the named row lost its own cost';
  end if;
  select count(*) into v_count
    from estimator_estimate_line_components c
    join estimator_estimate_lines l on l.id = c.line_id
   where l.estimate_id = v_official;
  if v_count <> 1 then raise exception 'TRIAL 3 FAILED: % own materials on the official', v_count; end if;
  select count(*) into v_count
    from estimator_estimate_line_measurements m
    join estimator_estimate_lines l on l.id = m.line_id
   where l.estimate_id = v_official and l.copied_from = v_w1 and m.from_model;
  if v_count <> 1 then raise exception 'TRIAL 3 FAILED: the model row did not follow its own row'; end if;

  -- 4. Downstream reads one row per work: the rows added up.
  select quantity into v_n from estimate_work_facts where estimate_id = v_official and work_item_id = v_work;
  if v_n is distinct from 5 then raise exception 'TRIAL 4 FAILED: estimate_work_facts says %, expected 5', v_n; end if;
  select count(*) into v_count from estimate_work_facts where estimate_id = v_official;
  if v_count <> 1 then raise exception 'TRIAL 4 FAILED: % rows for one work', v_count; end if;

  reset role;
  raise exception 'ALL TRIALS PASSED';
end $trial$;
