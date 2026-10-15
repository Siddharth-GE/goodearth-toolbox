-- Behaviour trial for 0118 — a SketchUp takeoff becomes a villa's
-- estimate. Runs inside the dry-run transaction; always rolled back.
--
-- Everything after the setup runs UNDER ROW-LEVEL SECURITY (set local
-- role authenticated) as one person holding ONE grant at a time — the
-- staff Siddharth account (the gmail one, not the founder's admin login),
-- stripped of any role bundle inside this transaction. A trial run as the
-- database owner bypasses every policy (BUGCATCHER #19).
--
--   npx tsx scripts/dry-run-migrations.ts --project ipstebqawrvhkyntctrv \
--     supabase/migrations/0118_*.sql \
--     --trial scripts/trials/estimator-from-model.sql
do $trial$
declare
  v_user uuid := (select id from auth.users where email = 'siddharth.cyriac.99@gmail.com');
  v_a uuid := (select id from work_items where code = 'FD.9');
  v_b uuid := (select id from work_items where code = 'FD.14');
  v_c uuid := (select id from work_items where code = 'FD.10');
  v_unit uuid;
  v_project uuid;
  v_other_unit uuid;
  v_working uuid;
  v_copy uuid;
  v_official uuid;
  v_line_a uuid;
  v_line_b uuid;
  v_hand uuid;
  v_touched uuid[];
  v_lines jsonb;
  v_n int;
  v_text text;
  v_refs text[];
  v_refused boolean;
begin
  if v_user is null or v_a is null or v_b is null or v_c is null then
    raise exception 'TRIAL SETUP: the staff account, FD.9, FD.14 or FD.10 is missing on staging';
  end if;

  -- Setup, as the owner: two villas with no working estimate, and the
  -- person holding /estimator alone.
  select u.id, u.project_id into v_unit, v_project from units u
   where not exists (select 1 from estimator_estimates e where e.unit_id = u.id)
   order by u.name limit 1;
  select u.id into v_other_unit from units u
   where u.project_id = v_project and u.id <> v_unit
     and not exists (select 1 from estimator_estimates e
                      where e.unit_id = u.id and (e.is_working or e.status = 'submitted'))
   order by u.name limit 1;
  if v_unit is null or v_other_unit is null then
    raise exception 'TRIAL SETUP: no two villas without estimates on staging';
  end if;

  update profiles set role_id = null where id = v_user;
  delete from user_apps where user_id = v_user;
  insert into user_apps (user_id, app) values (v_user, '/estimator');
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- 1. A working estimate with one work measured by hand (the app's own
  --    writes: the line, the row, the re-summed quantity).
  v_working := start_villa_estimate(v_unit, null, false, null);
  insert into estimator_estimate_lines (estimate_id, work_item_id, qty, created_by, updated_by)
  values (v_working, v_a, null, v_user, v_user) returning id into v_line_a;
  insert into estimator_estimate_line_measurements
    (line_id, description, nos, length, breadth, depth, sort_order, created_by, updated_by)
  values (v_line_a, 'Hand row', 1, 1, 1, 1, 1, v_user, v_user) returning id into v_hand;
  update estimator_estimate_lines set qty = 1 where id = v_line_a;

  -- 2. The first import: two rows onto the hand-measured work, one work
  --    new to the estimate, one the model leaves to measure by hand.
  v_lines := jsonb_build_array(
    jsonb_build_object('work_item_id', v_a, 'rows', jsonb_build_array(
      jsonb_build_object('description', 'BW1', 'nos', 1, 'length', 4, 'breadth', 0.9,
                         'depth', 0.3, 'model_refs', jsonb_build_array('1.2.3', '1.2.4')),
      jsonb_build_object('description', 'BW2', 'nos', 1, 'length', 2.735, 'breadth', 0.9,
                         'depth', 0.3, 'model_refs', jsonb_build_array('1.2.5')))),
    jsonb_build_object('work_item_id', v_b, 'rows', jsonb_build_array(
      jsonb_build_object('description', 'P1', 'nos', 2, 'length', 1.4, 'breadth', 1.4,
                         'depth', 0.1, 'model_refs', jsonb_build_array('9')))),
    jsonb_build_object('work_item_id', v_c, 'rows', jsonb_build_array()));
  v_touched := import_model_rows(v_working, v_lines,
    jsonb_build_object('file', 'Sample villa.skp', 'guid', 'guid-one'));

  select id into v_line_b from estimator_estimate_lines
   where estimate_id = v_working and work_item_id = v_b;
  if v_line_b is null then raise exception 'TRIAL 2 FAILED: the new work was not put on'; end if;
  if cardinality(v_touched) <> 2 or not (v_line_a = any(v_touched) and v_line_b = any(v_touched)) then
    raise exception 'TRIAL 2 FAILED: touched lines read %', v_touched;
  end if;
  select count(*) into v_n from estimator_estimate_line_measurements
   where line_id = v_line_a and from_model;
  if v_n <> 2 then raise exception 'TRIAL 2 FAILED: % model rows on the hand-measured work', v_n; end if;
  if exists (select 1 from estimator_estimate_line_measurements m
              where m.line_id = v_line_a and m.from_model and m.sort_order <= 1) then
    raise exception 'TRIAL 2 FAILED: a model row sorts before the hand row';
  end if;
  select model_refs into v_refs from estimator_estimate_line_measurements
   where line_id = v_line_a and description = 'BW1';
  if v_refs is distinct from array['1.2.3', '1.2.4'] then
    raise exception 'TRIAL 2 FAILED: BW1''s model refs read %', v_refs;
  end if;
  if (select qty from estimator_estimate_lines
       where estimate_id = v_working and work_item_id = v_c) is not null then
    raise exception 'TRIAL 2 FAILED: the hand-measured work did not arrive to measure';
  end if;
  if exists (select 1 from estimator_estimate_line_measurements m
               join estimator_estimate_lines l on l.id = m.line_id
              where l.estimate_id = v_working and l.work_item_id = v_c) then
    raise exception 'TRIAL 2 FAILED: the hand-measured work got rows';
  end if;
  select model_file || ' / ' || model_guid into v_text from estimator_estimates
   where id = v_working and model_imported_by = v_user and model_imported_at is not null;
  if v_text is distinct from 'Sample villa.skp / guid-one' then
    raise exception 'TRIAL 2 FAILED: the header reads %', v_text;
  end if;
  -- The app re-sums the touched lines (syncLineQty); stand in for it.
  update estimator_estimate_lines set qty = 0.392 where id = v_line_b;

  -- 3. Send again after a change: FD.9 now one row, FD.14 gone from the
  --    model. The model's rows are replaced, not added; the hand row
  --    stays exactly as it was; FD.14 goes back to "to measure".
  v_lines := jsonb_build_array(
    jsonb_build_object('work_item_id', v_a, 'rows', jsonb_build_array(
      jsonb_build_object('description', 'BW1', 'nos', 1, 'length', 3, 'breadth', 0.9,
                         'depth', 0.3, 'model_refs', jsonb_build_array('1.2.3')))),
    jsonb_build_object('work_item_id', v_c, 'rows', jsonb_build_array()));
  v_touched := import_model_rows(v_working, v_lines,
    jsonb_build_object('file', 'Sample villa.skp', 'guid', 'guid-one'));

  select count(*) into v_n from estimator_estimate_line_measurements
   where line_id = v_line_a and from_model;
  if v_n <> 1 then raise exception 'TRIAL 3 FAILED: % model rows after re-import (doubled?)', v_n; end if;
  if not exists (select 1 from estimator_estimate_line_measurements
                  where id = v_hand and not from_model and description = 'Hand row'
                    and nos = 1 and length = 1 and breadth = 1 and depth = 1) then
    raise exception 'TRIAL 3 FAILED: the hand row did not survive';
  end if;
  if (select qty from estimator_estimate_lines where id = v_line_b) is not null then
    raise exception 'TRIAL 3 FAILED: the emptied model line kept a stale quantity';
  end if;
  if v_touched is distinct from array[v_line_a] then
    raise exception 'TRIAL 3 FAILED: touched lines read %', v_touched;
  end if;
  select count(*) into v_n from estimator_estimate_lines
   where estimate_id = v_working and work_item_id = v_c;
  if v_n <> 1 then raise exception 'TRIAL 3 FAILED: the to-measure work is on % times', v_n; end if;

  -- 4. A copy keeps the model's flags (the copy behind Make official and
  --    "start from another villa's estimate").
  insert into estimator_estimates (project_id, unit_id, name, created_by, updated_by)
  values (v_project, v_unit, 'Trial copy', v_user, v_user) returning id into v_copy;
  perform estimator_copy_estimate_contents(v_working, v_copy, true);
  select count(*) into v_n
    from estimator_estimate_line_measurements m
    join estimator_estimate_lines l on l.id = m.line_id
   where l.estimate_id = v_copy and l.work_item_id = v_a
     and m.from_model and m.model_refs = array['1.2.3'];
  if v_n <> 1 then raise exception 'TRIAL 4 FAILED: the copy lost the model flag'; end if;
  if (select count(*) from estimator_estimate_line_measurements m
        join estimator_estimate_lines l on l.id = m.line_id
       where l.estimate_id = v_copy and not m.from_model) <> 1 then
    raise exception 'TRIAL 4 FAILED: the copy''s hand rows are wrong';
  end if;

  -- 5. Only a working estimate takes a model: not an older draft, not an
  --    official one.
  v_refused := false;
  begin
    perform import_model_rows(v_copy, '[]'::jsonb, '{}'::jsonb);
  exception when others then
    v_refused := sqlerrm like '%working estimate only%';
  end;
  if not v_refused then raise exception 'TRIAL 5 FAILED: an older draft took a model'; end if;

  reset role;
  insert into estimator_estimates (project_id, unit_id, name, status, reference, submitted_at)
  values (v_project, v_other_unit, 'Trial official', 'submitted', 'EST/TRIAL/118', now())
  returning id into v_official;
  set local role authenticated;
  v_refused := false;
  begin
    perform import_model_rows(v_official, '[]'::jsonb, '{}'::jsonb);
  exception when others then
    v_refused := sqlerrm like '%working estimate only%';
  end;
  if not v_refused then raise exception 'TRIAL 5 FAILED: an official estimate took a model'; end if;

  -- 6. A hand row cannot carry model references.
  v_refused := false;
  begin
    insert into estimator_estimate_line_measurements
      (line_id, description, nos, sort_order, model_refs, created_by, updated_by)
    values (v_line_a, 'Fake', 1, 9, array['x'], v_user, v_user);
  exception when others then
    v_refused := sqlerrm like '%refs_from_model%';
  end;
  if not v_refused then raise exception 'TRIAL 6 FAILED: a hand row took model refs'; end if;

  -- 7. Someone without /estimator gets nowhere, and changes nothing.
  reset role;
  delete from user_apps where user_id = v_user;
  insert into user_apps (user_id, app) values (v_user, '/inventory');
  set local role authenticated;
  v_refused := false;
  begin
    perform import_model_rows(v_working, '[]'::jsonb, '{}'::jsonb);
  exception when others then
    v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 7 FAILED: /inventory alone imported'; end if;
  reset role;
  select count(*) into v_n from estimator_estimate_line_measurements where line_id = v_line_a;
  if v_n <> 2 then raise exception 'TRIAL 7 FAILED: the refused import changed the sheet'; end if;

  raise exception 'ALL TRIALS PASSED — 0118: import, re-import, hand rows, emptied lines, the copy, the refusals';
end $trial$;
