-- Behaviour trial for 0147 — reversing a payment, a recovery and an advance. Runs inside the dry-run transaction; always
-- rolled back, UNDER ROW-LEVEL SECURITY (BUGCATCHER #19), as the staff account holding /bills alone.
--
--   npx tsx scripts/dry-run-migrations.ts --project ipstebqawrvhkyntctrv \
--     supabase/migrations/0147_*.sql --trial scripts/trials/payment-reversals.sql
do $trial$
declare
  v_user uuid := (select id from auth.users where email = 'siddharth.cyriac.99@gmail.com');
  s_user uuid := gen_random_uuid();
  v_project uuid := (select p.id from projects p where not p.is_test and p.code is not null order by p.name limit 1);
  v_contractor uuid := (select id from vendors where is_contractor and is_active order by name limit 1);
  v_bill uuid;
  v_other uuid;
  v_pay1 uuid;
  v_pay2 uuid;
  v_back uuid;
  v_advance uuid;
  v_recovery uuid;
  v_text text;
  v_n numeric;
begin
  if v_user is null or v_project is null or v_contractor is null then
    raise exception 'TRIAL SETUP: staging is missing the staff account, a coded project or a contractor';
  end if;

  insert into auth_verified_sessions (session_id, user_id, method) values (s_user, v_user, 'otp');
  update profiles set role_id = null where id = v_user;
  delete from user_apps where user_id = v_user;
  delete from bill_approvers where user_id = v_user;
  insert into user_apps (user_id, app) values (v_user, '/bills');
  perform set_config('request.jwt.claims', json_build_object('sub', v_user,
    'role', 'authenticated', 'session_id', s_user)::text, true);

  -- Setup as the owner: two approved NMR bills to the contractor, 10,000 and 4,000.
  insert into bills (project_id, scope_code, vendor_id, kind, bill_no, reference, invoice_no, invoice_date,
                     taxable_amount, gst_amount, total_amount, status, approved_by, approved_at, created_by, updated_by)
  values (v_project, 'GEN', v_contractor, 'nmr', 9471, 'BILL/TRIAL/471', 'T-471', current_date, 10000, 0, 10000,
          'approved', v_user, now(), v_user, v_user)
  returning id into v_bill;
  insert into bills (project_id, scope_code, vendor_id, kind, bill_no, reference, invoice_no, invoice_date,
                     taxable_amount, gst_amount, total_amount, status, approved_by, approved_at, created_by, updated_by)
  values (v_project, 'GEN', v_contractor, 'nmr', 9472, 'BILL/TRIAL/472', 'T-472', current_date, 4000, 0, 4000,
          'approved', v_user, now(), v_user, v_user)
  returning id into v_other;
  set local role authenticated;

  -- 1. Paid in full in two payments: the bill is paid.
  insert into bill_payments (bill_id, amount, payment_ref, created_by, updated_by)
  values (v_bill, 6000, 'UTR-471-A', v_user, v_user) returning id into v_pay1;
  insert into bill_payments (bill_id, amount, payment_ref, created_by, updated_by)
  values (v_bill, 4000, 'UTR-471-B', v_user, v_user) returning id into v_pay2;
  if (select status from bills where id = v_bill) <> 'paid' then
    raise exception 'TRIAL 1 FAILED: the bill paid in full is not paid';
  end if;

  -- 2. A /bills holder who is not an approver cannot reverse.
  v_text := null;
  begin
    perform reverse_bill_money('payment', v_pay2, 'Paid twice');
  exception when others then v_text := sqlerrm;
  end;
  if v_text is distinct from 'Only a bill approver or an admin can reverse money' then
    raise exception 'TRIAL 2 FAILED: a non-approver reversing gave %', coalesce(v_text, 'no refusal');
  end if;

  reset role;
  insert into bill_approvers (user_id) values (v_user);
  set local role authenticated;

  -- 3. No reason, no reversal.
  v_text := null;
  begin
    perform reverse_bill_money('payment', v_pay2, '  ');
  exception when others then v_text := sqlerrm;
  end;
  if v_text is distinct from 'Say why it is reversed' then
    raise exception 'TRIAL 3 FAILED: a reversal with no reason gave %', coalesce(v_text, 'no refusal');
  end if;

  -- 4. The approver reverses the second payment: the amount, bill and reference come from it, the bill is approved
  --    again with 4,000 pending and its paid fields cleared.
  v_back := reverse_bill_money('payment', v_pay2, ' Paid twice ');
  if (select (amount, bill_id, payment_ref, reverse_reason, created_by) from bill_payments where id = v_back)
     is distinct from (-4000::numeric, v_bill, 'UTR-471-B'::text, 'Paid twice'::text, v_user) then
    raise exception 'TRIAL 4a FAILED: the reversal did not copy the payment';
  end if;
  if (select (status, payment_ref, paid_by, paid_at) from bills where id = v_bill)
     is distinct from ('approved'::text, null::text, null::uuid, null::timestamptz) then
    raise exception 'TRIAL 4b FAILED: the reversed bill did not go back to approved';
  end if;
  select coalesce(sum(amount), 0) into v_n from bill_payments where bill_id = v_bill;
  if v_n <> 6000 then raise exception 'TRIAL 4c FAILED: the bill nets % paid, expected 6000', v_n; end if;

  -- 5. Never twice, never a reversal of a reversal, and a direct insert can fake nothing.
  v_text := null;
  begin
    perform reverse_bill_money('payment', v_pay2, 'Again');
  exception when others then v_text := sqlerrm;
  end;
  if v_text is distinct from 'This was reversed already' then
    raise exception 'TRIAL 5a FAILED: a second reversal gave %', coalesce(v_text, 'no refusal');
  end if;
  v_text := null;
  begin
    perform reverse_bill_money('payment', v_back, 'Undo');
  exception when others then v_text := sqlerrm;
  end;
  if v_text is distinct from 'A reversal is never itself reversed' then
    raise exception 'TRIAL 5b FAILED: reversing a reversal gave %', coalesce(v_text, 'no refusal');
  end if;
  insert into bill_payments (bill_id, amount, payment_ref, reverses_id, reverse_reason, created_by, updated_by)
  values (v_other, -99999, 'FAKE', v_pay1, 'Wrong amount', v_user, v_user) returning id into v_back;
  if (select (bill_id, amount, payment_ref) from bill_payments where id = v_back)
     is distinct from (v_bill, -6000::numeric, 'UTR-471-A'::text) then
    raise exception 'TRIAL 5c FAILED: a direct reversal kept its own bill or amount';
  end if;
  select coalesce(sum(amount), 0) into v_n from bill_payments where bill_id = v_bill;
  if v_n <> 0 then raise exception 'TRIAL 5d FAILED: the bill nets % paid, expected 0', v_n; end if;

  -- 6. With nothing out, the bill can be sent back; then approved again and paid afresh.
  update bills set status = 'recorded', rejection_note = 'Wrong total', approved_by = null, approved_at = null,
                   updated_by = v_user
   where id = v_bill;
  update bills set status = 'approved', rejection_note = null, approved_by = v_user, approved_at = now(),
                   updated_by = v_user
   where id = v_bill;
  insert into bill_payments (bill_id, amount, payment_ref, created_by, updated_by)
  values (v_bill, 10000, 'UTR-471-C', v_user, v_user);
  if (select (status, payment_ref) from bills where id = v_bill) is distinct from ('paid'::text, 'UTR-471-C'::text) then
    raise exception 'TRIAL 6 FAILED: the bill paid afresh is not paid with the new reference';
  end if;

  -- 7. An advance of 3,000, 1,000 of it recovered on the other bill.
  insert into contractor_advances (vendor_id, project_id, amount, payment_ref, created_by, updated_by)
  values (v_contractor, v_project, 3000, 'UTR-ADV-471', v_user, v_user) returning id into v_advance;
  insert into advance_recoveries (advance_id, bill_id, amount, created_by, updated_by)
  values (v_advance, v_other, 1000, v_user, v_user) returning id into v_recovery;
  v_text := null;
  begin
    perform reverse_bill_money('advance', v_advance, 'Given to the wrong contractor');
  exception when others then v_text := sqlerrm;
  end;
  if v_text is distinct from '₹1000.00 of this advance has been recovered from bills — reverse those recoveries first' then
    raise exception 'TRIAL 7 FAILED: reversing a recovered advance gave %', coalesce(v_text, 'no refusal');
  end if;

  -- 8. The recovery reversed, then the advance: nothing is left to recover from it.
  perform reverse_bill_money('recovery', v_recovery, 'Wrong bill');
  select coalesce(sum(amount), 0) into v_n from advance_recoveries where bill_id = v_other;
  if v_n <> 0 then raise exception 'TRIAL 8a FAILED: the other bill nets % recovered', v_n; end if;
  perform reverse_bill_money('advance', v_advance, 'Given to the wrong contractor');
  select coalesce(sum(amount), 0) into v_n from contractor_advances where vendor_id = v_contractor and project_id = v_project
     and (id = v_advance or reverses_id = v_advance);
  if v_n <> 0 then raise exception 'TRIAL 8b FAILED: the advance nets %', v_n; end if;
  v_text := null;
  begin
    insert into advance_recoveries (advance_id, bill_id, amount, created_by, updated_by)
    values (v_advance, v_other, 500, v_user, v_user);
  exception when others then v_text := sqlerrm;
  end;
  if v_text is distinct from 'That advance was reversed, so nothing is left to recover from it' then
    raise exception 'TRIAL 8c FAILED: recovering from a reversed advance gave %', coalesce(v_text, 'no refusal');
  end if;

  -- 9. Still append-only: nobody updates or deletes a payment.
  update bill_payments set amount = 1 where id = v_pay1;
  delete from bill_payments where id = v_pay1;
  if (select amount from bill_payments where id = v_pay1) <> 6000 then
    raise exception 'TRIAL 9 FAILED: a payment changed under RLS';
  end if;

  reset role;
  raise notice 'TRIAL 0147 OK — payments, recoveries and advances reverse, under RLS, as an approver only';
end $trial$;
