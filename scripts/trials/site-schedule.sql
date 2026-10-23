-- Behaviour trial for the schedule's writes (plan.md phase B, no migration): the first plan, the villa's start, and the
-- sequence. Runs inside the dry-run transaction; always rolled back, UNDER ROW-LEVEL SECURITY (BUGCATCHER #19), as the staff
-- account made /supervisors-only, then as the probe, who has no /supervisors.
--
--   npx tsx scripts/dry-run-migrations.ts --project ipstebqawrvhkyntctrv \
--     supabase/migrations/0138_*.sql --trial scripts/trials/site-schedule.sql
do $trial$
declare
  v_user uuid := (select id from auth.users where email = 'siddharth.cyriac.99@gmail.com');
  v_probe uuid := (select id from auth.users where email = 'siddharth.cyriac.99+probe@gmail.com');
  s_user uuid := gen_random_uuid();
  s_probe uuid := gen_random_uuid();
  v_plot uuid := (select p.id from plots p
                   where not exists (select 1 from site_stages s where s.plot_id = p.id)
                     and not exists (select 1 from site_villas v where v.plot_id = p.id)
                   order by p.name limit 1);
  g1 uuid := (select id from work_groups where code = 'SS.01' and is_active);
  g2 uuid := (select id from work_groups where code = 'SS.02' and is_active);
  g4 uuid := (select id from work_groups where code = 'SS.04' and is_active);
  n int;
begin
  if v_user is null or v_probe is null or v_plot is null or g1 is null or g2 is null or g4 is null then
    raise exception 'TRIAL SETUP: staging is missing the staff account, the probe, a fresh plot or SS.01/02/04';
  end if;
  insert into auth_verified_sessions (session_id, user_id, method) values (s_user, v_user, 'otp'), (s_probe, v_probe, 'otp');
  delete from user_apps where user_id = v_user;
  insert into user_apps (user_id, app) values (v_user, '/supervisors');
  -- SS.01 already working on this villa.
  insert into site_stages (plot_id, work_group_id, status, started_on) values (v_plot, g1, 'working', date '2026-10-20');

  perform set_config('request.jwt.claims', json_build_object('sub', v_user,
    'role', 'authenticated', 'session_id', s_user)::text, true);
  set local role authenticated;

  -- 1. Set the first plan: missing stage rows made, then every stage's plan written; the working stage keeps its status.
  insert into site_stages (plot_id, work_group_id, created_by, updated_by)
  values (v_plot, g1, v_user, v_user), (v_plot, g2, v_user, v_user)
  on conflict (plot_id, work_group_id) do nothing;
  insert into site_stages (plot_id, work_group_id, baseline_start, baseline_finish, updated_by)
  values (v_plot, g1, date '2026-10-20', date '2026-10-30', v_user), (v_plot, g2, date '2026-10-31', date '2026-11-05', v_user)
  on conflict (plot_id, work_group_id) do update
    set plot_id = excluded.plot_id, work_group_id = excluded.work_group_id,
        baseline_start = excluded.baseline_start, baseline_finish = excluded.baseline_finish,
        updated_by = excluded.updated_by;
  select count(*) into n from site_stages
   where plot_id = v_plot and baseline_finish is not null
     and ((work_group_id = g1 and status = 'working') or (work_group_id = g2 and status = 'not_started'));
  if n <> 2 then raise exception 'TRIAL 1 FAILED: the first plan reached % of 2 stages as they were', n; end if;

  -- 2. The villa's start and its first-plan stamp; the history records the plan with its note.
  insert into site_villas (plot_id, start_on, created_by, updated_by) values (v_plot, date '2026-10-20', v_user, v_user);
  update site_villas set baselined_at = now(), baseline_note = 'trial' where plot_id = v_plot;
  select count(*) into n from site_stage_events where plot_id = v_plot and kind = 'baseline' and note = 'trial';
  if n <> 1 then raise exception 'TRIAL 2 FAILED: % baseline events', n; end if;

  -- 3. A stage's own days and pinned start.
  update site_stages set days = 6, pinned_start = date '2026-11-10' where plot_id = v_plot and work_group_id = g2;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'TRIAL 3 FAILED: the stage plan was not saved'; end if;

  -- 4. The sequence: typical days and the size saved; a loop refused; a stage taken out, its followers re-pointed.
  update site_sequence set typical_days = 9 where work_group_id = g1;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'TRIAL 4a FAILED: typical days not saved'; end if;
  update site_schedule_settings set typical_sqft = 1800 where singleton;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'TRIAL 4b FAILED: the size not saved'; end if;
  begin
    update site_sequence set follows_group_id = g2 where work_group_id = g1;
    raise exception 'TRIAL 4c FAILED: a loop was allowed';
  exception when raise_exception then
    if sqlerrm like 'TRIAL%' then raise; end if;
  end;
  update site_sequence set follows_group_id = (select follows_group_id from site_sequence where work_group_id = g2)
   where follows_group_id = g2;
  delete from site_sequence where work_group_id = g2;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'TRIAL 4d FAILED: the stage was not taken out'; end if;
  if (select follows_group_id from site_sequence where work_group_id = g4) is distinct from g1 then
    raise exception 'TRIAL 4e FAILED: SS.04 does not follow SS.01 after SS.02 left';
  end if;

  reset role;

  -- 5. The probe, without /supervisors, changes nothing.
  perform set_config('request.jwt.claims', json_build_object('sub', v_probe,
    'role', 'authenticated', 'session_id', s_probe)::text, true);
  set local role authenticated;
  update site_sequence set typical_days = 2 where work_group_id = g1;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'TRIAL 5a FAILED: the probe changed the sequence'; end if;
  update site_stages set days = 1 where plot_id = v_plot;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'TRIAL 5b FAILED: the probe changed a stage'; end if;
  select count(*) into n from site_villas where plot_id = v_plot;
  if n <> 0 then raise exception 'TRIAL 5c FAILED: the probe reads the villa schedule'; end if;
  begin
    insert into site_villas (plot_id, start_on) values ((select id from plots where id <> v_plot limit 1), current_date);
    raise exception 'TRIAL 5d FAILED: the probe set a start date';
  exception when insufficient_privilege then null;
  end;

  reset role;
  raise exception 'ALL TRIALS PASSED';
end $trial$;
