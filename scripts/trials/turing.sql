-- Behaviour trial for 0151 — Turing's tables: admins only, each admin's conversations their own,
-- messages append-only, pages shared. Runs inside the dry-run transaction, always rolled back, and
-- UNDER ROW-LEVEL SECURITY (BUGCATCHER #19).
--
--   npx tsx scripts/dry-run-migrations.ts --project ipstebqawrvhkyntctrv \
--     supabase/migrations/0151_turing.sql --trial scripts/trials/turing.sql
do $trial$
declare
  v_admin uuid := (select id from auth.users where email = 'siddharth@goodearthkannur.org');
  v_other uuid := (select id from auth.users where email = 'siddharth.cyriac.99@gmail.com');
  v_probe uuid := (select id from auth.users where email = 'siddharth.cyriac.99+probe@gmail.com');
  s_admin uuid := gen_random_uuid();
  s_other uuid := gen_random_uuid();
  s_probe uuid := gen_random_uuid();
  v_conversation uuid;
  v_page uuid;
  v_count int;
  v_refused boolean;
begin
  if v_admin is null or v_other is null or v_probe is null then
    raise exception 'TRIAL SETUP: the admin, the staff account or the probe is missing on staging';
  end if;
  -- A second admin for the trial: the staff account, promoted inside the rolled-back transaction.
  update profiles set role = 'admin' where id = v_other;
  insert into auth_verified_sessions (session_id, user_id, method) values
    (s_admin, v_admin, 'otp'), (s_other, v_other, 'otp'), (s_probe, v_probe, 'otp');

  -- 1. An admin starts a conversation, writes to it and reads it back.
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin,
    'role', 'authenticated', 'session_id', s_admin)::text, true);
  set local role authenticated;
  insert into turing_conversations (title) values ('Trial') returning id into v_conversation;
  insert into turing_messages (conversation_id, role, content)
    values (v_conversation, 'user', '[{"type":"text","text":"hello"}]');
  select count(*) into v_count from turing_messages where conversation_id = v_conversation;
  if v_count <> 1 then raise exception 'TRIAL 1 FAILED: the admin reads % of their messages', v_count; end if;
  insert into turing_pages (title, recipe, storage_path)
    values ('Trial page', '[]', 'trial-' || gen_random_uuid() || '.html') returning id into v_page;

  -- 2. Messages are append-only: an update or delete changes nothing.
  v_refused := false;
  begin
    update turing_messages set content = '[]' where conversation_id = v_conversation;
  exception when insufficient_privilege then
    v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 2 FAILED: a message was edited'; end if;
  reset role;

  -- 3. Another admin sees none of it, cannot write into it, but sees the page.
  perform set_config('request.jwt.claims', json_build_object('sub', v_other,
    'role', 'authenticated', 'session_id', s_other)::text, true);
  set local role authenticated;
  select count(*) into v_count from turing_conversations where id = v_conversation;
  if v_count <> 0 then raise exception 'TRIAL 3 FAILED: another admin sees the conversation'; end if;
  select count(*) into v_count from turing_messages where conversation_id = v_conversation;
  if v_count <> 0 then raise exception 'TRIAL 3 FAILED: another admin reads its messages'; end if;
  v_refused := false;
  begin
    insert into turing_messages (conversation_id, role, content) values (v_conversation, 'user', '[]');
  exception when insufficient_privilege then
    v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 3 FAILED: another admin wrote into the conversation'; end if;
  v_refused := false;
  begin
    insert into turing_conversations (owner_id, title) values (v_admin, 'Planted');
  exception when insufficient_privilege then
    v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 3 FAILED: an admin made a conversation in another''s name'; end if;
  select count(*) into v_count from turing_pages where id = v_page;
  if v_count <> 1 then raise exception 'TRIAL 3 FAILED: another admin cannot see the shared page'; end if;
  v_refused := false;
  begin
    insert into turing_files (conversation_id, name, media_type, size_bytes, storage_path, anthropic_file_id)
      values (v_conversation, 'x.pdf', 'application/pdf', 1, v_other || '/x.pdf', 'file_x');
  exception when insufficient_privilege then
    v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 3 FAILED: an admin hung a file on another''s conversation'; end if;
  v_refused := false;
  begin
    insert into storage.objects (bucket_id, name) values ('turing-files', v_admin || '/planted.pdf');
  exception when insufficient_privilege then
    v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 3 FAILED: an admin wrote into another''s file folder'; end if;
  update turing_conversations set title = 'Taken' where id = v_conversation;
  delete from turing_conversations where id = v_conversation;
  reset role;
  if not exists (select 1 from turing_conversations where id = v_conversation and title = 'Trial') then
    raise exception 'TRIAL 3 FAILED: another admin changed or deleted the conversation';
  end if;

  -- 4. Staff with a verified session — the probe — reach nothing.
  perform set_config('request.jwt.claims', json_build_object('sub', v_probe,
    'role', 'authenticated', 'session_id', s_probe)::text, true);
  set local role authenticated;
  select count(*) into v_count from turing_pages;
  if v_count <> 0 then raise exception 'TRIAL 4 FAILED: the probe sees % pages', v_count; end if;
  v_refused := false;
  begin
    insert into turing_conversations (title) values ('Probe');
  exception when insufficient_privilege then
    v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 4 FAILED: the probe started a conversation'; end if;
  reset role;

  -- 5. The admin with a password but no emailed code reaches nothing.
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin,
    'role', 'authenticated', 'session_id', gen_random_uuid())::text, true);
  set local role authenticated;
  select count(*) into v_count from turing_conversations where id = v_conversation;
  if v_count <> 0 then raise exception 'TRIAL 5 FAILED: an unverified admin reads the conversation'; end if;
  reset role;

  -- 6. Deleting the conversation takes its messages; the page stays.
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin,
    'role', 'authenticated', 'session_id', s_admin)::text, true);
  set local role authenticated;
  delete from turing_conversations where id = v_conversation;
  reset role;
  select count(*) into v_count from turing_messages where conversation_id = v_conversation;
  if v_count <> 0 then raise exception 'TRIAL 6 FAILED: % messages outlived their conversation', v_count; end if;
  if not exists (select 1 from turing_pages where id = v_page) then
    raise exception 'TRIAL 6 FAILED: the page went with the conversation';
  end if;

  raise exception 'ALL TRIALS PASSED';
end $trial$;
