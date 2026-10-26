-- Behaviour trial for 0138 — Undo puts a stage's clock back. Runs inside the dry-run transaction; always
-- rolled back, UNDER ROW-LEVEL SECURITY (BUGCATCHER #19), as the staff account made /supervisors-only.
-- now() is one instant in a transaction, so the earlier history is laid down as the owner first.
--
--   npx tsx scripts/dry-run-migrations.ts --project ipstebqawrvhkyntctrv \
--     supabase/migrations/0138_*.sql --trial scripts/trials/stage-undo-clock.sql
do $trial$
declare
  v_user uuid := (select id from auth.users where email = 'siddharth.cyriac.99@gmail.com');
  s_user uuid := gen_random_uuid();
  v_plot uuid := (select p.id from plots p
                   where not exists (select 1 from site_stages s where s.plot_id = p.id)
                   order by p.name limit 1);
  v_group uuid := (select id from work_groups where code = 'SS.02' and is_active);
  v_stage uuid;
  v_then timestamptz := timestamptz '2026-10-01 09:00+05:30';
  v_at timestamptz;
begin
  if v_user is null or v_plot is null or v_group is null then
    raise exception 'TRIAL SETUP: staging is missing the staff account, a fresh plot or SS.02';
  end if;
  -- A stage waiting since 1 October, its history saying so.
  insert into site_stages (plot_id, work_group_id, status, waiting_on, started_on)
  values (v_plot, v_group, 'waiting', 'material', date '2026-09-28') returning id into v_stage;
  insert into site_stage_events (plot_id, work_group_id, kind, to_status, at)
  values (v_plot, v_group, 'status', 'waiting', v_then);

  insert into auth_verified_sessions (session_id, user_id, method) values (s_user, v_user, 'otp');
  delete from user_apps where user_id = v_user;
  insert into user_apps (user_id, app) values (v_user, '/supervisors');
  perform set_config('request.jwt.claims', json_build_object('sub', v_user,
    'role', 'authenticated', 'session_id', s_user)::text, true);
  set local role authenticated;

  -- 1. Done by mistake, then Undo with the time the history records: the clock goes back.
  update site_stages set status = 'done', finished_on = date '2026-10-20', waiting_on = null where id = v_stage;
  update site_stages set status = 'waiting', waiting_on = 'material', finished_on = null, status_changed_at = v_then
   where id = v_stage;
  select status_changed_at into v_at from site_stages where id = v_stage;
  if v_at is distinct from v_then then raise exception 'TRIAL 1 FAILED: Undo left the clock at %', v_at; end if;

  -- 2. A time the history does not hold for that status is not taken.
  update site_stages set status = 'working', waiting_on = null where id = v_stage;
  update site_stages set status = 'waiting', waiting_on = 'labour', status_changed_at = timestamptz '2025-01-01 00:00+00'
   where id = v_stage;
  select status_changed_at into v_at from site_stages where id = v_stage;
  if v_at <> now() then raise exception 'TRIAL 2 FAILED: a made-up time was taken (%)', v_at; end if;

  -- 3. Without a change of status the clock never moves by hand.
  update site_stages set status_changed_at = v_then, waiting_note = 'still waiting' where id = v_stage;
  select status_changed_at into v_at from site_stages where id = v_stage;
  if v_at <> now() then raise exception 'TRIAL 3 FAILED: the clock moved by hand to %', v_at; end if;

  reset role;
  raise exception 'ALL TRIALS PASSED';
end $trial$;
