-- Behaviour trial for 0126 — the design board. Runs inside the dry-run
-- transaction; always rolled back.
--
-- Everything after the setup runs UNDER ROW-LEVEL SECURITY (set local
-- role authenticated): as the staff Siddharth account (the gmail one)
-- holding /design-management alone, as the probe holding /supervisors
-- alone, and as the founder's admin login. A trial run as the database
-- owner bypasses every policy (BUGCATCHER #19).
--
--   npx tsx scripts/dry-run-migrations.ts --project ipstebqawrvhkyntctrv \
--     supabase/migrations/0126_design_board.sql \
--     --trial scripts/trials/design-board.sql
do $trial$
declare
  v_staff uuid := (select id from auth.users where email = 'siddharth.cyriac.99@gmail.com');
  v_probe uuid := (select id from auth.users where email = 'siddharth.cyriac.99+probe@gmail.com');
  v_admin uuid := (select id from auth.users where email = 'siddharth@goodearthkannur.org');
  v_colleague uuid;
  v_villa uuid;
  v_other uuid;
  v_design uuid;
  v_permit uuid;
  v_wd uuid;
  v_str uuid;
  v_mep uuid;
  v_step uuid;
  v_action uuid;
  v_count int;
  v_text text;
  v_refused boolean;
begin
  if v_staff is null or v_probe is null or v_admin is null then
    raise exception 'TRIAL SETUP: the staff, probe or admin account is missing on staging';
  end if;
  select u.id into v_villa from units u join projects p on p.id = u.project_id
   where u.code = 'V41' and p.name = 'Saarang - Villas';
  select u.id into v_other from units u join projects p on p.id = u.project_id
   where u.code = 'V40' and p.name = 'Saarang - Villas';
  if v_villa is null or v_other is null then
    raise exception 'TRIAL SETUP: Saarang Villas 40 and 41 are missing';
  end if;
  select id into v_design from design_stages where code = 'CON';
  select id into v_permit from design_stages where code = 'APP';
  select id into v_wd from design_stages where code = 'WD';
  select id into v_str from design_stages where code = 'STR';
  select id into v_mep from design_stages where code = 'MEP';
  if v_design is null or v_permit is null or v_wd is null or v_str is null or v_mep is null then
    raise exception 'TRIAL SETUP: a design stage code is missing';
  end if;

  -- 0. The migration put five stages on the board and renamed two.
  if (select count(*) from design_stages where on_board) <> 5
     or (select on_board from design_stages where id = v_mep) then
    raise exception 'TRIAL 0 FAILED: the board should hold Design, Permit, WD, Structural, Interiors';
  end if;
  if (select name from design_stages where id = v_design) <> 'Design'
     or (select name from design_stages where id = v_permit) <> 'Permit' then
    raise exception 'TRIAL 0 FAILED: Concept and Approvals were not renamed';
  end if;

  -- One grant each, no role bundle, inside this transaction only. A
  -- colleague already on the design team to give work to.
  update profiles set role_id = null where id in (v_staff, v_probe);
  delete from user_apps where user_id in (v_staff, v_probe);
  insert into user_apps (user_id, app)
  values (v_staff, '/design-management'), (v_probe, '/supervisors');
  select ua.user_id into v_colleague from user_apps ua join profiles p on p.id = ua.user_id
   where ua.app = '/design-management' and p.is_active and p.role <> 'admin' and ua.user_id <> v_staff
   order by p.full_name limit 1;
  if v_colleague is null then
    raise exception 'TRIAL SETUP: nobody else holds /design-management';
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- 1. The team holds the designer and the colleague, not the probe.
  if not exists (select 1 from design_team() t where t.id = v_staff)
     or not exists (select 1 from design_team() t where t.id = v_colleague) then
    raise exception 'TRIAL 1 FAILED: the team leaves out a /design-management holder';
  end if;
  if exists (select 1 from design_team() t where t.id = v_probe) then
    raise exception 'TRIAL 1 FAILED: the team lists someone without the grant';
  end if;

  -- 2. Bringing Villa 41 in at WD: Design and Permit Done, WD Working with
  --    the designer, every move in the history.
  perform design_set_where(v_villa, v_wd, array[v_staff]);
  if (select status from design_steps where unit_id = v_villa and design_stage_id = v_design) <> 'done'
     or (select status from design_steps where unit_id = v_villa and design_stage_id = v_permit) <> 'done'
     or (select status from design_steps where unit_id = v_villa and design_stage_id = v_wd) <> 'working' then
    raise exception 'TRIAL 2 FAILED: set where it is did not mark the stages';
  end if;
  if (select done_on from design_steps where unit_id = v_villa and design_stage_id = v_design) is null
     or (select started_on from design_steps where unit_id = v_villa and design_stage_id = v_wd) is null then
    raise exception 'TRIAL 2 FAILED: the dates did not follow the status';
  end if;
  select count(*) into v_count from design_step_events where unit_id = v_villa;
  if v_count <> 4 then
    raise exception 'TRIAL 2 FAILED: % history lines, expected 3 stages and 1 person', v_count;
  end if;
  if (select actor_id from design_step_events where unit_id = v_villa order by seq limit 1) <> v_staff then
    raise exception 'TRIAL 2 FAILED: the history does not say who';
  end if;
  v_refused := false;
  begin
    perform design_set_where(v_villa, v_permit, array[v_staff]);
  exception when raise_exception then
    v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 2 FAILED: set where it is ran twice'; end if;

  -- 3. A send-back without a reason is refused; with one it is kept, in
  --    the history too, and cleared when the revision is done.
  v_refused := false;
  begin
    update design_steps set status = 'revising'
     where unit_id = v_villa and design_stage_id = v_design;
  exception when raise_exception then
    v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 3 FAILED: a send-back with no reason'; end if;
  update design_steps set status = 'revising', reason = 'Client changed the staircase'
   where unit_id = v_villa and design_stage_id = v_design;
  if (select reason from design_step_events
       where unit_id = v_villa and to_status = 'revising' order by seq desc limit 1)
     is distinct from 'Client changed the staircase' then
    raise exception 'TRIAL 3 FAILED: the history lost the reason';
  end if;
  update design_steps set status = 'done'
   where unit_id = v_villa and design_stage_id = v_design;
  if (select reason from design_steps where unit_id = v_villa and design_stage_id = v_design) is not null then
    raise exception 'TRIAL 3 FAILED: the reason outlived the revision';
  end if;

  -- 4. Pass WD to Structural with the colleague: WD Done, Structural
  --    Working, the colleague on it.
  perform design_pass_step(v_villa, v_wd, v_str, array[v_colleague], 'Slab levels from the consultant');
  if (select status from design_steps where unit_id = v_villa and design_stage_id = v_wd) <> 'done'
     or (select status from design_steps where unit_id = v_villa and design_stage_id = v_str) <> 'working' then
    raise exception 'TRIAL 4 FAILED: the pass did not move the stages';
  end if;
  select id into v_step from design_steps where unit_id = v_villa and design_stage_id = v_str;
  if not exists (select 1 from design_step_people where step_id = v_step and profile_id = v_colleague) then
    raise exception 'TRIAL 4 FAILED: the colleague is not on Structural';
  end if;
  v_refused := false;
  begin
    perform design_pass_step(v_other, v_wd, v_str, array[v_staff], null);
  exception when raise_exception then
    v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 4 FAILED: passed a stage that never started'; end if;

  -- 5. Nobody writes history by hand.
  v_refused := false;
  begin
    insert into design_step_events (step_id, unit_id, design_stage_id, kind, to_status, actor_id)
    values (v_step, v_villa, v_str, 'status', 'done', v_staff);
  exception when insufficient_privilege then
    v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 5 FAILED: a hand-written history line'; end if;
  update design_step_events set reason = 'tidied' where unit_id = v_villa;
  delete from design_step_events where unit_id = v_villa;
  select count(*) into v_count from design_step_events where unit_id = v_villa and reason = 'tidied';
  if v_count <> 0 or not exists (select 1 from design_step_events where unit_id = v_villa) then
    raise exception 'TRIAL 5 FAILED: the history was edited or deleted';
  end if;

  -- 6. A step is never deleted, never moved, and never on a stage off the board.
  delete from design_steps where id = v_step;
  if not exists (select 1 from design_steps where id = v_step) then
    raise exception 'TRIAL 6 FAILED: a step was deleted';
  end if;
  v_refused := false;
  begin
    update design_steps set unit_id = v_other where id = v_step;
  exception when raise_exception then
    v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 6 FAILED: a step moved villa'; end if;
  v_refused := false;
  begin
    insert into design_steps (unit_id, design_stage_id, status) values (v_villa, v_mep, 'working');
  exception when raise_exception then
    v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 6 FAILED: a step on a stage off the board'; end if;

  -- 7. Only the design team goes on a step; taking someone off is history too.
  v_refused := false;
  begin
    insert into design_step_people (step_id, profile_id) values (v_step, v_probe);
  exception when raise_exception then
    v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 7 FAILED: someone off the team went on a stage'; end if;
  delete from design_step_people where step_id = v_step and profile_id = v_colleague;
  if not exists (select 1 from design_step_events
                  where step_id = v_step and kind = 'person_removed' and person_id = v_colleague) then
    raise exception 'TRIAL 7 FAILED: taking someone off left no history';
  end if;

  -- 8. Actions: the owner is on the team; the owner marks finished and
  --    cannot close what someone else set; the setter closes it.
  v_refused := false;
  begin
    insert into design_actions (unit_id, action, owner_id) values (v_villa, 'Trial: to the probe', v_probe);
  exception when raise_exception then
    v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 8 FAILED: an action owned by someone off the team'; end if;
  insert into design_actions (unit_id, design_stage_id, action, owner_id, due_on)
  values (v_villa, v_design, 'Trial: send the revised plan', v_colleague, current_date)
  returning id into v_action;
  if (select created_by from design_actions where id = v_action) <> v_staff then
    raise exception 'TRIAL 8 FAILED: the setter was not pinned';
  end if;

  reset role;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_colleague, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_refused := false;
  begin
    update design_actions set status = 'done' where id = v_action;
  exception when raise_exception then
    v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 8 FAILED: the owner closed what someone else set'; end if;
  update design_actions set status = 'awaiting_confirmation' where id = v_action;

  reset role;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update design_actions set status = 'done' where id = v_action;
  if (select done_on from design_actions where id = v_action) is null then
    raise exception 'TRIAL 8 FAILED: done without its date';
  end if;
  delete from design_actions where id = v_action;
  if not exists (select 1 from design_actions where id = v_action) then
    raise exception 'TRIAL 8 FAILED: an action was deleted';
  end if;
  v_refused := false;
  begin
    update design_actions set created_by = v_colleague where id = v_action;
  exception when raise_exception then
    v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 8 FAILED: the setter changed'; end if;

  -- 9. Someone without /design-management (a supervisor) sees none of it,
  --    adds nothing, and is refused the team and the moves.
  reset role;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_probe, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_count from design_steps;
  if v_count <> 0 then raise exception 'TRIAL 9 FAILED: a supervisor sees % steps', v_count; end if;
  select count(*) into v_count from design_step_events;
  if v_count <> 0 then raise exception 'TRIAL 9 FAILED: a supervisor sees history'; end if;
  select count(*) into v_count from design_actions;
  if v_count <> 0 then raise exception 'TRIAL 9 FAILED: a supervisor sees actions'; end if;
  v_refused := false;
  begin
    insert into design_steps (unit_id, design_stage_id) values (v_other, v_design);
  exception when insufficient_privilege then
    v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 9 FAILED: a supervisor started a stage'; end if;
  v_refused := false;
  begin
    perform 1 from design_team();
  exception when raise_exception then
    v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 9 FAILED: a supervisor read the team'; end if;
  v_refused := false;
  begin
    perform design_set_where(v_other, v_design, array[]::uuid[]);
  exception when raise_exception then
    v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 9 FAILED: a supervisor moved a villa'; end if;

  -- 10. An admin closes anyone's action and reopens it.
  reset role;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update design_actions set status = 'open' where id = v_action;
  if (select status from design_actions where id = v_action) <> 'open'
     or (select done_on from design_actions where id = v_action) is not null then
    raise exception 'TRIAL 10 FAILED: an admin could not reopen an action';
  end if;

  reset role;
  raise exception 'ALL TRIALS PASSED';
end $trial$;
