-- Behaviour trial for 0148 — cancelling a client receipt, a funding movement, a Birdwing receipt and a settlement.
-- Runs inside the dry-run transaction; always rolled back, UNDER ROW-LEVEL SECURITY (BUGCATCHER #19), as the staff
-- account holding each tool, first without and then with a team-lead row.
--
--   npx tsx scripts/dry-run-migrations.ts --project ipstebqawrvhkyntctrv \
--     supabase/migrations/0148_*.sql --trial scripts/trials/cancel-money-in.sql
do $trial$
declare
  v_user uuid := (select id from auth.users where email = 'siddharth.cyriac.99@gmail.com');
  s_user uuid := gen_random_uuid();
  v_engagement uuid;
  v_project uuid;
  v_receipt uuid;
  v_facility uuid;
  v_movement uuid;
  v_stay uuid;
  v_bw_receipt uuid;
  v_settlement uuid;
  v_text text;
  v_n numeric;
  v_before numeric;
begin
  select e.id, e.project_id into v_engagement, v_project from client_engagements e order by e.id limit 1;
  select r.stay_id, r.id into v_stay, v_bw_receipt from birdwing_receipts r order by r.amount desc, r.id limit 1;
  if v_user is null or v_engagement is null or v_stay is null then
    raise exception 'TRIAL SETUP: staging is missing the staff account, a client engagement or a Birdwing receipt';
  end if;

  insert into auth_verified_sessions (session_id, user_id, method) values (s_user, v_user, 'otp');
  update profiles set role_id = null, role = 'staff' where id = v_user;
  delete from user_apps where user_id = v_user;
  delete from tool_leads where user_id = v_user;
  insert into user_apps (user_id, app)
  values (v_user, '/client-relations'), (v_user, '/financial-management'), (v_user, '/birdwing'), (v_user, '/reporter');
  perform set_config('request.jwt.claims', json_build_object('sub', v_user,
    'role', 'authenticated', 'session_id', s_user)::text, true);

  -- Setup as the owner: a receipt of 5,000 on a plot, a facility with a drawdown, a write-off on a Birdwing stay.
  insert into client_receipts (engagement_id, amount, received_on, mode, reference)
  values (v_engagement, 5000, current_date, 'bank', 'TRIAL-0148') returning id into v_receipt;
  insert into funding_facilities (party, kind) values ('Trial 0148 lender', 'bank_loan') returning id into v_facility;
  insert into funding_movements (facility_id, kind, amount, happened_on)
  values (v_facility, 'drawdown', 100000, current_date) returning id into v_movement;
  insert into birdwing_cross_charges (stay_id, kind, amount, charged_month, note)
  values (v_stay, 'write_off', 1, date_trunc('month', current_date)::date, 'Trial 0148') returning id into v_settlement;
  set local role authenticated;

  -- 1. Nobody deletes money any more.
  delete from client_receipts where id = v_receipt;
  delete from funding_movements where id = v_movement;
  delete from birdwing_receipts where id = v_bw_receipt;
  delete from birdwing_cross_charges where id = v_settlement;
  reset role;
  if (select count(*) from client_receipts where id = v_receipt) + (select count(*) from funding_movements where id = v_movement)
     + (select count(*) from birdwing_receipts where id = v_bw_receipt)
     + (select count(*) from birdwing_cross_charges where id = v_settlement) <> 4 then
    raise exception 'TRIAL 1 FAILED: a money row was deleted under RLS';
  end if;
  set local role authenticated;

  -- 2. A holder who is not a lead cannot cancel: the guard refuses a movement; Birdwing's policy admits no update.
  v_text := null;
  begin
    update funding_movements set cancel_reason = 'Typed twice' where id = v_movement;
  exception when others then v_text := sqlerrm;
  end;
  if v_text is distinct from 'Only an admin or the tool''s team lead can cancel a movement' then
    raise exception 'TRIAL 2a FAILED: a non-lead cancelling a movement gave %', coalesce(v_text, 'no refusal');
  end if;
  update birdwing_receipts set cancel_reason = 'Typed twice' where id = v_bw_receipt;
  if (select cancelled_at from birdwing_receipts where id = v_bw_receipt) is not null then
    raise exception 'TRIAL 2b FAILED: a non-lead cancelled a Birdwing receipt';
  end if;

  -- 3. Leads, as a row in tool_leads makes them.
  reset role;
  insert into tool_leads (user_id, app)
  values (v_user, '/client-relations'), (v_user, '/financial-management'), (v_user, '/birdwing');
  set local role authenticated;

  -- 4. An edit is refused, and so is a cancel with no reason.
  v_text := null;
  begin
    update client_receipts set amount = 4000 where id = v_receipt;
  exception when others then v_text := sqlerrm;
  end;
  if v_text is distinct from 'A payment is never edited — cancel it and record it again' then
    raise exception 'TRIAL 4a FAILED: editing a receipt gave %', coalesce(v_text, 'no refusal');
  end if;
  v_text := null;
  begin
    update client_receipts set cancel_reason = '  ' where id = v_receipt;
  exception when others then v_text := sqlerrm;
  end;
  if v_text is distinct from 'Say why it is cancelled' then
    raise exception 'TRIAL 4b FAILED: a cancel with no reason gave %', coalesce(v_text, 'no refusal');
  end if;

  -- 5. Each cancels, stamped by the database, and a cancelled row never changes again.
  select collected into v_before from birdwing_stay_facts where stay_id = v_stay;
  update client_receipts set cancel_reason = ' Wrong plot ', cancelled_at = '2020-01-01' where id = v_receipt;
  update funding_movements set cancel_reason = 'Typed twice' where id = v_movement;
  update birdwing_receipts set cancel_reason = 'Typed twice' where id = v_bw_receipt;
  update birdwing_cross_charges set cancel_reason = 'Typed twice' where id = v_settlement;
  if (select (cancelled_by, cancel_reason, cancelled_at > now() - interval '1 minute') from client_receipts where id = v_receipt)
     is distinct from (v_user, 'Wrong plot'::text, true) then
    raise exception 'TRIAL 5a FAILED: the cancel was not stamped by the database';
  end if;
  if (select count(*) from funding_movements where id = v_movement and cancelled_by = v_user)
     + (select count(*) from birdwing_receipts where id = v_bw_receipt and cancelled_by = v_user)
     + (select count(*) from birdwing_cross_charges where id = v_settlement and cancelled_by = v_user) <> 3 then
    raise exception 'TRIAL 5b FAILED: a lead could not cancel every kind';
  end if;
  v_text := null;
  begin
    update client_receipts set cancel_reason = 'Second thoughts' where id = v_receipt;
  exception when others then v_text := sqlerrm;
  end;
  if v_text is distinct from 'A cancelled payment can no longer be changed' then
    raise exception 'TRIAL 5c FAILED: changing a cancelled receipt gave %', coalesce(v_text, 'no refusal');
  end if;

  -- 6. Every view leaves the cancelled money out.
  if exists (select 1 from crm_receipt_facts where id = v_receipt) then
    raise exception 'TRIAL 6a FAILED: crm_receipt_facts lists a cancelled receipt';
  end if;
  select collected into v_n from birdwing_stay_facts where stay_id = v_stay;
  if v_n <> v_before - (select amount from birdwing_receipts where id = v_bw_receipt) then
    raise exception 'TRIAL 6b FAILED: birdwing_stay_facts collected % from %, the cancelled receipt still counts', v_n, v_before;
  end if;
  if (select written_off from birdwing_stay_facts where stay_id = v_stay)
     <> coalesce((select sum(amount) from birdwing_cross_charges where stay_id = v_stay and kind = 'write_off'
                    and cancelled_at is null), 0) then
    raise exception 'TRIAL 6c FAILED: a cancelled write-off still counts';
  end if;

  reset role;
  raise notice 'TRIAL 0148 OK — money in is cancelled by leads only, never deleted or edited, and leaves every view';
end $trial$;
