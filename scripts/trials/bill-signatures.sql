-- Behaviour trial for 0168 — who signs a bill. Runs inside the dry-run transaction; always rolled back.
-- Runs UNDER ROW-LEVEL SECURITY as the staff account made /bills-only: it reads, it never writes.
--
--   npx tsx scripts/dry-run-migrations.ts --project ipstebqawrvhkyntctrv \
--     supabase/migrations/0168_*.sql --trial scripts/trials/bill-signatures.sql
do $trial$
declare
  v_user uuid := (select id from auth.users where email = 'siddharth.cyriac.99@gmail.com');
  s_user uuid := gen_random_uuid();
  v_rows int;
  v_message text;
begin
  if v_user is null then
    raise exception 'TRIAL SETUP: staging is missing the staff account';
  end if;
  insert into auth_verified_sessions (session_id, user_id, method) values (s_user, v_user, 'otp');
  delete from user_apps where user_id = v_user;
  insert into user_apps (user_id, app) values (v_user, '/bills');
  insert into bill_signatures (user_id, path) values (v_user, 'people/' || v_user || '/a.png');
  perform set_config('request.jwt.claims', json_build_object('sub', v_user,
    'role', 'authenticated', 'session_id', s_user)::text, true);
  set local role authenticated;

  -- 1. The grant reads who signs and whose signature is kept.
  if (select count(*) from bill_signers) <> 1 or (select count(*) from bill_signatures where user_id = v_user) <> 1 then
    raise exception 'TRIAL 1 FAILED: a /bills holder cannot read the signers';
  end if;

  -- 2. It cannot change them: the update touches nothing, the insert and delete are refused or touch nothing.
  update bill_signers set final_by = v_user where id;
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then
    raise exception 'TRIAL 2 FAILED: a /bills holder changed who signs';
  end if;
  delete from bill_signatures where user_id = v_user;
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then
    raise exception 'TRIAL 2 FAILED: a /bills holder removed a signature';
  end if;
  v_message := null;
  begin
    insert into bill_signatures (user_id, path) values (v_user, 'people/' || v_user || '/b.png')
      on conflict (user_id) do update set path = excluded.path;
  exception when insufficient_privilege then v_message := sqlerrm;
  end;
  if v_message is null then
    raise exception 'TRIAL 2 FAILED: a /bills holder replaced a signature';
  end if;

  -- 3. Without the grant, nothing is readable.
  reset role;
  delete from user_apps where user_id = v_user;
  set local role authenticated;
  if exists (select 1 from bill_signers) or exists (select 1 from bill_signatures) then
    raise exception 'TRIAL 3 FAILED: someone without Bills reads the signers';
  end if;
  reset role;

  -- 4. A path outside the person's own folder is refused.
  v_message := null;
  begin
    insert into bill_signatures (user_id, path) values (gen_random_uuid(), 'people/x/a.png');
  exception when check_violation or foreign_key_violation then v_message := sqlerrm;
  end;
  if v_message is null then
    raise exception 'TRIAL 4 FAILED: a stray path was kept';
  end if;

  raise exception 'ALL TRIALS PASSED';
end $trial$;
