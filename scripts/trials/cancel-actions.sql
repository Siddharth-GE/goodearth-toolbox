-- Behaviour trial for 0149 — deleting an untouched action, cancelling a changed one, in Client Relations and Design
-- Management. Runs inside the dry-run transaction; always rolled back, UNDER ROW-LEVEL SECURITY (BUGCATCHER #19), as the
-- staff account holding both tools, neither as lead nor admin.
--
--   npx tsx scripts/dry-run-migrations.ts --project ipstebqawrvhkyntctrv \
--     supabase/migrations/0149_*.sql --trial scripts/trials/cancel-actions.sql
do $trial$
declare
  v_user uuid := (select id from auth.users where email = 'siddharth.cyriac.99@gmail.com');
  s_user uuid := gen_random_uuid();
  v_other uuid := (select id from auth.users where email = 'siddharth.cyriac.99+probe@gmail.com');
  v_plot uuid;
  c_plot_open uuid;
  c_plot_cancelled uuid;
  c_led uuid;
  d_theirs_fresh uuid;
  c_fresh uuid;
  c_changed uuid;
  c_theirs uuid;
  c_done uuid;
  d_fresh uuid;
  d_changed uuid;
  d_theirs uuid;
  v_text text;
begin
  select e.id into v_plot from client_engagements e join units u on u.id = e.unit_id
   where u.client_id is not null order by u.code limit 1;
  if v_user is null or v_other is null or v_plot is null then
    raise exception 'TRIAL SETUP: staging is missing the staff account, the probe or a sold plot';
  end if;

  update profiles set role_id = null, role = 'staff' where id in (v_user, v_other);
  delete from user_apps where user_id in (v_user, v_other);
  delete from tool_leads where user_id in (v_user, v_other);
  insert into user_apps (user_id, app)
  values (v_user, '/client-relations'), (v_user, '/design-management'),
         (v_other, '/client-relations'), (v_other, '/design-management');

  -- A plot whose Construction side is the staff account's, with an open step and a cancelled one on it.
  update client_engagements set crm_owner_id = v_user where id = v_plot;
  insert into client_actions (engagement_id, action, owner_id, created_by, track)
  values (v_plot, 'Trial 0149 plot open', v_user, v_user, 'sales') returning id into c_plot_open;
  insert into client_actions (engagement_id, action, owner_id, created_by, track)
  values (v_plot, 'Trial 0149 plot cancelled', v_user, v_user, 'sales') returning id into c_plot_cancelled;
  update client_actions set cancelled_at = now(), cancel_reason = 'Trial', status = 'done', done_on = current_date
   where id = c_plot_cancelled;
  -- The probe's own action, which a lead sees; and a fresh design action the probe set for the staff account.
  insert into client_actions (action, owner_id, created_by) values ('Trial 0149 led', v_other, v_other)
  returning id into c_led;
  insert into design_actions (action, owner_id, created_by) values ('Trial 0149 theirs fresh', v_user, v_other)
  returning id into d_theirs_fresh;

  -- Setup as a script (no session): general actions owned by the staff account, set by it or by someone else.
  insert into client_actions (action, owner_id, created_by) values ('Trial 0149 fresh', v_user, v_user)
  returning id into c_fresh;
  insert into client_actions (action, owner_id, created_by) values ('Trial 0149 changed', v_user, v_user)
  returning id into c_changed;
  insert into client_actions (action, owner_id, created_by) values ('Trial 0149 theirs', v_user, v_other)
  returning id into c_theirs;
  insert into client_actions (action, owner_id, created_by, status, done_on)
  values ('Trial 0149 done', v_user, v_user, 'done', current_date) returning id into c_done;
  insert into design_actions (action, owner_id, created_by) values ('Trial 0149 fresh', v_user, v_user)
  returning id into d_fresh;
  insert into design_actions (action, owner_id, created_by) values ('Trial 0149 changed', v_user, v_user)
  returning id into d_changed;
  insert into design_actions (action, owner_id, created_by) values ('Trial 0149 theirs', v_user, v_other)
  returning id into d_theirs;
  -- Made five minutes ago and changed now: set_updated_at stamps the update.
  update client_actions set created_at = now() - interval '5 minutes' where id in (c_changed, c_theirs, c_done);
  update design_actions set created_at = now() - interval '5 minutes' where id in (d_changed, d_theirs);

  insert into auth_verified_sessions (session_id, user_id, method) values (s_user, v_user, 'otp');
  perform set_config('request.jwt.claims', json_build_object('sub', v_user,
    'role', 'authenticated', 'session_id', s_user)::text, true);
  set local role authenticated;

  -- 0. Nothing arrives already cancelled.
  v_text := null;
  begin
    insert into client_actions (action, owner_id, cancelled_at, cancel_reason)
    values ('Born cancelled', v_user, now(), 'Born cancelled');
  exception when others then v_text := sqlerrm;
  end;
  if v_text is distinct from 'A new action cannot arrive cancelled' then
    raise exception 'TRIAL 0a FAILED: a client action born cancelled gave %', coalesce(v_text, 'no refusal');
  end if;
  v_text := null;
  begin
    insert into design_actions (action, owner_id, cancel_reason) values ('Born cancelled', v_user, 'Born cancelled');
  exception when others then v_text := sqlerrm;
  end;
  if v_text is distinct from 'A new action cannot arrive cancelled' then
    raise exception 'TRIAL 0b FAILED: a design action born cancelled gave %', coalesce(v_text, 'no refusal');
  end if;

  -- 1. Untouched and set by me: it deletes.
  delete from client_actions where id = c_fresh;
  delete from design_actions where id = d_fresh;
  reset role;
  if exists (select 1 from client_actions where id = c_fresh) or exists (select 1 from design_actions where id = d_fresh) then
    raise exception 'TRIAL 1 FAILED: the setter could not delete an untouched action';
  end if;
  set local role authenticated;

  -- 2. Changed since it was added: delete is refused with the way forward.
  v_text := null;
  begin
    delete from client_actions where id = c_changed;
  exception when others then v_text := sqlerrm;
  end;
  if v_text is distinct from 'This action has been changed since it was added, so cancel it with a reason instead' then
    raise exception 'TRIAL 2a FAILED: deleting a changed client action gave %', coalesce(v_text, 'no refusal');
  end if;
  v_text := null;
  begin
    delete from design_actions where id = d_changed;
  exception when others then v_text := sqlerrm;
  end;
  if v_text is distinct from 'This action has been changed since it was added, so cancel it with a reason instead' then
    raise exception 'TRIAL 2b FAILED: deleting a changed design action gave %', coalesce(v_text, 'no refusal');
  end if;

  -- 3. Its owner, not its setter, can neither delete nor cancel it.
  v_text := null;
  begin
    delete from client_actions where id = c_theirs;
  exception when others then v_text := sqlerrm;
  end;
  if v_text is distinct from 'Only whoever set this action, or a manager, can delete it' then
    raise exception 'TRIAL 3a FAILED: an owner deleting a colleague''s action gave %', coalesce(v_text, 'no refusal');
  end if;
  v_text := null;
  begin
    update client_actions set cancel_reason = 'Not needed' where id = c_theirs;
  exception when others then v_text := sqlerrm;
  end;
  if v_text is distinct from 'Only whoever set this action, or a manager, can cancel it' then
    raise exception 'TRIAL 3b FAILED: an owner cancelling a colleague''s action gave %', coalesce(v_text, 'no refusal');
  end if;
  v_text := null;
  begin
    update design_actions set cancel_reason = 'Not needed' where id = d_theirs;
  exception when others then v_text := sqlerrm;
  end;
  if v_text is distinct from 'Only whoever set this action, or a manager, can cancel it' then
    raise exception 'TRIAL 3c FAILED: an owner cancelling a colleague''s design action gave %', coalesce(v_text, 'no refusal');
  end if;

  -- 4. A cancel needs a reason, comes alone, and a done action has nothing to cancel.
  v_text := null;
  begin
    update client_actions set cancel_reason = '  ' where id = c_changed;
  exception when others then v_text := sqlerrm;
  end;
  if v_text is distinct from 'Say why it is cancelled' then
    raise exception 'TRIAL 4a FAILED: a cancel with no reason gave %', coalesce(v_text, 'no refusal');
  end if;
  v_text := null;
  begin
    update client_actions set cancel_reason = 'Not needed', action = 'Sneaked in' where id = c_changed;
  exception when others then v_text := sqlerrm;
  end;
  if v_text is distinct from 'Cancel an action on its own, with nothing else changed' then
    raise exception 'TRIAL 4b FAILED: a cancel with an edit gave %', coalesce(v_text, 'no refusal');
  end if;
  v_text := null;
  begin
    update client_actions set cancel_reason = 'Not needed' where id = c_done;
  exception when others then v_text := sqlerrm;
  end;
  if v_text is distinct from 'A done action is already closed, so there is nothing to cancel' then
    raise exception 'TRIAL 4c FAILED: cancelling a done action gave %', coalesce(v_text, 'no refusal');
  end if;

  -- 5. The setter cancels: closed, stamped by the database, off every open list.
  update client_actions set cancel_reason = ' Client changed plans ', cancelled_at = '2020-01-01', cancelled_by = v_other
   where id = c_changed;
  update design_actions set cancel_reason = 'Duplicate' where id = d_changed;
  if (select (status, done_on, cancelled_by, cancel_reason, cancelled_at > now() - interval '1 minute')
        from client_actions where id = c_changed)
     is distinct from ('done'::text, (now() at time zone 'Asia/Kolkata')::date, v_user, 'Client changed plans'::text, true) then
    raise exception 'TRIAL 5a FAILED: the client cancel was not closed and stamped by the database';
  end if;
  if (select (status, done_on is not null, cancelled_by) from design_actions where id = d_changed)
     is distinct from ('done'::text, true, v_user) then
    raise exception 'TRIAL 5b FAILED: the design cancel was not closed and stamped by the database';
  end if;
  if exists (select 1 from client_actions where id = c_changed and status <> 'done')
     or exists (select 1 from design_actions where id = d_changed and status <> 'done') then
    raise exception 'TRIAL 5c FAILED: a cancelled action is still open';
  end if;

  -- 6. Cancelled is final: no reopen, no edit, no delete.
  v_text := null;
  begin
    update client_actions set status = 'open' where id = c_changed;
  exception when others then v_text := sqlerrm;
  end;
  if v_text is distinct from 'A cancelled action can no longer be changed' then
    raise exception 'TRIAL 6a FAILED: reopening a cancelled action gave %', coalesce(v_text, 'no refusal');
  end if;
  v_text := null;
  begin
    update design_actions set notes = 'After all' where id = d_changed;
  exception when others then v_text := sqlerrm;
  end;
  if v_text is distinct from 'A cancelled action can no longer be changed' then
    raise exception 'TRIAL 6b FAILED: editing a cancelled design action gave %', coalesce(v_text, 'no refusal');
  end if;
  v_text := null;
  begin
    delete from client_actions where id = c_changed;
  exception when others then v_text := sqlerrm;
  end;
  if v_text is distinct from 'This action has been changed since it was added, so cancel it with a reason instead' then
    raise exception 'TRIAL 6c FAILED: deleting a cancelled action gave %', coalesce(v_text, 'no refusal');
  end if;

  -- 7. Closing and reopening still follow 0121's rule for an ordinary action.
  update client_actions set status = 'open', done_on = null where id = c_done;
  reset role;
  if (select status from client_actions where id = c_done) <> 'open' then
    raise exception 'TRIAL 7 FAILED: the setter could not reopen a done action';
  end if;
  set local role authenticated;

  -- 8. Untouched is not enough: a design action someone else set is theirs to delete.
  v_text := null;
  begin
    delete from design_actions where id = d_theirs_fresh;
  exception when others then v_text := sqlerrm;
  end;
  if v_text is distinct from 'Only whoever set this action, or a manager, can delete it' then
    raise exception 'TRIAL 8 FAILED: deleting a colleague''s fresh design action gave %', coalesce(v_text, 'no refusal');
  end if;

  -- 9. Handing the plot's side over moves the open step and leaves the cancelled one as it was.
  update client_engagements set crm_owner_id = v_other where id = v_plot;
  reset role;
  if (select owner_id from client_actions where id = c_plot_open) is distinct from v_other
     or (select (owner_id, status, cancel_reason) from client_actions where id = c_plot_cancelled)
        is distinct from (v_user, 'done'::text, 'Trial'::text) then
    raise exception 'TRIAL 9 FAILED: a hand-over moved a cancelled step or left the open one behind';
  end if;

  -- 10. A team lead sees the probe's action, and still neither deletes nor cancels it.
  insert into tool_leads (user_id, app) values (v_user, '/client-relations');
  set local role authenticated;
  if not exists (select 1 from client_actions where id = c_led) then
    raise exception 'TRIAL 10 SETUP: the lead cannot see the probe''s action';
  end if;
  v_text := null;
  begin
    delete from client_actions where id = c_led;
  exception when others then v_text := sqlerrm;
  end;
  if v_text is distinct from 'Only whoever set this action, or a manager, can delete it' then
    raise exception 'TRIAL 10a FAILED: a lead deleting a colleague''s action gave %', coalesce(v_text, 'no refusal');
  end if;
  v_text := null;
  begin
    update client_actions set cancel_reason = 'Not needed' where id = c_led;
  exception when others then v_text := sqlerrm;
  end;
  if v_text is distinct from 'Only whoever set this action, or a manager, can cancel it' then
    raise exception 'TRIAL 10b FAILED: a lead cancelling a colleague''s action gave %', coalesce(v_text, 'no refusal');
  end if;
  reset role;

  raise notice 'TRIAL 0149 OK — untouched actions delete, changed ones cancel with a reason, by their setter, and cancelled is final';
end $trial$;
