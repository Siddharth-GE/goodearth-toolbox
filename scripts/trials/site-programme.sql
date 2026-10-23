-- Behaviour trial for 0137 — the site programme. Runs inside the dry-run transaction; always rolled
-- back, UNDER ROW-LEVEL SECURITY (BUGCATCHER #19), as the staff account made /supervisors-only,
-- then as the probe without the grant.
--
--   npx tsx scripts/dry-run-migrations.ts --project ipstebqawrvhkyntctrv \
--     supabase/migrations/0137_*.sql --trial scripts/trials/site-programme.sql
do $trial$
declare
  v_user uuid := (select id from auth.users where email = 'siddharth.cyriac.99@gmail.com');
  v_probe uuid := (select id from auth.users where email = 'siddharth.cyriac.99+probe@gmail.com');
  s_user uuid := gen_random_uuid();
  s_probe uuid := gen_random_uuid();
  v_plot uuid := (select p.id from plots p
                   where not exists (select 1 from site_stages s where s.plot_id = p.id)
                   order by p.name limit 1);
  v_group uuid := (select id from work_groups where code = 'SS.01' and is_active);
  v_work uuid := (select id from work_items where group_id = (select id from work_groups where code = 'SS.01' and is_active)
                   and is_active order by code limit 1);
  v_contractor uuid := (select id from vendors where is_contractor and is_active order by name limit 1);
  v_supplier uuid := (select id from vendors where not is_contractor order by name limit 1);
  v_stage site_stages%rowtype;
  v_count int;
  v_refused boolean;
begin
  if v_user is null or v_probe is null or v_plot is null or v_work is null or v_contractor is null or v_supplier is null then
    raise exception 'TRIAL SETUP: staging is missing an account, a fresh plot, an SS.01 work or a vendor';
  end if;
  insert into auth_verified_sessions (session_id, user_id, method) values (s_user, v_user, 'otp'), (s_probe, v_probe, 'otp');
  delete from user_apps where user_id = v_user;
  insert into user_apps (user_id, app) values (v_user, '/supervisors');
  delete from user_apps where user_id = v_probe and app = '/supervisors';

  perform set_config('request.jwt.claims', json_build_object('sub', v_user,
    'role', 'authenticated', 'session_id', s_user)::text, true);
  set local role authenticated;

  -- 1. The first labour on a stage starts it, on the log's date, and the history says so.
  insert into labour_logs (plot_id, work_item_id, contractor_id, log_date, kind, masons, created_by, updated_by)
  values (v_plot, v_work, v_contractor, date '2020-03-10', 'nmr', 2, v_user, v_user);
  select * into v_stage from site_stages where plot_id = v_plot and work_group_id = v_group;
  if v_stage.status is distinct from 'working' or v_stage.started_on is distinct from date '2020-03-10' then
    raise exception 'TRIAL 1 FAILED: the first log did not start the stage (%, %)', v_stage.status, v_stage.started_on;
  end if;
  select count(*) into v_count from site_stage_events
   where plot_id = v_plot and work_group_id = v_group and to_status = 'working' and actor_id = v_user;
  if v_count <> 1 then raise exception 'TRIAL 1 FAILED: % history rows for the start', v_count; end if;

  -- 1b. A stage already set up (its contractor picked) starts the same way; one waiting before it
  -- began takes the date and keeps waiting.
  insert into site_stages (plot_id, work_group_id, contractor_id, created_by, updated_by)
  values (v_plot, (select id from work_groups where code = 'SS.02' and is_active), v_contractor, v_user, v_user);
  insert into labour_logs (plot_id, work_item_id, contractor_id, log_date, kind, masons, created_by, updated_by)
  values (v_plot, (select id from work_items where group_id = (select id from work_groups where code = 'SS.02' and is_active)
                    and is_active order by code limit 1), v_contractor, date '2020-04-01', 'nmr', 2, v_user, v_user);
  select * into v_stage from site_stages where plot_id = v_plot and work_group_id = (select id from work_groups where code = 'SS.02' and is_active);
  if v_stage.status is distinct from 'working' or v_stage.started_on is distinct from date '2020-04-01' then
    raise exception 'TRIAL 1b FAILED: a set-up stage did not start (%, %)', v_stage.status, v_stage.started_on;
  end if;
  insert into site_stages (plot_id, work_group_id, status, waiting_on, created_by, updated_by)
  values (v_plot, (select id from work_groups where code = 'SS.04' and is_active), 'waiting', 'material', v_user, v_user);
  insert into labour_logs (plot_id, work_item_id, contractor_id, log_date, kind, masons, created_by, updated_by)
  values (v_plot, (select id from work_items where group_id = (select id from work_groups where code = 'SS.04' and is_active)
                    and is_active order by code limit 1), v_contractor, date '2020-04-05', 'nmr', 2, v_user, v_user);
  select * into v_stage from site_stages where plot_id = v_plot and work_group_id = (select id from work_groups where code = 'SS.04' and is_active);
  if v_stage.status is distinct from 'waiting' or v_stage.started_on is distinct from date '2020-04-05' then
    raise exception 'TRIAL 1b FAILED: a waiting stage became % from %', v_stage.status, v_stage.started_on;
  end if;

  -- 1c. Re-saving a log on the same work does not restart a stage set back to not started.
  update site_stages set status = 'not_started', started_on = null
   where plot_id = v_plot and work_group_id = (select id from work_groups where code = 'SS.02' and is_active);
  update labour_logs set work_item_id = work_item_id, note = 'edited'
   where plot_id = v_plot and log_date = date '2020-04-01';
  select * into v_stage from site_stages where plot_id = v_plot and work_group_id = (select id from work_groups where code = 'SS.02' and is_active);
  if v_stage.status <> 'not_started' then raise exception 'TRIAL 1c FAILED: an edit restarted the stage'; end if;

  -- 2. A second log moves nothing.
  insert into labour_logs (plot_id, work_item_id, contractor_id, log_date, kind, masons, created_by, updated_by)
  values (v_plot, v_work, v_contractor, date '2020-03-12', 'nmr', 3, v_user, v_user);
  select * into v_stage from site_stages where plot_id = v_plot and work_group_id = v_group;
  if v_stage.started_on is distinct from date '2020-03-10' then
    raise exception 'TRIAL 2 FAILED: a second log moved the start to %', v_stage.started_on;
  end if;

  -- 3. Done needs a finish no earlier than the start; then a later log leaves it done.
  v_refused := false;
  begin
    update site_stages set status = 'done' where id = v_stage.id;
  exception when check_violation then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 3 FAILED: done with no finish date'; end if;
  v_refused := false;
  begin
    update site_stages set status = 'done', finished_on = date '2020-03-01' where id = v_stage.id;
  exception when check_violation then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 3 FAILED: finished before it started'; end if;
  update site_stages set status = 'done', finished_on = date '2020-03-20' where id = v_stage.id;
  insert into labour_logs (plot_id, work_item_id, contractor_id, log_date, kind, masons, created_by, updated_by)
  values (v_plot, v_work, v_contractor, date '2020-03-25', 'nmr', 1, v_user, v_user);
  select status into v_stage.status from site_stages where id = v_stage.id;
  if v_stage.status <> 'done' then raise exception 'TRIAL 3 FAILED: a log reopened a done stage'; end if;

  -- 4. Waiting says on what; a contractor must be one.
  v_refused := false;
  begin
    update site_stages set status = 'waiting', finished_on = null where id = v_stage.id;
  exception when check_violation then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 4 FAILED: waiting on nothing'; end if;
  v_refused := false;
  begin
    update site_stages set contractor_id = v_supplier where id = v_stage.id;
  exception when raise_exception then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 4 FAILED: a supplier was put on a stage'; end if;

  -- 5. Nobody writes the history by hand, and a stage is never deleted.
  v_refused := false;
  begin
    insert into site_stage_events (plot_id, work_group_id, kind, to_status) values (v_plot, v_group, 'status', 'done');
  exception when insufficient_privilege then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 5 FAILED: history written by hand'; end if;
  delete from site_stages where id = v_stage.id;
  select count(*) into v_count from site_stages where id = v_stage.id;
  if v_count <> 1 then raise exception 'TRIAL 5 FAILED: a stage was deleted'; end if;

  -- 6. The sequence never waits on itself.
  v_refused := false;
  begin
    update site_sequence set follows_group_id = (select id from work_groups where code = 'SS.05' and is_active)
     where work_group_id = (select id from work_groups where code = 'SS.01' and is_active);
  exception when raise_exception then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 6 FAILED: a cycle in the sequence'; end if;

  -- 7. A villa's supervisor and first plan; the baseline lands in the history.
  insert into site_villas (plot_id, supervisor_id, start_on, baselined_at, baseline_note, created_by, updated_by)
  values (v_plot, v_user, date '2020-03-01', now(), 'First plan', v_user, v_user);
  select count(*) into v_count from site_stage_events where plot_id = v_plot and kind = 'baseline';
  if v_count <> 1 then raise exception 'TRIAL 7 FAILED: the first plan is not in the history'; end if;

  -- 8. The estimate's work quantities are readable to the site.
  perform 1 from estimate_work_facts limit 1;

  -- 9. Without /supervisors the probe reads the checklist links but no stage, villa or history, and writes nothing.
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_probe,
    'role', 'authenticated', 'session_id', s_probe)::text, true);
  set local role authenticated;
  select count(*) into v_count from site_stages where plot_id = v_plot;
  if v_count <> 0 then raise exception 'TRIAL 9 FAILED: the probe reads a stage'; end if;
  select count(*) into v_count from site_stage_events where plot_id = v_plot;
  if v_count <> 0 then raise exception 'TRIAL 9 FAILED: the probe reads the history'; end if;
  select count(*) into v_count from site_sequence;
  if v_count <> 0 then raise exception 'TRIAL 9 FAILED: the probe reads the sequence'; end if;
  select count(*) into v_count from checklist_template_groups;
  if v_count = 0 then raise exception 'TRIAL 9 FAILED: the probe cannot read the checklist links'; end if;
  v_refused := false;
  begin
    insert into site_stages (plot_id, work_group_id) values (v_plot, (select id from work_groups where code = 'SS.02' and is_active));
  exception when insufficient_privilege then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 9 FAILED: the probe added a stage'; end if;

  reset role;
  raise exception 'ALL TRIALS PASSED';
end $trial$;
