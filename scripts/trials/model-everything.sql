-- Behaviour trial for 0174 — everything the SketchUp model sends. Runs inside the dry-run transaction; always rolled
-- back. Everything after the setup runs UNDER ROW-LEVEL SECURITY as the staff account holding /estimator alone
-- (BUGCATCHER #19).
--
--   npx tsx scripts/dry-run-migrations.ts --project ipstebqawrvhkyntctrv \
--     supabase/migrations/0174_*.sql --trial scripts/trials/model-everything.sql
do $trial$
declare
  v_user uuid := (select id from auth.users where email = 'siddharth.cyriac.99@gmail.com');
  s_user uuid := gen_random_uuid();
  v_work uuid := (select id from work_items where is_active order by code limit 1);
  v_mix uuid;
  v_mix_name text;
  v_mix_uom text;
  v_unit uuid;
  v_working uuid;
  v_line uuid;
  v_official uuid;
  v_typed uuid;
  v_lines jsonb;
  v_materials jsonb;
  v_costs jsonb;
  v_model jsonb;
  v_text text;
  v_count int;
  v_n numeric;
begin
  select id, name, uom into v_mix, v_mix_name, v_mix_uom from estimator_mixes where is_active order by name limit 1;
  if v_user is null or v_work is null or v_mix is null then
    raise exception 'TRIAL SETUP: the staff account, a work or a mix is missing on staging';
  end if;
  select u.id into v_unit from units u
   where not exists (select 1 from estimator_estimates e where e.unit_id = u.id)
   order by u.name limit 1;
  if v_unit is null then raise exception 'TRIAL SETUP: no villa without estimates on staging'; end if;
  insert into estimator_work_info (work_item_id, uom, labour_rate)
  values (v_work, 'cum', 100) on conflict (work_item_id) do nothing;
  delete from estimator_mixes where lower(name) = 'trial sketchup mix';

  insert into auth_verified_sessions (session_id, user_id, method) values (s_user, v_user, 'otp');
  update profiles set role_id = null where id = v_user;
  delete from user_apps where user_id = v_user;
  insert into user_apps (user_id, app) values (v_user, '/estimator');
  perform set_config('request.jwt.claims', json_build_object('sub', v_user,
    'role', 'authenticated', 'session_id', s_user)::text, true);
  set local role authenticated;

  v_working := start_villa_estimate(v_unit, null, false, null);
  v_lines := jsonb_build_array(jsonb_build_object('work_item_id', v_work, 'rows', jsonb_build_array(
    jsonb_build_object('description', 'From the model', 'nos', 2))));
  v_materials := jsonb_build_array(
    jsonb_build_object('work_item_id', v_work, 'mix_name', v_mix_name, 'mix_uom', v_mix_uom, 'qty', 1.5),
    jsonb_build_object('work_item_id', v_work, 'mix_name', ' ' || upper(v_mix_name), 'mix_uom', v_mix_uom, 'qty', 0.5),
    jsonb_build_object('work_item_id', v_work, 'mix_name', 'Trial SketchUp mix', 'mix_uom', ' KG ', 'qty', 40));
  v_costs := jsonb_build_array(
    jsonb_build_object('code', 'MEP', 'name', 'MEP materials', 'unit', 'sqft BUA', 'qty', 100, 'rate', 200, 'note', 'Allowance'),
    jsonb_build_object('code', '', 'name', 'Door hardware', 'unit', 'nos', 'qty', 5, 'rate', 3500, 'note', null));
  v_model := jsonb_build_object('file', 'Trial.skp', 'bua_sqft', 100,
    'settings', jsonb_build_object('toilets', 3));

  -- 1. One import lays the rows, makes the missing mix under From SketchUp in the toolbox's spelling of its unit, adds a
  --    mix named twice once, and keeps the other costs and settings.
  perform import_model_takeoff(v_working, v_lines, v_model, v_materials, v_costs);
  select id into v_line from estimator_estimate_lines where estimate_id = v_working and work_item_id = v_work;
  if not exists (select 1 from estimator_mixes where name = 'Trial SketchUp mix' and uom = 'kg'
                  and group_name = 'From SketchUp') then
    raise exception 'TRIAL 1 FAILED: the new mix was not made under From SketchUp';
  end if;
  select qty into v_n from estimator_estimate_line_model_materials where line_id = v_line and mix_id = v_mix;
  if v_n is distinct from 2.0 then raise exception 'TRIAL 1 FAILED: the named-twice mix holds %, expected 2', v_n; end if;
  select count(*) into v_count from estimator_estimate_line_model_materials where line_id = v_line;
  if v_count <> 2 then raise exception 'TRIAL 1 FAILED: % model materials, expected 2', v_count; end if;
  select count(*) into v_count from estimator_estimate_other_costs where estimate_id = v_working and from_model;
  if v_count <> 2 then raise exception 'TRIAL 1 FAILED: % other costs, expected 2', v_count; end if;
  if (select code from estimator_estimate_other_costs where estimate_id = v_working and name = 'Door hardware') is not null then
    raise exception 'TRIAL 1 FAILED: a blank code was kept as text';
  end if;
  if (select (model_bua_sqft, model_settings ->> 'toilets', use_model_materials) from estimator_estimates where id = v_working)
     is distinct from (100::numeric, '3'::text, true) then
    raise exception 'TRIAL 1 FAILED: the settings, BUA or switch did not land';
  end if;

  -- 2. Sent again with one other cost and a typed one beside it: nothing doubles and the typed one stays.
  insert into estimator_estimate_other_costs (estimate_id, name, qty, rate, position, created_by, updated_by)
  values (v_working, 'Typed by hand', 1, 500, 100, v_user, v_user) returning id into v_typed;
  perform import_model_takeoff(v_working, v_lines, v_model, v_materials, jsonb_build_array(v_costs -> 0));
  select count(*) into v_count from estimator_estimate_line_model_materials where line_id = v_line;
  if v_count <> 2 then raise exception 'TRIAL 2 FAILED: % model materials after a second send', v_count; end if;
  select count(*) into v_count from estimator_estimate_other_costs where estimate_id = v_working;
  if v_count <> 2 or not exists (select 1 from estimator_estimate_other_costs where id = v_typed) then
    raise exception 'TRIAL 2 FAILED: % other costs, or the typed one went', v_count;
  end if;

  -- 3. A mix the toolbox has in another unit is refused, and nothing of that send lands.
  v_text := null;
  begin
    perform import_model_takeoff(v_working, v_lines, v_model,
      jsonb_build_array(jsonb_build_object('work_item_id', v_work, 'mix_name', v_mix_name,
                                           'mix_uom', 'not-' || v_mix_uom, 'qty', 1)),
      '[]'::jsonb);
  exception when others then v_text := sqlerrm;
  end;
  if v_text not like 'The rate book or the estimate changed%' then
    raise exception 'TRIAL 3 FAILED: a unit that differs gave %', coalesce(v_text, 'no refusal');
  end if;

  -- 3b. A new mix in a unit the toolbox doesn't have is refused by name; so is a name past 120 letters.
  v_text := null;
  begin
    perform import_model_takeoff(v_working, v_lines, v_model,
      jsonb_build_array(jsonb_build_object('work_item_id', v_work, 'mix_name', 'Trial odd unit',
                                           'mix_uom', 'furlong', 'qty', 1)), '[]'::jsonb);
  exception when others then v_text := sqlerrm;
  end;
  if v_text not like 'SketchUp sent a mix in "furlong"%' then
    raise exception 'TRIAL 3b FAILED: an unknown unit gave %', coalesce(v_text, 'no refusal');
  end if;
  v_text := null;
  begin
    perform import_model_takeoff(v_working, v_lines, v_model,
      jsonb_build_array(jsonb_build_object('work_item_id', v_work, 'mix_name', repeat('x', 121),
                                           'mix_uom', 'kg', 'qty', 1)), '[]'::jsonb);
  exception when others then v_text := sqlerrm;
  end;
  if v_text not like 'The takeoff names a mix%' then
    raise exception 'TRIAL 3b FAILED: a long name gave %', coalesce(v_text, 'no refusal');
  end if;

  -- 4. Made official: the materials, other costs and settings are copied, and the copy is frozen.
  update estimator_estimate_lines set qty = 2 where id = v_line;
  update estimator_estimates set use_model_materials = false where id = v_working;
  perform make_estimate_official(v_working,
    jsonb_build_array(jsonb_build_object('line_id', v_line, 'qty', 2, 'uom', 'cum', 'labour_rate', 100,
                                         'labour_cost', 200, 'material_cost', null, 'total_cost', null)),
    '[]'::jsonb);
  select id into v_official from estimator_estimates where unit_id = v_unit and status = 'submitted';
  if v_official is null then raise exception 'TRIAL 4 FAILED: nothing was made official'; end if;
  select count(*) into v_count
    from estimator_estimate_line_model_materials mm
    join estimator_estimate_lines l on l.id = mm.line_id
   where l.estimate_id = v_official;
  if v_count <> 2 then raise exception 'TRIAL 4 FAILED: % model materials on the official', v_count; end if;
  select count(*) into v_count from estimator_estimate_other_costs where estimate_id = v_official;
  if v_count <> 2 then raise exception 'TRIAL 4 FAILED: % other costs on the official', v_count; end if;
  if (select (model_bua_sqft, use_model_materials) from estimator_estimates where id = v_official)
     is distinct from (100::numeric, false) then
    raise exception 'TRIAL 4 FAILED: the official lost the BUA or the switch';
  end if;
  v_text := null;
  begin
    insert into estimator_estimate_other_costs (estimate_id, name, created_by, updated_by)
    values (v_official, 'Late', v_user, v_user);
  exception when others then v_text := sqlerrm;
  end;
  if v_text not like 'This estimate is submitted%' then
    raise exception 'TRIAL 4 FAILED: an other cost went onto the official (%)', coalesce(v_text, 'no refusal');
  end if;
  v_text := null;
  begin
    delete from estimator_estimate_line_model_materials mm
     using estimator_estimate_lines l
     where l.id = mm.line_id and l.estimate_id = v_official;
  exception when others then v_text := sqlerrm;
  end;
  if v_text not like 'This estimate is submitted%' then
    raise exception 'TRIAL 4 FAILED: the official''s materials could be deleted (%)', coalesce(v_text, 'no refusal');
  end if;
  v_text := null;
  begin
    update estimator_estimates set use_model_materials = true where id = v_official;
  exception when others then v_text := sqlerrm;
  end;
  if v_text not like 'A submitted estimate can no longer be edited%' then
    raise exception 'TRIAL 4 FAILED: the official''s switch moved (%)', coalesce(v_text, 'no refusal');
  end if;

  -- 4b. A material never moves off the official onto a draft row.
  v_text := null;
  begin
    update estimator_estimate_line_model_materials mm set line_id = v_line
      from estimator_estimate_lines l
     where l.id = mm.line_id and l.estimate_id = v_official;
  exception when others then v_text := sqlerrm;
  end;
  if v_text is distinct from 'A material stays on its own row' then
    raise exception 'TRIAL 4b FAILED: an official''s material moved (%)', coalesce(v_text, 'no refusal');
  end if;

  -- 5a. A draft row taken off goes with its materials.
  perform import_model_takeoff(v_working, v_lines, v_model, v_materials, v_costs);
  perform 1 from estimator_estimate_line_model_materials where line_id = v_line;
  if not found then raise exception 'TRIAL 5a SETUP: the draft row has no materials'; end if;
  delete from estimator_estimate_line_measurements where line_id = v_line;
  delete from estimator_estimate_lines where id = v_line;
  if exists (select 1 from estimator_estimate_line_model_materials where line_id = v_line) then
    raise exception 'TRIAL 5a FAILED: the row''s materials stayed';
  end if;

  -- 5. A draft goes whole, its materials and other costs with it.
  perform delete_draft_estimate(v_working);
  if exists (select 1 from estimator_estimate_other_costs where estimate_id = v_working)
     or exists (select 1 from estimator_estimate_lines where estimate_id = v_working) then
    raise exception 'TRIAL 5 FAILED: the draft left something behind';
  end if;

  -- 6. Without /estimator, nothing is read and the import is refused.
  reset role;
  delete from user_apps where user_id = v_user;
  insert into user_apps (user_id, app) values (v_user, '/indents');
  set local role authenticated;
  select count(*) into v_count from estimator_estimate_other_costs;
  if v_count <> 0 then raise exception 'TRIAL 6 FAILED: % other costs readable without /estimator', v_count; end if;
  select count(*) into v_count from estimator_estimate_line_model_materials;
  if v_count <> 0 then raise exception 'TRIAL 6 FAILED: % model materials readable without /estimator', v_count; end if;
  v_text := null;
  begin
    perform import_model_takeoff(v_official, v_lines, v_model, '[]'::jsonb, '[]'::jsonb);
  exception when others then v_text := sqlerrm;
  end;
  if v_text is null then raise exception 'TRIAL 6 FAILED: an import went through without /estimator'; end if;

  reset role;
  raise exception 'ALL TRIALS PASSED';
end $trial$;
