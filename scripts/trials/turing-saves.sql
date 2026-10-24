-- Behaviour trial for 0153 — what an admin saved from a Turing proposal: their own, once, never
-- deleted. Runs inside the dry-run transaction, always rolled back, under row-level security.
--
--   npx tsx scripts/dry-run-migrations.ts --project ipstebqawrvhkyntctrv \
--     supabase/migrations/0153_turing_saves.sql --trial scripts/trials/turing-saves.sql
do $trial$
declare
  v_admin uuid := (select id from auth.users where email = 'siddharth@goodearthkannur.org');
  v_other uuid := (select id from auth.users where email = 'siddharth.cyriac.99@gmail.com');
  s_admin uuid := gen_random_uuid();
  s_other uuid := gen_random_uuid();
  v_mine uuid;
  v_theirs uuid;
  v_count int;
  v_refused boolean;
begin
  if v_admin is null or v_other is null then
    raise exception 'TRIAL SETUP: the admin or the staff account is missing on staging';
  end if;
  update profiles set role = 'admin' where id = v_other;
  insert into auth_verified_sessions (session_id, user_id, method) values
    (s_admin, v_admin, 'otp'), (s_other, v_other, 'otp');

  -- The second admin's own conversation, made as them.
  perform set_config('request.jwt.claims', json_build_object('sub', v_other,
    'role', 'authenticated', 'session_id', s_other)::text, true);
  set local role authenticated;
  insert into turing_conversations (title) values ('Theirs') returning id into v_theirs;
  reset role;

  -- 1. An admin records a save on their own conversation, once, and fills in its results.
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin,
    'role', 'authenticated', 'session_id', s_admin)::text, true);
  set local role authenticated;
  insert into turing_conversations (title) values ('Mine') returning id into v_mine;
  insert into turing_saves (conversation_id, tool_use_id) values (v_mine, 'toolu_1');
  update turing_saves set results = '[{"row":0,"ok":true}]' where conversation_id = v_mine;
  get diagnostics v_count = row_count;
  if v_count <> 1 then raise exception 'TRIAL 1 FAILED: the results did not land'; end if;
  v_refused := false;
  begin
    update turing_saves set tool_use_id = 'toolu_9' where conversation_id = v_mine;
  exception when insufficient_privilege then
    v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 1 FAILED: a save was moved to another proposal'; end if;
  v_refused := false;
  begin
    insert into turing_saves (conversation_id, tool_use_id) values (v_mine, 'toolu_1');
  exception when unique_violation then
    v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 1 FAILED: one proposal was saved twice'; end if;

  -- 2. It cannot be deleted.
  v_refused := false;
  begin
    delete from turing_saves where conversation_id = v_mine;
  exception when insufficient_privilege then
    v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 2 FAILED: a save was deleted'; end if;

  -- 3. No save on another admin's conversation.
  v_refused := false;
  begin
    insert into turing_saves (conversation_id, tool_use_id) values (v_theirs, 'toolu_2');
  exception when insufficient_privilege then
    v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 3 FAILED: a save landed on another admin''s conversation'; end if;
  reset role;

  -- 4. The other admin sees none of the first one's saves.
  perform set_config('request.jwt.claims', json_build_object('sub', v_other,
    'role', 'authenticated', 'session_id', s_other)::text, true);
  set local role authenticated;
  select count(*) into v_count from turing_saves where conversation_id = v_mine;
  if v_count <> 0 then raise exception 'TRIAL 4 FAILED: another admin reads the saves'; end if;
  update turing_saves set reported = true where conversation_id = v_mine;
  reset role;
  if (select reported from turing_saves where conversation_id = v_mine) then
    raise exception 'TRIAL 4 FAILED: another admin changed the save';
  end if;

  -- 5. Deleting the conversation takes its saves with it.
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin,
    'role', 'authenticated', 'session_id', s_admin)::text, true);
  set local role authenticated;
  delete from turing_conversations where id = v_mine;
  reset role;
  if exists (select 1 from turing_saves where conversation_id = v_mine) then
    raise exception 'TRIAL 5 FAILED: a save outlived its conversation';
  end if;

  raise exception 'ALL TRIALS PASSED';
end $trial$;
