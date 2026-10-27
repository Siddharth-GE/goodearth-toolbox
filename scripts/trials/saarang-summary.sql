-- Behaviour trial for 0162 — Saarang Collections' kept figures. Runs inside the dry-run transaction;
-- always rolled back, UNDER ROW-LEVEL SECURITY (BUGCATCHER #19), as the staff account made
-- /saarang-collections-only, and as the probe, who must see nothing.
--
--   npx tsx scripts/dry-run-migrations.ts --project ipstebqawrvhkyntctrv \
--     supabase/migrations/0162_saarang_collection_summary.sql --trial scripts/trials/saarang-summary.sql
do $trial$
declare
  v_user uuid := (select id from auth.users where email = 'siddharth.cyriac.99@gmail.com');
  v_probe uuid := (select id from auth.users where email = 'siddharth.cyriac.99+probe@gmail.com');
  s_user uuid := gen_random_uuid();
  s_probe uuid := gen_random_uuid();
  v_n int;
  v_refused boolean;
begin
  if v_user is null or v_probe is null then
    raise exception 'TRIAL SETUP: staging is missing the staff account or the probe';
  end if;
  insert into auth_verified_sessions (session_id, user_id, method) values (s_user, v_user, 'otp'), (s_probe, v_probe, 'otp');
  delete from user_apps where user_id = v_user;
  update profiles set role_id = null where id = v_user;
  insert into user_apps (user_id, app) values (v_user, '/saarang-collections');
  if exists (select 1 from user_apps where user_id = v_probe and app = '/saarang-collections') then
    raise exception 'TRIAL SETUP: the probe holds /saarang-collections';
  end if;

  -- Start empty, and with one figure another person kept, as the app leaves the table between saves.
  delete from saarang_collection_summary;
  insert into saarang_collection_summary (project, key, label, value, computed_by)
  values ('villa', 'S', 'OL-Collection', 5, v_probe);

  -- 1. The grant holder writes and rewrites a figure, takes over one another person kept, and may keep a null.
  perform set_config('request.jwt.claims', json_build_object('sub', v_user,
    'role', 'authenticated', 'session_id', s_user)::text, true);
  set local role authenticated;
  if (select is_admin()) then raise exception 'TRIAL SETUP: the staff account is an admin'; end if;
  insert into saarang_collection_summary (project, key, label, value) values ('plot', 'F', 'Total collection', 1)
  on conflict (project, key) do update set value = excluded.value, label = excluded.label,
    computed_by = excluded.computed_by, computed_at = excluded.computed_at;
  insert into saarang_collection_summary (project, key, label, value) values ('plot', 'F', 'Total collection', 2)
  on conflict (project, key) do update set value = excluded.value, label = excluded.label,
    computed_by = excluded.computed_by, computed_at = excluded.computed_at;
  insert into saarang_collection_summary (project, key, label, value) values ('villa', 'M', 'Outstanding', null);
  if (select value from saarang_collection_summary where project = 'plot' and key = 'F') is distinct from 2::numeric then
    raise exception 'TRIAL 1 FAILED: a kept figure did not change';
  end if;
  insert into saarang_collection_summary (project, key, label, value, computed_by) values ('villa', 'S', 'OL-Collection', 6, v_user)
  on conflict (project, key) do update set value = excluded.value, label = excluded.label,
    computed_by = excluded.computed_by, computed_at = excluded.computed_at;
  if (select (value, computed_by) from saarang_collection_summary where project = 'villa' and key = 'S')
     is distinct from (6::numeric(16, 2), v_user) then
    raise exception 'TRIAL 1 FAILED: a figure another person kept was not taken over';
  end if;

  -- 2. Never deleted, never in another's name, never a key the Summary does not work out.
  v_refused := false;
  begin
    delete from saarang_collection_summary;
  exception when insufficient_privilege then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 2 FAILED: a kept figure could be deleted'; end if;
  v_refused := false;
  begin
    insert into saarang_collection_summary (project, key, label, value, computed_by) values ('villa', 'F', 'x', 1, v_probe);
  exception when insufficient_privilege then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 2 FAILED: a figure was kept in someone else''s name'; end if;
  v_refused := false;
  begin
    update saarang_collection_summary set computed_by = v_probe where project = 'plot' and key = 'F';
  exception when insufficient_privilege then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 2 FAILED: a figure was rewritten in someone else''s name'; end if;
  v_refused := false;
  begin
    insert into saarang_collection_summary (project, key, label, value) values ('plot', 'C', 'Typed', 1);
  exception when check_violation then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 2 FAILED: a typed column was kept as worked out'; end if;
  reset role;

  -- 3. The probe, without the grant, reads and writes nothing.
  perform set_config('request.jwt.claims', json_build_object('sub', v_probe,
    'role', 'authenticated', 'session_id', s_probe)::text, true);
  set local role authenticated;
  select count(*) into v_n from saarang_collection_summary;
  if v_n <> 0 then raise exception 'TRIAL 3 FAILED: the probe reads % kept figures', v_n; end if;
  update saarang_collection_summary set value = 99, computed_by = v_probe;
  v_refused := false;
  begin
    insert into saarang_collection_summary (project, key, label, value, computed_by) values ('villa', 'E', 'x', 1, v_probe);
  exception when insufficient_privilege then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 3 FAILED: the probe kept a figure'; end if;
  reset role;
  if (select value from saarang_collection_summary where project = 'plot' and key = 'F') is distinct from 2::numeric then
    raise exception 'TRIAL 3 FAILED: the probe changed a kept figure';
  end if;

  raise exception 'ALL TRIALS PASSED';
end $trial$;
