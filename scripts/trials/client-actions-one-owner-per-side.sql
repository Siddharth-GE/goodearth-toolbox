-- Behaviour trial for 0125 — one owner per side, and every open step on it
-- is theirs. Runs inside the dry-run transaction; always rolled back.
--
-- Under row-level security (set local role authenticated) as the staff
-- Siddharth account (the gmail one) holding /client-relations alone, the
-- Construction owner of one plot; the probe holds it too. A trial run as the
-- database owner proves no trigger's refusal (BUGCATCHER #19).
--
--   npx tsx scripts/dry-run-migrations.ts --project ipstebqawrvhkyntctrv \
--     supabase/migrations/0125_*.sql --trial scripts/trials/client-actions-one-owner-per-side.sql
do $trial$
declare
  v_staff uuid := (select id from auth.users where email = 'siddharth.cyriac.99@gmail.com');
  v_probe uuid := (select id from auth.users where email = 'siddharth.cyriac.99+probe@gmail.com');
  p1 uuid;
  v_s1 uuid;
  v_s2 uuid;
  v_k1 uuid;
  v_g uuid;
  v_owner uuid;
  v_refused boolean;
  v_message text;
begin
  if v_staff is null or v_probe is null then
    raise exception 'TRIAL SETUP: the staff or probe account is missing on staging';
  end if;
  select e.id into p1
    from client_engagements e join units u on u.id = e.unit_id
    join projects p on p.id = e.project_id
   where p.name = 'Saarang - Villas' and u.client_id is not null
   order by u.code limit 1;

  -- Staff owns p1's Construction side; its Interior side has no owner.
  update profiles set role_id = null where id in (v_staff, v_probe);
  delete from user_apps where user_id in (v_staff, v_probe);
  delete from tool_leads where user_id in (v_staff, v_probe);
  insert into user_apps (user_id, app) values (v_staff, '/client-relations'), (v_probe, '/client-relations');
  update client_engagements set crm_owner_id = v_staff, kaadal_owner_id = null where id = p1;
  if exists (select 1 from client_actions
    where engagement_id = p1 and track = 'sales' and status <> 'done' and owner_id <> v_staff) then
    raise exception 'TRIAL SETUP: handing p1''s construction side to staff did not move its open steps';
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- 1. A construction step on p1 is the Construction owner's, and no one else's.
  v_refused := false;
  begin
    insert into client_actions (engagement_id, action, owner_id, track)
    values (p1, 'Trial: for the probe', v_probe, 'sales');
  exception when raise_exception then
    v_refused := true; v_message := sqlerrm;
  end;
  if not v_refused then raise exception 'TRIAL 1 FAILED: a construction step went to someone other than its owner'; end if;
  if v_message not like 'Every construction step on this plot is %' then
    raise exception 'TRIAL 1 FAILED: the refusal said "%"', v_message;
  end if;
  insert into client_actions (engagement_id, action, owner_id, track)
  values (p1, 'Trial: collect the slab payment', v_staff, 'sales') returning id into v_s1;

  -- 2. A side with no owner refuses a step until it has one.
  v_refused := false;
  begin
    insert into client_actions (engagement_id, action, owner_id, track)
    values (p1, 'Trial: pitch the interiors', v_staff, 'kaadal');
  exception when raise_exception then
    v_refused := true; v_message := sqlerrm;
  end;
  if not v_refused or v_message not like 'This plot has no interior owner yet%' then
    raise exception 'TRIAL 2 FAILED: a step landed on a side with no owner (%)', v_message;
  end if;
  update client_engagements set kaadal_owner_id = v_probe where id = p1;
  insert into client_actions (engagement_id, action, owner_id, track)
  values (p1, 'Trial: pitch the interiors', v_probe, 'kaadal') returning id into v_k1;

  -- 3. A step's owner is locked to its side's.
  v_refused := false;
  begin
    update client_actions set owner_id = v_staff where id = v_k1;
  exception when raise_exception then
    v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 3 FAILED: an interior step was given to someone other than its owner'; end if;

  -- 4. Moved to the other side, a step goes to that side's owner.
  update client_actions set track = 'kaadal' where id = v_s1;
  reset role;
  select owner_id into v_owner from client_actions where id = v_s1;
  if v_owner is distinct from v_probe then
    raise exception 'TRIAL 4 FAILED: a step moved to Interior did not go to the Interior owner';
  end if;

  -- 5. Handing a side over moves its open steps; a closed one keeps its owner.
  set local role authenticated;
  update client_actions set status = 'done', done_on = current_date where id = v_s1;
  update client_engagements set kaadal_owner_id = v_staff where id = p1;
  reset role;
  select owner_id into v_owner from client_actions where id = v_k1;
  if v_owner is distinct from v_staff then
    raise exception 'TRIAL 5 FAILED: the interior hand-over left an open step with the old owner';
  end if;
  select owner_id into v_owner from client_actions where id = v_s1;
  if v_owner is distinct from v_probe then
    raise exception 'TRIAL 5 FAILED: the hand-over rewrote a closed step''s history';
  end if;

  -- 6. Opened again, a step goes to its side's owner now.
  set local role authenticated;
  update client_actions set status = 'open', done_on = null where id = v_s1;
  reset role;
  select owner_id into v_owner from client_actions where id = v_s1;
  if v_owner is distinct from v_staff then
    raise exception 'TRIAL 6 FAILED: a reopened step stayed with the side''s old owner';
  end if;

  -- 7. A side with open steps cannot be left with nobody.
  set local role authenticated;
  insert into client_actions (engagement_id, action, owner_id, track)
  values (p1, 'Trial: book the registration', v_staff, 'sales') returning id into v_s2;
  v_refused := false;
  begin
    update client_engagements set crm_owner_id = null where id = p1;
  exception when raise_exception then
    v_refused := true; v_message := sqlerrm;
  end;
  if not v_refused or v_message not like 'This plot still has open construction steps%' then
    raise exception 'TRIAL 7 FAILED: a side with open steps was left with nobody (%)', v_message;
  end if;

  -- 8. A step with no plot still goes to anyone on the team.
  insert into client_actions (engagement_id, action, owner_id, track)
  values (null, 'Trial: call the bank', v_probe, 'kaadal') returning id into v_g;
  if v_g is null then raise exception 'TRIAL 8 FAILED: a step with no plot was refused'; end if;

  -- 9. Rewording and re-dating never meet the rule.
  update client_actions set action = 'Trial: book the registration (Monday)', due_on = current_date + 3
   where id = v_s2;
  if not found then raise exception 'TRIAL 9 FAILED: a plain edit was refused'; end if;

  raise exception 'ALL TRIALS PASSED — 0125: one owner per side, its steps follow it, no side left with nobody';
end $trial$;
