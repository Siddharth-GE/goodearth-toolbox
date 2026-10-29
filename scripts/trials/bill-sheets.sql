-- Behaviour trial for 0170 — consolidated bills. Runs inside the dry-run transaction; always rolled back.
-- Every step runs UNDER ROW-LEVEL SECURITY (BUGCATCHER #19) as the staff account made /bills-only, first not a bill
-- approver, then one.
--
--   npx tsx scripts/dry-run-migrations.ts --project ipstebqawrvhkyntctrv \
--     supabase/migrations/0170_*.sql --trial scripts/trials/bill-sheets.sql
do $trial$
declare
  v_user uuid := (select id from auth.users where email = 'siddharth.cyriac.99@gmail.com');
  s_user uuid := gen_random_uuid();
  v_villas uuid := '041b4401-ab9c-4ee5-b6d7-3443f58dbc6a';
  v_infra uuid := '49dc6af6-ded4-4522-9798-ca1f04003839';
  v_p1 uuid;
  v_p2 uuid;
  v_contractor uuid;
  v_code text;
  v_a uuid;
  v_b uuid;
  v_c uuid;
  v_d uuid;
  v_x uuid;
  v_s1 uuid;
  v_s2 uuid;
  v_s3 uuid;
  v_request uuid;
  v_item uuid;
  v_entry uuid;
  v_back uuid;
  v_result jsonb;
  v_message text;
begin
  select id into v_p1 from plots where project_id = v_villas order by code limit 1;
  select id into v_p2 from plots where project_id = v_villas order by code offset 1 limit 1;
  if v_user is null or v_p2 is null then
    raise exception 'TRIAL SETUP: staging is missing the staff account or the plots';
  end if;
  insert into auth_verified_sessions (session_id, user_id, method) values (s_user, v_user, 'otp');
  insert into vendors (name, is_contractor) values ('Qzvy Trial 0170', true) returning id, bill_code into v_contractor, v_code;
  delete from user_apps where user_id = v_user;
  insert into user_apps (user_id, app) values (v_user, '/bills');
  delete from bill_approvers where user_id = v_user;
  perform set_config('request.jwt.claims', json_build_object('sub', v_user,
    'role', 'authenticated', 'session_id', s_user)::text, true);
  set local role authenticated;

  -- A (oldest) and B on EF villas, NMR; C piece-work on EF; D on ED; X a muster roll paid directly.
  v_a := create_nmr_bill(v_contractor, v_villas, v_p1, null, '', current_date - 3, 1, 0, 1, null);
  insert into bill_lines (bill_id, sort_order, line_kind, description, quantity, rate, gst_pct)
  values (v_a, 1, 'nmr', 'Helpers (man-days)', 2, 450, 0);
  v_b := create_nmr_bill(v_contractor, v_villas, v_p2, null, '', current_date - 2, 1, 0, 1, null);
  insert into bill_lines (bill_id, sort_order, line_kind, description, quantity, rate, gst_pct)
  values (v_b, 1, 'nmr', 'Masons (man-days)', 1, 1100, 0);
  v_c := create_nmr_bill(v_contractor, v_villas, v_p1, null, '', current_date, 1, 0, 1, null, true);
  insert into bill_lines (bill_id, sort_order, line_kind, description, quantity, rate, gst_pct)
  values (v_c, 1, 'pw_lump', 'Trial 0170 lump', null, 3000, 0);
  v_d := create_nmr_bill(v_contractor, v_infra, null, null, '', current_date, 1, 0, 1, null);
  insert into bill_lines (bill_id, sort_order, line_kind, description, quantity, rate, gst_pct)
  values (v_d, 1, 'nmr', 'Helpers (man-days)', 1, 450, 0);
  v_x := create_nmr_bill(null, v_villas, v_p1, null, 'MR 9', current_date, 1, 0, 1, null);
  insert into bill_lines (bill_id, sort_order, line_kind, description, quantity, rate, gst_pct)
  values (v_x, 1, 'nmr', 'Helpers (man-days)', 1, 450, 0);
  reset role;
  insert into bill_approvers (user_id) values (v_user);
  set local role authenticated;
  update bills set status = 'approved', approved_by = v_user, approved_at = now() where id = v_b;
  reset role;
  delete from bill_approvers where user_id = v_user;
  set local role authenticated;

  -- 1. Not an approver: A, C and D go on three sheets; B (approved) and X (no contractor) are left out, named.
  v_result := consolidate_bills(array[v_a, v_b, v_c, v_d, v_x]);
  if jsonb_array_length(v_result -> 'sheets') <> 3 or jsonb_array_length(v_result -> 'skipped') <> 2 then
    raise exception 'TRIAL 1 FAILED: %', v_result;
  end if;
  if not exists (select 1 from jsonb_array_elements(v_result -> 'skipped') e
                  where e ->> 'id' = v_b::text and e ->> 'reason' like 'approved — only a bill approver%')
     or not exists (select 1 from jsonb_array_elements(v_result -> 'skipped') e
                     where e ->> 'id' = v_x::text and e ->> 'reason' = 'not a contractor''s labour bill') then
    raise exception 'TRIAL 1 FAILED: the reasons are wrong: %', v_result -> 'skipped';
  end if;
  select sheet_id into v_s1 from bills where id = v_a;
  select sheet_id into v_s2 from bills where id = v_c;
  select sheet_id into v_s3 from bills where id = v_d;
  if (select reference from bill_sheets where id = v_s1) <> v_code || '-NMR-EF-C01'
     or (select reference from bill_sheets where id = v_s2) <> v_code || '-PW-EF-C02'
     or (select reference from bill_sheets where id = v_s3) <> v_code || '-NMR-ED-C01' then
    raise exception 'TRIAL 1 FAILED: the numbers are %, %, %', (select reference from bill_sheets where id = v_s1),
      (select reference from bill_sheets where id = v_s2), (select reference from bill_sheets where id = v_s3);
  end if;

  -- 2. An approver: B joins A's sheet, still waiting for approval, and goes back to recorded with a note.
  reset role;
  insert into bill_approvers (user_id, approval_limit) values (v_user, 1500);
  set local role authenticated;
  v_result := consolidate_bills(array[v_b, v_a]);
  if (select sheet_id from bills where id = v_b) is distinct from v_s1
     or (select status from bills where id = v_b) <> 'recorded'
     or (select rejection_note from bills where id = v_b) not like 'Consolidated on %'
     or v_result -> 'skipped' -> 0 ->> 'reason' not like 'already on %' then
    raise exception 'TRIAL 2 FAILED: %', v_result;
  end if;

  -- 3. A bill on a sheet is not approved, deleted, paid or put on a cash request on its own; nor is a waiting sheet.
  v_message := null;
  begin
    update bills set status = 'approved', approved_by = v_user, approved_at = now() where id = v_a;
  exception when raise_exception then v_message := sqlerrm;
  end;
  if coalesce(v_message, '') not like '%— approve or send back the sheet' then
    raise exception 'TRIAL 3 FAILED: approving A alone gave "%"', v_message;
  end if;
  v_message := null;
  begin
    perform delete_recorded_bill(v_a);
  exception when raise_exception then v_message := sqlerrm;
  end;
  if coalesce(v_message, '') not like '%Take it off the sheet before deleting it' then
    raise exception 'TRIAL 3 FAILED: deleting A gave "%" (% % %)', v_message,
      (select created_by from bills where id = v_a), (select status from bills where id = v_a), v_user;
  end if;
  insert into cash_requests (week_of, created_by, updated_by)
  values (date_trunc('week', current_date)::date, v_user, v_user) returning id into v_request;
  v_message := null;
  begin
    insert into cash_request_items (cash_request_id, item_kind, sheet_id, requested_amount, created_by, updated_by)
    values (v_request, 'sheet', v_s1, 100, v_user, v_user);
  exception when raise_exception then v_message := sqlerrm;
  end;
  if coalesce(v_message, '') not like 'Only an approved sheet goes on a cash request%' then
    raise exception 'TRIAL 3 FAILED: a waiting sheet on a cash request gave "%"', v_message;
  end if;

  -- 4. The limit is on the sheet's total (2,000 > 1,500), though each bill is under it.
  v_message := null;
  begin
    perform approve_bill_sheet(v_s1);
  exception when raise_exception then v_message := sqlerrm;
  end;
  if coalesce(v_message, '') not like '%totals more than your approval limit%' then
    raise exception 'TRIAL 4 FAILED: over the limit gave "%"', v_message;
  end if;
  reset role;
  update bill_approvers set approval_limit = null where user_id = v_user;
  set local role authenticated;
  perform approve_bill_sheet(v_s1);
  if (select status from bill_sheets where id = v_s1) <> 'approved'
     or exists (select 1 from bills where sheet_id = v_s1 and (status <> 'approved' or rejection_note is not null)) then
    raise exception 'TRIAL 4 FAILED: approving the sheet did not approve every bill on it';
  end if;

  -- 5. A loose contractor bill never goes on a cash request; the approved sheet does. A's money only through the sheet.
  reset role;
  update bills set status = 'approved', approved_by = v_user, approved_at = now() where id = v_x;
  set local role authenticated;
  insert into cash_request_items (cash_request_id, item_kind, bill_id, requested_amount, created_by, updated_by)
  values (v_request, 'bill', v_x, 450, v_user, v_user);
  perform remove_bill_from_sheet(v_c);
  if (select status from bill_sheets where id = v_s2) <> 'undone' then
    raise exception 'TRIAL 5 FAILED: a sheet left with no bills is not undone';
  end if;
  update bills set status = 'approved', approved_by = v_user, approved_at = now() where id = v_c;
  v_message := null;
  begin
    insert into cash_request_items (cash_request_id, item_kind, bill_id, requested_amount, created_by, updated_by)
    values (v_request, 'bill', v_c, 3000, v_user, v_user);
  exception when raise_exception then v_message := sqlerrm;
  end;
  if coalesce(v_message, '') not like 'A contractor''s labour bill goes on a cash request on its sheet%' then
    raise exception 'TRIAL 5 FAILED: a loose contractor bill on a cash request gave "%"', v_message;
  end if;
  insert into cash_request_items (cash_request_id, item_kind, sheet_id, requested_amount, created_by, updated_by)
  values (v_request, 'sheet', v_s1, 2000, v_user, v_user) returning id into v_item;
  update cash_requests set status = 'submitted', submitted_by = v_user, submitted_at = now() where id = v_request;
  update cash_requests set status = 'released', released_by = v_user, released_at = now() where id = v_request;
  v_message := null;
  begin
    insert into bill_payments (bill_id, amount, paid_on, payment_ref, created_by, updated_by)
    values (v_a, 100, current_date, 'UTR-ALONE', v_user, v_user);
  exception when raise_exception then v_message := sqlerrm;
  end;
  if coalesce(v_message, '') not like '%— its money goes through the sheet' then
    raise exception 'TRIAL 5 FAILED: paying A alone gave "%"', v_message;
  end if;

  -- 6. 1,500 through the sheet: A (oldest, 900) is paid, B gets 600; one entry, the line's paid is 1,500.
  v_entry := pay_bill_sheet(v_s1, 1500, current_date, 'UTR-0170', null, v_item);
  if (select status from bills where id = v_a) <> 'paid'
     or (select sum(amount) from bill_payments where bill_id = v_b) <> 600
     or (select count(*) from bill_payments where sheet_entry_id = v_entry and sheet_id = v_s1
           and cash_request_item_id = v_item and payment_ref = 'UTR-0170') <> 2 then
    raise exception 'TRIAL 6 FAILED: the payment was not spread oldest first';
  end if;
  v_message := null;
  begin
    perform pay_bill_sheet(v_s1, 600, current_date, 'UTR-0170B', null, v_item);
  exception when raise_exception then v_message := sqlerrm;
  end;
  if coalesce(v_message, '') not like 'That is more than % has pending (₹500.00 left)' then
    raise exception 'TRIAL 6 FAILED: overpaying gave "%"', v_message;
  end if;

  -- 7. While money is out the sheet is neither sent back nor undone; reversed whole, it can be sent back, never undone.
  v_message := null;
  begin
    perform send_back_bill_sheet(v_s1, 'Wrong rate');
  exception when raise_exception then v_message := sqlerrm;
  end;
  if coalesce(v_message, '') not like 'Money has gone out on %' then
    raise exception 'TRIAL 7 FAILED: sending back with money out gave "%"', v_message;
  end if;
  v_back := reverse_bill_sheet_money('payment', v_entry, 'Paid to the wrong account');
  if (select count(*) from bill_payments where sheet_entry_id = v_back and amount < 0) <> 2
     or (select status from bills where id = v_a) <> 'approved' then
    raise exception 'TRIAL 7 FAILED: the reversal did not take the whole payment back';
  end if;
  perform send_back_bill_sheet(v_s1, 'Wrong rate');
  if (select status from bill_sheets where id = v_s1) <> 'recorded'
     or exists (select 1 from bills where sheet_id = v_s1 and status <> 'recorded') then
    raise exception 'TRIAL 7 FAILED: the send-back did not bring the sheet and its bills back';
  end if;
  v_message := null;
  begin
    perform undo_bill_sheet(v_s1);
  exception when raise_exception then v_message := sqlerrm;
  end;
  if coalesce(v_message, '') not like '%is on the cash request for the week of %' then
    raise exception 'TRIAL 7 FAILED: undoing a sheet on a cash request gave "%"', v_message;
  end if;

  -- 8. Undo: D's approved sheet, by an approver; D stands alone, waiting, and the sheet keeps what it had.
  perform approve_bill_sheet(v_s3);
  perform undo_bill_sheet(v_s3);
  if (select sheet_id from bills where id = v_d) is not null
     or (select status from bills where id = v_d) <> 'recorded'
     or (select status from bill_sheets where id = v_s3) <> 'undone'
     or (select count(*) from bill_sheet_bills where sheet_id = v_s3 and bill_id = v_d and removed_at is not null) <> 1 then
    raise exception 'TRIAL 8 FAILED: undoing did not free D and keep the record';
  end if;

  -- 9. The tables answer to the functions alone.
  v_message := null;
  begin
    update bill_sheets set status = 'approved' where id = v_s1;
  exception when insufficient_privilege then v_message := sqlerrm;
  end;
  if v_message is null then
    raise exception 'TRIAL 9 FAILED: a sheet was written directly';
  end if;

  raise exception 'ALL TRIALS PASSED';
end $trial$;
