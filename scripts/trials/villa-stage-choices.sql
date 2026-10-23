-- Behaviour trial for 0140 — a villa's own stage choices. Runs inside the dry-run transaction; always rolled back, UNDER
-- ROW-LEVEL SECURITY (BUGCATCHER #19), as the staff account made /supervisors-only.
--
--   npx tsx scripts/dry-run-migrations.ts --project ipstebqawrvhkyntctrv \
--     supabase/migrations/0140_*.sql --trial scripts/trials/villa-stage-choices.sql
do $trial$
declare
  v_user uuid := (select id from auth.users where email = 'siddharth.cyriac.99@gmail.com');
  s_user uuid := gen_random_uuid();
  v_plot uuid := (select p.id from plots p
                   where not exists (select 1 from site_stages s where s.plot_id = p.id)
                   order by p.name limit 1);
  v_ss02 uuid := (select id from work_groups where code = 'SS.02' and is_active);
  v_ss03 uuid := (select id from work_groups where code = 'SS.03' and is_active);
  v_stage uuid;
  v_refused boolean;
begin
  if v_user is null or v_plot is null or v_ss02 is null or v_ss03 is null then
    raise exception 'TRIAL SETUP: staging is missing the staff account, a fresh plot, SS.02 or SS.03';
  end if;
  insert into auth_verified_sessions (session_id, user_id, method) values (s_user, v_user, 'otp');
  delete from user_apps where user_id = v_user;
  insert into user_apps (user_id, app) values (v_user, '/supervisors');
  perform set_config('request.jwt.claims', json_build_object('sub', v_user,
    'role', 'authenticated', 'session_id', s_user)::text, true);
  set local role authenticated;

  -- 1. A supervisor marks a stage not needed, and its own order on another.
  insert into site_stages (plot_id, work_group_id, not_needed) values (v_plot, v_ss03, true) returning id into v_stage;
  insert into site_stages (plot_id, work_group_id, follows_group_id, link) values (v_plot, v_ss02, v_ss03, 'alongside');

  -- 2. A stage marked not needed can't be begun, and a begun one can't be marked.
  v_refused := false;
  begin
    update site_stages set status = 'working', started_on = current_date where id = v_stage;
  exception when check_violation then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 2 FAILED: a stage not needed was begun'; end if;

  -- 3. Following needs its link, and never itself.
  v_refused := false;
  begin
    update site_stages set link = null where plot_id = v_plot and work_group_id = v_ss02;
  exception when check_violation then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 3a FAILED: a follow without after or alongside was kept'; end if;
  v_refused := false;
  begin
    update site_stages set follows_group_id = v_ss02 where plot_id = v_plot and work_group_id = v_ss02;
  exception when check_violation then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 3b FAILED: a stage was let follow itself'; end if;

  -- 4. Brought back, it can be begun.
  update site_stages set not_needed = false where id = v_stage;
  update site_stages set status = 'working', started_on = current_date where id = v_stage;

  -- 5. The sequence's stand-in days clear like any other column.
  update site_sequence set days_to_confirm = true where work_group_id = v_ss02;
  if not found then raise exception 'TRIAL 5 FAILED: the sequence could not be marked'; end if;

  reset role;
  raise exception 'ALL TRIALS PASSED';
end $trial$;
