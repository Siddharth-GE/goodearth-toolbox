-- Behaviour trial for 0122 + 0123 — in Client Relations each person sees
-- the work assigned to them; admins and team leads see everyone's. Runs
-- inside the dry-run transaction; always rolled back.
--
-- Under row-level security (set local role authenticated) as two people
-- holding /client-relations alone — the staff Siddharth account (the gmail
-- one) and the probe — then the staff account as a team lead, and the
-- founder's admin login. A trial run as the database owner proves no
-- policy (BUGCATCHER #19).
--
--   npx tsx scripts/dry-run-migrations.ts --project ipstebqawrvhkyntctrv \
--     supabase/migrations/0122_*.sql supabase/migrations/0123_*.sql \
--     --trial scripts/trials/client-relations-scope.sql
do $trial$
declare
  v_staff uuid := (select id from auth.users where email = 'siddharth.cyriac.99@gmail.com');
  v_probe uuid := (select id from auth.users where email = 'siddharth.cyriac.99+probe@gmail.com');
  v_admin uuid := (select id from auth.users where email = 'siddharth@goodearthkannur.org');
  v_plots uuid[];
  p1 uuid; p2 uuid; p3 uuid; p4 uuid; p5 uuid;
  u3 uuid; u5 uuid;
  v_client uuid;
  v_total int;
  v_total_actions int;
  v_total_milestones int;
  v_others uuid;
  v_x uuid;
  v_y uuid;
  v_a0 uuid;
  v_n int;
  v_refused boolean;
begin
  if v_staff is null or v_probe is null or v_admin is null then
    raise exception 'TRIAL SETUP: the staff, probe or admin account is missing on staging';
  end if;

  -- Four sold Saarang plots and one unsold plot nobody owns.
  v_plots := array(
    select e.id from client_engagements e
      join units u on u.id = e.unit_id
      join projects p on p.id = e.project_id
     where p.name = 'Saarang - Villas' and u.client_id is not null
     order by u.code limit 4);
  if coalesce(array_length(v_plots, 1), 0) < 4 then
    raise exception 'TRIAL SETUP: fewer than four sold Saarang plots';
  end if;
  p1 := v_plots[1]; p2 := v_plots[2]; p3 := v_plots[3]; p4 := v_plots[4];
  select unit_id into u3 from client_engagements where id = p3;
  select e.id, u.id into p5, u5
    from client_engagements e join units u on u.id = e.unit_id
   where u.client_id is null and e.crm_owner_id is null and e.kaadal_owner_id is null
   order by u.code limit 1;
  select id into v_client from clients where is_active and crm_owner_id is null order by name limit 1;
  if p5 is null or v_client is null then
    raise exception 'TRIAL SETUP: no unsold, unowned plot or no client without a handler';
  end if;

  -- The two members hold Client Relations alone, own nothing and lead
  -- nothing; then staff owns p1 and p4, the probe p2, and p3 is nobody's.
  update profiles set role_id = null where id in (v_staff, v_probe);
  delete from user_apps where user_id in (v_staff, v_probe);
  delete from tool_leads where user_id in (v_staff, v_probe);
  insert into user_apps (user_id, app) values (v_staff, '/client-relations'), (v_probe, '/client-relations');
  update client_engagements set crm_owner_id = null where crm_owner_id in (v_staff, v_probe);
  update client_engagements set kaadal_owner_id = null where kaadal_owner_id in (v_staff, v_probe);
  update client_engagements set crm_owner_id = v_staff, kaadal_owner_id = null where id in (p1, p4);
  update client_engagements set crm_owner_id = v_probe, kaadal_owner_id = null where id = p2;
  update client_engagements set crm_owner_id = null, kaadal_owner_id = null where id = p3;
  if exists (select 1 from client_actions
    where v_staff in (owner_id, created_by) or v_probe in (owner_id, created_by)) then
    raise exception 'TRIAL SETUP: the staff or probe account already holds actions';
  end if;
  -- Script inserts pin the owner as setter (0121): one of staff's own on
  -- p1 the probe must not see, and one on p2 that lets staff see p2.
  insert into client_actions (engagement_id, action, owner_id)
  values (p1, 'Trial: staff''s own step', v_staff) returning id into v_others;
  insert into client_actions (engagement_id, action, owner_id)
  values (p2, 'Trial: staff helps on the probe''s plot', v_staff) returning id into v_a0;

  select count(*) into v_total from client_engagements;
  select count(*) into v_total_actions from client_actions;
  select count(*) into v_total_milestones from client_payment_milestones;

  -- 1. A member sees their own plots and what hangs off them — nothing else.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_n from client_engagements;
  if v_n <> 3 then
    raise exception 'TRIAL 1 FAILED: staff sees % plots, expected 3 (p1, p4, and p2 through its action)', v_n;
  end if;
  select count(*) into v_n from client_engagements where id = p3;
  if v_n <> 0 then raise exception 'TRIAL 1 FAILED: a member sees a plot nobody owns'; end if;
  select count(*) into v_n from client_payment_milestones where engagement_id = p3;
  if v_n <> 0 then raise exception 'TRIAL 1 FAILED: a member sees another plot''s payment schedule'; end if;
  select count(*) into v_n from client_payment_milestones where engagement_id = p1;
  if v_n = 0 then raise exception 'TRIAL 1 FAILED: a member cannot see their own plot''s schedule'; end if;
  select count(*) into v_n from client_actions where engagement_id = p3;
  if v_n <> 0 then raise exception 'TRIAL 1 FAILED: a member sees actions on a plot that is not theirs'; end if;
  select count(*) into v_n from crm_milestone_facts;
  if v_n <> 0 then raise exception 'TRIAL 1 FAILED: a member reads every plot''s payments through a fact view'; end if;
  select count(*) into v_n from crm_receipt_facts;
  if v_n <> 0 then raise exception 'TRIAL 1 FAILED: a member reads every receipt through a fact view'; end if;

  v_refused := false;
  begin
    insert into client_actions (engagement_id, action, owner_id) values (p3, 'Trial: a look in', v_staff);
  exception when insufficient_privilege then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 1 FAILED: a member hung an action on a plot they cannot see'; end if;
  v_refused := false;
  begin
    insert into client_receipts (engagement_id, amount, received_on, mode) values (p3, 1, current_date, 'cash');
  exception when insufficient_privilege then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 1 FAILED: a member recorded money on a plot they cannot see'; end if;
  update client_engagements set details = 'Trial' where id = p3;
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'TRIAL 1 FAILED: a member changed a plot they cannot see'; end if;
  v_refused := false;
  begin
    perform crm_assign_unit(u3, v_client, 'sold');
  exception when raise_exception then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 1 FAILED: a member changed the buyer of a plot they cannot see'; end if;
  v_refused := false;
  begin
    perform crm_release_unit(u3);
  exception when raise_exception then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 1 FAILED: a member released a plot they cannot see'; end if;

  -- Staff sets a step for the probe on p1 — and gets it back (RETURNING).
  insert into client_actions (engagement_id, action, owner_id)
  values (p1, 'Trial: send the brochure', v_probe) returning id into v_x;
  if v_x is null then raise exception 'TRIAL 1 FAILED: the setter could not read back what they set'; end if;

  -- 2. The probe sees its own plot, and p1 through the step it owns there —
  --    but not staff's other steps on p1. Handing its step on is allowed,
  --    and takes p1 out of its sight.
  reset role;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_probe, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_n from client_engagements where id in (p1, p2);
  if v_n <> 2 then raise exception 'TRIAL 2 FAILED: the probe sees % of its plot and p1, expected 2', v_n; end if;
  select count(*) into v_n from client_engagements where id in (p3, p4);
  if v_n <> 0 then raise exception 'TRIAL 2 FAILED: the probe sees plots that are not its'; end if;
  select count(*) into v_n from client_actions where id = v_others;
  if v_n <> 0 then raise exception 'TRIAL 2 FAILED: owning one step on a plot showed another''s'; end if;
  select count(*) into v_n from client_actions where id = v_a0;
  if v_n <> 1 then raise exception 'TRIAL 2 FAILED: a plot''s owner cannot see a step on it'; end if;
  update client_actions set owner_id = v_staff where id = v_x;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'TRIAL 2 FAILED: the owner could not hand a step on'; end if;
  select count(*) into v_n from client_engagements where id = p1;
  if v_n <> 0 then raise exception 'TRIAL 2 FAILED: p1 stayed in sight after its step was handed on'; end if;

  -- 3. A setter who sees a plot only while their step is open can still
  --    close it and take that back (Undo) — and cannot move it elsewhere.
  reset role;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into client_actions (engagement_id, action, owner_id)
  values (p2, 'Trial: share the 3D', v_probe) returning id into v_y;
  update client_actions set status = 'done', done_on = current_date where id = v_a0;
  update client_actions set status = 'done', done_on = current_date where id = v_y;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'TRIAL 3 FAILED: the setter could not close the step'; end if;
  select count(*) into v_n from client_engagements where id = p2;
  if v_n <> 0 then raise exception 'TRIAL 3 FAILED: p2 stayed in sight with nothing open there'; end if;
  update client_actions set status = 'open', done_on = null where id = v_y;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'TRIAL 3 FAILED: the setter could not undo closing it'; end if;
  v_refused := false;
  begin
    update client_actions set engagement_id = p3 where id = v_y;
  exception when insufficient_privilege then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 3 FAILED: a step was moved onto a plot its setter cannot see'; end if;

  -- 4. Handing a plot on: it leaves the giver's sight and reaches the taker's.
  update client_engagements set crm_owner_id = v_probe where id = p4;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'TRIAL 4 FAILED: the owner could not hand the plot on'; end if;
  select count(*) into v_n from client_engagements where id = p4;
  if v_n <> 0 then raise exception 'TRIAL 4 FAILED: the plot stayed with the giver'; end if;

  -- 5. Selling an unsold plot: anyone on the team may, and it becomes theirs.
  reset role;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_probe, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_n from client_engagements where id in (p4, p5);
  if v_n <> 1 then raise exception 'TRIAL 5 FAILED: the probe sees % of the handed plot and the unsold one, expected 1', v_n; end if;
  perform crm_assign_unit(u5, v_client, 'reserved');
  select count(*) into v_n from client_engagements where id = p5 and crm_owner_id = v_probe;
  if v_n <> 1 then raise exception 'TRIAL 5 FAILED: a plot the probe sold did not become its'; end if;

  -- 6. A team lead sees everything — but not the money views, which are
  --    Reporter's and Financial Management's. A lead row without the grant
  --    gives nothing.
  reset role;
  insert into tool_leads (user_id, app) values (v_staff, '/client-relations'), (v_probe, '/client-relations');
  delete from user_apps where user_id = v_probe;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if not is_lead('/client-relations') then raise exception 'TRIAL 6 FAILED: a ticked lead is not a lead'; end if;
  select count(*) into v_n from client_engagements;
  if v_n <> v_total then raise exception 'TRIAL 6 FAILED: a lead sees % of % plots', v_n, v_total; end if;
  select count(*) into v_n from client_actions;
  if v_n < v_total_actions then raise exception 'TRIAL 6 FAILED: a lead sees % of % actions', v_n, v_total_actions; end if;
  select count(*) into v_n from crm_milestone_facts;
  if v_n <> 0 then raise exception 'TRIAL 6 FAILED: a CRM lead reads the money views'; end if;
  reset role;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_probe, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if is_lead('/client-relations') then raise exception 'TRIAL 6 FAILED: a lead row without the grant made a lead'; end if;
  select count(*) into v_n from client_engagements;
  if v_n <> 0 then raise exception 'TRIAL 6 FAILED: someone without the grant sees % plots', v_n; end if;
  v_refused := false;
  begin
    insert into tool_leads (user_id, app) values (v_probe, '/estimator');
  exception when insufficient_privilege then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 6 FAILED: a member made themselves a lead'; end if;

  -- 7. An admin sees every plot, and every plot's money.
  reset role;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_n from client_engagements;
  if v_n <> v_total then raise exception 'TRIAL 7 FAILED: the admin sees % of % plots', v_n, v_total; end if;
  select count(*) into v_n from crm_milestone_facts;
  if v_n <> v_total_milestones then
    raise exception 'TRIAL 7 FAILED: the admin reads % of % milestones', v_n, v_total_milestones;
  end if;

  raise exception 'ALL TRIALS PASSED — 0122/0123: members see their own, leads and admins see all, hand-overs and Undo work';
end $trial$;
