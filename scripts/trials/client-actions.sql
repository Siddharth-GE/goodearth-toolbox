-- Behaviour trial for 0119 + 0120 — build progress in Masters, and
-- Client Relations' actions. Runs inside the dry-run transaction; always
-- rolled back.
--
-- Everything after the setup runs UNDER ROW-LEVEL SECURITY (set local
-- role authenticated): as the staff Siddharth account (the gmail one)
-- holding /client-relations alone, as the probe holding /inventory alone,
-- and as the founder's admin login. A trial run as the database owner
-- bypasses every policy (BUGCATCHER #19).
--
--   npx tsx scripts/dry-run-migrations.ts --project ipstebqawrvhkyntctrv \
--     supabase/migrations/0119_*.sql supabase/migrations/0120_*.sql \
--     --trial scripts/trials/client-actions.sql
do $trial$
declare
  v_staff uuid := (select id from auth.users where email = 'siddharth.cyriac.99@gmail.com');
  v_probe uuid := (select id from auth.users where email = 'siddharth.cyriac.99+probe@gmail.com');
  v_admin uuid := (select id from auth.users where email = 'siddharth@goodearthkannur.org');
  v_eng uuid;
  v_stage uuid;
  v_action uuid;
  v_count int;
  v_refused boolean;
begin
  if v_staff is null or v_probe is null or v_admin is null then
    raise exception 'TRIAL SETUP: the staff, probe or admin account is missing on staging';
  end if;
  if not exists (select 1 from profiles where id = v_admin and role = 'admin' and is_active) then
    raise exception 'TRIAL SETUP: siddharth@goodearthkannur.org is not an active admin';
  end if;
  select e.id into v_eng
    from client_engagements e join units u on u.id = e.unit_id
   where u.code = 'V10';
  if v_eng is null then
    raise exception 'TRIAL SETUP: Villa 10 has no Client Relations record';
  end if;

  -- One grant each, no role bundle, inside this transaction only.
  update profiles set role_id = null where id in (v_staff, v_probe);
  delete from user_apps where user_id in (v_staff, v_probe);
  insert into user_apps (user_id, app)
  values (v_staff, '/client-relations'), (v_probe, '/inventory');

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- 1. A CRM person reads the plots and the Masters list; the team holds
  --    them and leaves the admin out.
  select count(*) into v_count from client_engagements;
  if v_count < 43 then raise exception 'TRIAL 1 FAILED: staff sees % plots', v_count; end if;
  select id into v_stage from progress_stages where name = 'Ground floor slab';
  if v_stage is null then raise exception 'TRIAL 1 FAILED: no Ground floor slab stage'; end if;
  if not exists (select 1 from client_relations_team() t where t.id = v_staff) then
    raise exception 'TRIAL 1 FAILED: the team leaves out a /client-relations holder';
  end if;
  if exists (select 1 from client_relations_team() t where t.id = v_admin) then
    raise exception 'TRIAL 1 FAILED: the team lists an admin';
  end if;

  -- 2. They add an action and move it along.
  insert into client_actions (engagement_id, action, owner_id, due_on, created_by, updated_by)
  values (v_eng, 'Trial: share the 3D with the client', v_staff, current_date, v_staff, v_staff)
  returning id into v_action;
  update client_actions set status = 'waiting_management', track = 'kaadal' where id = v_action;
  if (select status from client_actions where id = v_action) <> 'waiting_management' then
    raise exception 'TRIAL 2 FAILED: the status did not move';
  end if;

  -- 3. "Done" without a done date is refused, and so is an assumed date
  --    with no date; done with its date is kept.
  v_refused := false;
  begin
    update client_actions set status = 'done' where id = v_action;
  exception when check_violation then
    v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 3 FAILED: done without a done date'; end if;
  v_refused := false;
  begin
    insert into client_actions (engagement_id, action, owner_id, due_assumed)
    values (v_eng, 'Trial: assumed with no date', v_staff, true);
  exception when check_violation then
    v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 3 FAILED: an assumed date with no date'; end if;
  update client_actions set status = 'done', done_on = current_date where id = v_action;

  -- 4. A done action is not deleted: the guard says to cancel it instead (0149).
  v_refused := false;
  begin
    delete from client_actions where id = v_action;
  exception when raise_exception then
    v_refused := true;
  end;
  if not v_refused or not exists (select 1 from client_actions where id = v_action) then
    raise exception 'TRIAL 4 FAILED: a done action was deleted';
  end if;

  -- 5. The plot takes a build stage, Kaadal, a design check and the
  --    tracker's words; a word off the list is refused.
  update client_engagements
     set progress_stage_id = v_stage,
         kaadal_stage = 'in_design',
         kaadal_owner_id = v_staff,
         permit_on = current_date,
         sale_deed_status = 'signed',
         sale_deed_original_with = 'tarana',
         sale_deed_ack = 'requested_from_client',
         ca_status = 'drafting',
         bottlenecks = array['bank_loan', 'legal']
   where id = v_eng;
  if (select progress_stage_id from client_engagements where id = v_eng) is distinct from v_stage then
    raise exception 'TRIAL 5 FAILED: the plot did not take its build stage';
  end if;
  v_refused := false;
  begin
    update client_engagements set kaadal_stage = 'nonsense' where id = v_eng;
  exception when check_violation then
    v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 5 FAILED: a Kaadal stage off the list'; end if;

  -- 6. A CRM person cannot add to or rename the Masters list.
  v_refused := false;
  begin
    insert into progress_stages (name, sort_order) values ('Trial stage by staff', 95);
  exception when insufficient_privilege then
    v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 6 FAILED: staff added a build stage'; end if;
  update progress_stages set name = 'Renamed by staff' where id = v_stage;
  if (select name from progress_stages where id = v_stage) <> 'Ground floor slab' then
    raise exception 'TRIAL 6 FAILED: staff renamed a build stage';
  end if;

  -- 7. Someone without /client-relations sees no action and no plot,
  --    adds nothing, and is refused the team — but reads the Masters list.
  reset role;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_probe, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_count from client_actions;
  if v_count <> 0 then raise exception 'TRIAL 7 FAILED: no-grant sees % actions', v_count; end if;
  select count(*) into v_count from client_engagements;
  if v_count <> 0 then raise exception 'TRIAL 7 FAILED: no-grant sees % plots', v_count; end if;
  v_refused := false;
  begin
    insert into client_actions (action, owner_id) values ('Trial: no grant', v_probe);
  exception when insufficient_privilege then
    v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 7 FAILED: no-grant added an action'; end if;
  v_refused := false;
  begin
    perform client_relations_team();
  exception when raise_exception then
    v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 7 FAILED: no-grant read the team'; end if;
  select count(*) into v_count from progress_stages;
  if v_count < 2 then raise exception 'TRIAL 7 FAILED: no-grant cannot read the stages'; end if;

  -- 8. Masters (the admin): a stage a plot sits on cannot be deleted; a
  --    rename keeps the plot on it; a second "agreement" is refused.
  reset role;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_refused := false;
  begin
    delete from progress_stages where id = v_stage;
  exception when foreign_key_violation then
    v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 8 FAILED: a stage in use was deleted'; end if;
  update progress_stages set name = 'Ground-floor slab' where id = v_stage;
  if (select progress_stage_id from client_engagements where id = v_eng) is distinct from v_stage then
    raise exception 'TRIAL 8 FAILED: a rename moved the plot off its stage';
  end if;
  v_refused := false;
  begin
    insert into progress_stages (name, sort_order) values ('  agreement ', 5);
  exception when unique_violation then
    v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 8 FAILED: a duplicate stage name was accepted'; end if;
  if not exists (select 1 from client_actions where id = v_action) then
    raise exception 'TRIAL 8 FAILED: the admin cannot see the action';
  end if;

  raise exception 'ALL TRIALS PASSED — 0119/0120: the team works its actions, nobody deletes one, the gate holds, Masters owns the stages';
end $trial$;
