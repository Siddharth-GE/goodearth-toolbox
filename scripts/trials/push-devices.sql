-- Behaviour trial for 0130 — a person's phones are theirs alone. Runs inside
-- the dry-run transaction; always rolled back, UNDER ROW-LEVEL SECURITY
-- (BUGCATCHER #19), as the staff account and the probe.
--
--   npx tsx scripts/dry-run-migrations.ts --project ipstebqawrvhkyntctrv \
--     supabase/migrations/0130_*.sql --trial scripts/trials/push-devices.sql
do $trial$
declare
  v_staff uuid := (select id from auth.users where email = 'siddharth.cyriac.99@gmail.com');
  v_probe uuid := (select id from auth.users where email = 'siddharth.cyriac.99+probe@gmail.com');
  s_staff uuid := gen_random_uuid();
  s_probe uuid := gen_random_uuid();
  s_unverified uuid := gen_random_uuid();
  t_shared text := 'trial-token-shared-phone-' || gen_random_uuid();
  t_own text := 'trial-token-own-phone-' || gen_random_uuid();
  v_count int;
  v_refused boolean;
begin
  if v_staff is null or v_probe is null then
    raise exception 'TRIAL SETUP: the staff or probe account is missing';
  end if;
  insert into auth_verified_sessions (session_id, user_id, method)
  values (s_staff, v_staff, 'otp'), (s_probe, v_probe, 'otp');

  -- 1. Staff records a phone and sees it; the probe does not.
  perform set_config('request.jwt.claims', json_build_object('sub', v_staff,
    'role', 'authenticated', 'session_id', s_staff)::text, true);
  set local role authenticated;
  perform claim_push_device(t_shared, 'android');
  perform claim_push_device(t_own, 'android');
  select count(*) into v_count from push_devices where token in (t_shared, t_own);
  if v_count <> 2 then raise exception 'TRIAL 1 FAILED: staff sees % of their 2 phones', v_count; end if;

  -- 2. No direct insert or update.
  v_refused := false;
  begin
    insert into push_devices (token, profile_id, platform) values ('trial-token-direct-insert-x', v_probe, 'ios');
  exception when insufficient_privilege then
    v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 2 FAILED: a direct insert went through'; end if;
  v_refused := false;
  begin
    update push_devices set profile_id = v_probe where token = t_own;
  exception when insufficient_privilege then
    v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 2 FAILED: a direct update went through'; end if;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', v_probe,
    'role', 'authenticated', 'session_id', s_probe)::text, true);
  set local role authenticated;
  select count(*) into v_count from push_devices where profile_id = v_staff;
  if v_count <> 0 then raise exception 'TRIAL 1 FAILED: the probe reads % of staff''s phones', v_count; end if;

  -- 3. The probe cannot forget staff's phone.
  delete from push_devices where token = t_own;
  reset role;
  if not exists (select 1 from push_devices where token = t_own and profile_id = v_staff) then
    raise exception 'TRIAL 3 FAILED: the probe deleted staff''s phone';
  end if;

  -- 4. The probe signs in on the shared phone: it becomes theirs, not staff's.
  set local role authenticated;
  perform claim_push_device(t_shared, 'android');
  select count(*) into v_count from push_devices where token = t_shared;
  if v_count <> 1 then raise exception 'TRIAL 4 FAILED: the probe does not see the shared phone'; end if;
  reset role;
  if (select profile_id from push_devices where token = t_shared) <> v_probe
     or (select count(*) from push_devices where token = t_shared) <> 1 then
    raise exception 'TRIAL 4 FAILED: the shared phone did not move to the probe alone';
  end if;

  -- 5. A password-only session can neither record nor read a phone.
  perform set_config('request.jwt.claims', json_build_object('sub', v_staff,
    'role', 'authenticated', 'session_id', s_unverified)::text, true);
  set local role authenticated;
  v_refused := false;
  begin
    perform claim_push_device('trial-token-unverified-' || gen_random_uuid(), 'android');
  exception when raise_exception then
    v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 5 FAILED: a password-only session recorded a phone'; end if;
  select count(*) into v_count from push_devices;
  if v_count <> 0 then raise exception 'TRIAL 5 FAILED: a password-only session reads % phones', v_count; end if;
  reset role;

  -- 6. anon cannot call it.
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  v_refused := false;
  begin
    perform claim_push_device('trial-token-anon-' || gen_random_uuid(), 'android');
  exception when insufficient_privilege then
    v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 6 FAILED: anon recorded a phone'; end if;
  reset role;

  -- 7. Staff forgets their own phone.
  perform set_config('request.jwt.claims', json_build_object('sub', v_staff,
    'role', 'authenticated', 'session_id', s_staff)::text, true);
  set local role authenticated;
  delete from push_devices where token = t_own;
  reset role;
  if exists (select 1 from push_devices where token = t_own) then
    raise exception 'TRIAL 7 FAILED: staff could not forget their own phone';
  end if;

  raise exception 'ALL TRIALS PASSED';
end $trial$;
