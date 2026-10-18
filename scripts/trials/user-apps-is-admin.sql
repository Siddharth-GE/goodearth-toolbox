-- Behaviour trial for 0127 — user_apps' admin policies through is_admin().
-- Runs inside the dry-run transaction; always rolled back, and UNDER
-- ROW-LEVEL SECURITY (BUGCATCHER #19).
--
--   npx tsx scripts/dry-run-migrations.ts --project ipstebqawrvhkyntctrv \
--     supabase/migrations/0127_*.sql --trial scripts/trials/user-apps-is-admin.sql
do $trial$
declare
  v_staff uuid := (select id from auth.users where email = 'siddharth.cyriac.99+probe@gmail.com');
  v_admin uuid := (select id from auth.users where email = 'siddharth@goodearthkannur.org');
  v_verified uuid := gen_random_uuid();
  v_unverified uuid := gen_random_uuid();
  v_count int;
  v_refused boolean;
begin
  if v_staff is null or v_admin is null then
    raise exception 'TRIAL SETUP: the probe or the admin account is missing on staging';
  end if;
  if not exists (select 1 from profiles where id = v_admin and role = 'admin' and is_active) then
    raise exception 'TRIAL SETUP: siddharth@goodearthkannur.org is not an active admin';
  end if;
  delete from user_apps where user_id = v_staff and app = '/indents';
  insert into auth_verified_sessions (session_id, user_id, method)
    values (v_verified, v_admin, 'otp');

  -- 1. An admin with a password but no emailed code is refused.
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin,
    'role', 'authenticated', 'session_id', v_unverified)::text, true);
  set local role authenticated;
  v_refused := false;
  begin
    insert into user_apps (user_id, app) values (v_staff, '/indents');
  exception when insufficient_privilege then
    v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 1 FAILED: an unverified admin granted a tool'; end if;
  select count(*) into v_count from user_apps where user_id = v_staff;
  if v_count <> 0 then
    raise exception 'TRIAL 1 FAILED: an unverified admin read % of the probe''s grants', v_count;
  end if;
  reset role;

  -- 2. The same admin, verified, grants, reads and revokes.
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin,
    'role', 'authenticated', 'session_id', v_verified)::text, true);
  set local role authenticated;
  insert into user_apps (user_id, app) values (v_staff, '/indents');
  if not exists (select 1 from user_apps where user_id = v_staff and app = '/indents') then
    raise exception 'TRIAL 2 FAILED: a verified admin cannot read the grant just made';
  end if;
  reset role;

  -- 3. A switched-off admin, verified, is refused.
  update profiles set is_active = false where id = v_admin;
  set local role authenticated;
  delete from user_apps where user_id = v_staff and app = '/indents';
  reset role;
  if not exists (select 1 from user_apps where user_id = v_staff and app = '/indents') then
    raise exception 'TRIAL 3 FAILED: a switched-off admin revoked a tool';
  end if;
  -- As the database owner, with no session: profiles_guard refuses a
  -- switched-off admin switching themselves back on.
  perform set_config('request.jwt.claims', '', true);
  update profiles set is_active = true where id = v_admin;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin,
    'role', 'authenticated', 'session_id', v_verified)::text, true);
  set local role authenticated;
  delete from user_apps where user_id = v_staff and app = '/indents';
  reset role;
  if exists (select 1 from user_apps where user_id = v_staff and app = '/indents') then
    raise exception 'TRIAL 2 FAILED: a verified admin could not revoke';
  end if;

  -- 4. Staff still read their own grants, and only theirs.
  perform set_config('request.jwt.claims', json_build_object('sub', v_staff,
    'role', 'authenticated')::text, true);
  set local role authenticated;
  if not exists (select 1 from user_apps where user_id = v_staff) then
    raise exception 'TRIAL 4 FAILED: the probe cannot read its own grants';
  end if;
  if exists (select 1 from user_apps where user_id <> v_staff) then
    raise exception 'TRIAL 4 FAILED: the probe reads someone else''s grants';
  end if;
  v_refused := false;
  begin
    insert into user_apps (user_id, app) values (v_staff, '/bills');
  exception when insufficient_privilege then
    v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 4 FAILED: staff granted themselves a tool'; end if;
  reset role;

  raise exception 'ALL TRIALS PASSED';
end $trial$;
