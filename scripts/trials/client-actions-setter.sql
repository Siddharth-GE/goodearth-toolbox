-- Behaviour trial for 0121 — only whoever set an action closes it. Runs
-- inside the dry-run transaction; always rolled back.
--
-- Under row-level security (set local role authenticated) as two people
-- holding /client-relations alone — the staff Siddharth account (the gmail
-- one) and the probe — and as the founder's admin login. A trial run as
-- the database owner proves no policy and no guard (BUGCATCHER #19).
--
--   npx tsx scripts/dry-run-migrations.ts --project ipstebqawrvhkyntctrv \
--     supabase/migrations/0121_*.sql --trial scripts/trials/client-actions-setter.sql
do $trial$
declare
  v_staff uuid := (select id from auth.users where email = 'siddharth.cyriac.99@gmail.com');
  v_probe uuid := (select id from auth.users where email = 'siddharth.cyriac.99+probe@gmail.com');
  v_admin uuid := (select id from auth.users where email = 'siddharth@goodearthkannur.org');
  v_eng uuid;
  v_set uuid;
  v_imported uuid;
  v_refused boolean;
begin
  if v_staff is null or v_probe is null or v_admin is null then
    raise exception 'TRIAL SETUP: the staff, probe or admin account is missing on staging';
  end if;
  select e.id into v_eng
    from client_engagements e join units u on u.id = e.unit_id
    join projects p on p.id = e.project_id
   where p.name = 'Saarang - Villas' and u.code = 'V10';
  if v_eng is null then raise exception 'TRIAL SETUP: Villa 10 has no Client Relations record'; end if;

  update profiles set role_id = null where id in (v_staff, v_probe);
  delete from user_apps where user_id in (v_staff, v_probe);
  insert into user_apps (user_id, app) values (v_staff, '/client-relations'), (v_probe, '/client-relations');

  -- A script's insert (no session) pins the owner as setter.
  insert into client_actions (engagement_id, action, owner_id)
  values (v_eng, 'Trial: brought in from the tracker', v_staff)
  returning id into v_imported;
  if (select created_by from client_actions where id = v_imported) is distinct from v_staff then
    raise exception 'TRIAL 1 FAILED: a script insert did not pin its owner as setter';
  end if;

  -- 2. The probe sets an action for the staff person — and cannot forge
  --    who set it.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_probe, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into client_actions (engagement_id, action, owner_id, created_by)
  values (v_eng, 'Trial: share the 3D', v_staff, v_staff)
  returning id into v_set;
  if (select created_by from client_actions where id = v_set) is distinct from v_probe then
    raise exception 'TRIAL 2 FAILED: the setter was taken from the request, not the session';
  end if;

  -- 3. Its owner cannot close it, nor make themselves its setter — but can
  --    mark it finished, and still edit and re-date it.
  reset role;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_refused := false;
  begin
    update client_actions set status = 'done', done_on = current_date where id = v_set;
  exception when raise_exception then
    v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 3 FAILED: the owner closed an action someone else set'; end if;
  v_refused := false;
  begin
    update client_actions set created_by = v_staff where id = v_set;
  exception when raise_exception then
    v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 3 FAILED: the owner made themselves the setter'; end if;
  update client_actions
     set status = 'awaiting_confirmation', action = 'Trial: share the 3D (sent)', due_on = current_date
   where id = v_set;
  if (select status from client_actions where id = v_set) <> 'awaiting_confirmation' then
    raise exception 'TRIAL 3 FAILED: the owner could not mark it finished';
  end if;

  -- 4. An action whose setter is its owner, the owner closes.
  update client_actions set status = 'done', done_on = current_date where id = v_imported;
  if (select status from client_actions where id = v_imported) <> 'done' then
    raise exception 'TRIAL 4 FAILED: the owner could not close what they set';
  end if;

  -- 5. The setter closes it; the owner cannot open it again.
  reset role;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_probe, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_refused := false;
  begin
    update client_actions set status = 'open', done_on = null where id = v_imported;
  exception when raise_exception then
    v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 5 FAILED: a bystander opened a closed action'; end if;
  update client_actions set status = 'done', done_on = current_date where id = v_set;
  if (select status from client_actions where id = v_set) <> 'done' then
    raise exception 'TRIAL 5 FAILED: the setter could not close it';
  end if;
  reset role;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_refused := false;
  begin
    update client_actions set status = 'open', done_on = null where id = v_set;
  exception when raise_exception then
    v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 5 FAILED: the owner opened a closed action'; end if;

  -- 6. A manager opens and closes anyone's.
  reset role;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update client_actions set status = 'open', done_on = null where id = v_set;
  update client_actions set status = 'done', done_on = current_date where id = v_imported;
  if (select status from client_actions where id = v_set) <> 'open' then
    raise exception 'TRIAL 6 FAILED: a manager could not open an action';
  end if;

  raise exception 'ALL TRIALS PASSED — 0121: the setter or a manager closes, the owner finishes, nobody forges the setter';
end $trial$;
