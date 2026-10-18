-- Behaviour trial for 0129 — reads ask for the second factor; anon calls nothing.
-- Runs inside the dry-run transaction; always rolled back, UNDER ROW-LEVEL
-- SECURITY (BUGCATCHER #19).
--
--   npx tsx scripts/dry-run-migrations.ts --project ipstebqawrvhkyntctrv \
--     supabase/migrations/0127_*.sql supabase/migrations/0128_*.sql \
--     supabase/migrations/0129_*.sql --trial scripts/trials/reads-need-the-second-factor.sql
do $trial$
declare
  v_staff uuid := (select id from auth.users where email = 'siddharth.cyriac.99@gmail.com');
  v_verified uuid := gen_random_uuid();
  v_unverified uuid := gen_random_uuid();
  v_count int;
  v_refused boolean;
begin
  if v_staff is null then raise exception 'TRIAL SETUP: the staff account is missing'; end if;
  insert into auth_verified_sessions (session_id, user_id, method) values (v_verified, v_staff, 'otp');

  -- 1. A password-only session reads its own profile and nothing else open.
  perform set_config('request.jwt.claims', json_build_object('sub', v_staff,
    'role', 'authenticated', 'session_id', v_unverified)::text, true);
  set local role authenticated;
  select count(*) into v_count from profiles where id = v_staff;
  if v_count <> 1 then raise exception 'TRIAL 1 FAILED: own profile unreadable before the code'; end if;
  select count(*) into v_count from profiles where id <> v_staff;
  if v_count <> 0 then raise exception 'TRIAL 1 FAILED: % other profiles read before the code', v_count; end if;
  select count(*) into v_count from items;
  if v_count <> 0 then raise exception 'TRIAL 1 FAILED: % items read before the code', v_count; end if;
  select count(*) into v_count from clients;
  if v_count <> 0 then raise exception 'TRIAL 1 FAILED: % clients read before the code', v_count; end if;
  reset role;

  -- 2. The same person, verified, reads them all.
  perform set_config('request.jwt.claims', json_build_object('sub', v_staff,
    'role', 'authenticated', 'session_id', v_verified)::text, true);
  set local role authenticated;
  select count(*) into v_count from profiles;
  if v_count < 2 then raise exception 'TRIAL 2 FAILED: a verified session reads % profiles', v_count; end if;
  select count(*) into v_count from items;
  if v_count = 0 then raise exception 'TRIAL 2 FAILED: a verified session reads no items'; end if;
  if not has_app('/directory') and not is_admin() and not exists (select 1 from projects) then
    raise exception 'TRIAL 2 FAILED: a verified session reads no projects';
  end if;
  reset role;

  -- 3. anon can call no function, and read no view.
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  v_refused := false;
  begin
    perform has_app('/indents');
  exception when insufficient_privilege then
    v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 3 FAILED: anon called has_app'; end if;
  v_refused := false;
  begin
    perform 1 from birdwing_stay_facts limit 1;
  exception when insufficient_privilege then
    v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 3 FAILED: anon read a Birdwing view'; end if;
  reset role;

  raise exception 'ALL TRIALS PASSED';
end $trial$;
