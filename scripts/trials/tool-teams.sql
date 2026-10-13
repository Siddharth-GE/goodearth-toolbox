-- Behaviour trial for 0114 — teams in the sidebar. Runs inside the
-- dry-run transaction; always rolled back.
--
-- Everything after the setup runs UNDER ROW-LEVEL SECURITY (set local
-- role authenticated): first as the staff Siddharth account (the gmail
-- one, holding one grant and no role inside this transaction), then as
-- the founder's admin login. A trial run as the database owner bypasses
-- every policy (BUGCATCHER #19).
--
--   npx tsx scripts/dry-run-migrations.ts --project ipstebqawrvhkyntctrv \
--     supabase/migrations/0114_*.sql --trial scripts/trials/tool-teams.sql
do $trial$
declare
  v_staff uuid := (select id from auth.users where email = 'siddharth.cyriac.99@gmail.com');
  v_admin uuid := (select id from auth.users where email = 'siddharth@goodearthkannur.org');
  v_team uuid;
  v_ops uuid;
  v_count int;
  v_refused boolean;
begin
  if v_staff is null or v_admin is null then
    raise exception 'TRIAL SETUP: the staff or the admin account is missing on staging';
  end if;
  if not exists (select 1 from profiles where id = v_admin and role = 'admin' and is_active) then
    raise exception 'TRIAL SETUP: siddharth@goodearthkannur.org is not an active admin';
  end if;

  update profiles set role_id = null where id = v_staff;
  delete from user_apps where user_id = v_staff;
  insert into user_apps (user_id, app) values (v_staff, '/inventory');
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- 1. A staff person reads the whole arrangement — the sidebar needs it.
  select count(*) into v_count from tool_teams;
  if v_count < 5 then raise exception 'TRIAL 1 FAILED: staff sees % teams', v_count; end if;
  select count(*) into v_count from tool_team_apps;
  if v_count < 20 then raise exception 'TRIAL 1 FAILED: staff sees % tool rows', v_count; end if;
  select team_id into v_ops from tool_team_apps where app = '/inventory';
  if v_ops is null then raise exception 'TRIAL 1 FAILED: /inventory has no team'; end if;

  -- 2. A staff person cannot make, rename, reorder or delete a team…
  v_refused := false;
  begin
    insert into tool_teams (name, sort_order) values ('Trial staff team', 99);
  exception when insufficient_privilege then
    v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 2 FAILED: staff made a team'; end if;
  update tool_teams set name = 'Renamed by staff', sort_order = 0 where id = v_ops;
  delete from tool_teams where id = v_ops;
  if not exists (select 1 from tool_teams where id = v_ops and name <> 'Renamed by staff') then
    raise exception 'TRIAL 2 FAILED: staff renamed or deleted a team';
  end if;

  -- 3. …nor move a tool.
  v_refused := false;
  begin
    insert into tool_team_apps (app, team_id) values ('/trial-staff', v_ops);
  exception when insufficient_privilege then
    v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 3 FAILED: staff tagged a tool'; end if;
  update tool_team_apps set team_id = (select id from tool_teams where id <> v_ops limit 1)
   where app = '/inventory';
  delete from tool_team_apps where app = '/inventory';
  if (select team_id from tool_team_apps where app = '/inventory') is distinct from v_ops then
    raise exception 'TRIAL 3 FAILED: staff moved a tool';
  end if;

  -- 4. The admin makes a team; a second "design" is refused.
  reset role;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into tool_teams (name, sort_order, created_by)
  values ('Trial Design', 0, v_admin) returning id into v_team;
  v_refused := false;
  begin
    insert into tool_teams (name, sort_order) values ('  trial design ', 1);
  exception when unique_violation then
    v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 4 FAILED: a duplicate name was accepted'; end if;

  -- 5. The admin moves a tool in, renames and reorders the team.
  insert into tool_team_apps (app, team_id, updated_by) values ('/inventory', v_team, v_admin)
  on conflict (app) do update set team_id = excluded.team_id, updated_by = excluded.updated_by;
  update tool_teams set name = 'Trial Interiors', sort_order = 7 where id = v_team;
  if (select team_id from tool_team_apps where app = '/inventory') <> v_team
     or (select name from tool_teams where id = v_team) <> 'Trial Interiors' then
    raise exception 'TRIAL 5 FAILED: the admin could not move a tool or rename';
  end if;

  -- 6. Deleting the team lets its tools fall back to "Other" — the row
  --    goes, the tool and every grant stay.
  delete from tool_teams where id = v_team;
  if exists (select 1 from tool_team_apps where app = '/inventory') then
    raise exception 'TRIAL 6 FAILED: the tool still points at a deleted team';
  end if;
  reset role;
  if not exists (select 1 from user_apps where user_id = v_staff and app = '/inventory') then
    raise exception 'TRIAL 6 FAILED: deleting a team touched a grant';
  end if;

  raise exception 'ALL TRIALS PASSED — 0114: everyone reads, only an admin arranges, a deleted team frees its tools';
end $trial$;
