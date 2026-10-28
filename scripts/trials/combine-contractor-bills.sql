-- Behaviour trial for 0167 — combining a contractor's bills. Runs inside the dry-run transaction; always rolled back.
-- Every billing step runs UNDER ROW-LEVEL SECURITY (BUGCATCHER #19) as the staff account made /bills-only and a bill
-- approver, then not one.
--
--   npx tsx scripts/dry-run-migrations.ts --project ipstebqawrvhkyntctrv \
--     supabase/migrations/0167_*.sql --trial scripts/trials/combine-contractor-bills.sql
do $trial$
declare
  v_user uuid := (select id from auth.users where email = 'siddharth.cyriac.99@gmail.com');
  s_user uuid := gen_random_uuid();
  v_villas uuid := '041b4401-ab9c-4ee5-b6d7-3443f58dbc6a';
  v_mobilisation uuid := '0a41b5fe-c3fa-4a12-a2ac-4fc01d787bda';
  v_infra uuid := '49dc6af6-ded4-4522-9798-ca1f04003839';
  v_p1 uuid;
  v_p2 uuid;
  v_contractor uuid;
  v_a uuid;
  v_b uuid;
  v_c uuid;
  v_d uuid;
  v_e uuid;
  v_f uuid;
  v_g uuid;
  v_p1_before numeric;
  v_log uuid;
  v_keep uuid;
  v_before numeric;
  v_message text;
  v_ref_a text;
  v_ref_b text;
begin
  select id into v_p1 from plots where project_id = v_villas order by code limit 1;
  select id into v_p2 from plots where project_id = v_villas order by code offset 1 limit 1;
  if v_user is null or v_p2 is null then
    raise exception 'TRIAL SETUP: staging is missing the staff account or the plots';
  end if;
  insert into auth_verified_sessions (session_id, user_id, method) values (s_user, v_user, 'otp');
  insert into vendors (name, is_contractor) values ('Qzvy Trial 0167', true) returning id into v_contractor;
  delete from user_apps where user_id = v_user;
  insert into user_apps (user_id, app) values (v_user, '/bills');
  insert into bill_approvers (user_id) values (v_user) on conflict do nothing;
  insert into labour_logs (plot_id, custom_name, contractor_id, log_date, kind, masons, helpers, others, work_class, created_by, updated_by)
  values (v_p2, 'Trial 0167 log', v_contractor, current_date - 2, 'nmr', 0, 2, 0, 'additional', v_user, v_user)
  returning id into v_log;
  perform set_config('request.jwt.claims', json_build_object('sub', v_user,
    'role', 'authenticated', 'session_id', s_user)::text, true);
  set local role authenticated;

  -- Four EF NMR bills: A on P1 (oldest), B on P2 then approved, C on the whole of Mobilisation, D from a labour entry.
  v_a := create_nmr_bill(v_contractor, v_villas, v_p1, null, '', current_date, 1, 0, 1, null);
  insert into bill_lines (bill_id, sort_order, line_kind, description, quantity, rate, gst_pct)
  values (v_a, 1, 'nmr', 'Helpers (man-days)', 2, 450, 0);
  v_b := create_nmr_bill(v_contractor, v_villas, v_p2, null, '', current_date, 1, 0, 1, null);
  insert into bill_lines (bill_id, sort_order, line_kind, description, quantity, rate, gst_pct)
  values (v_b, 1, 'nmr', 'Masons (man-days)', 1, 1100, 0);
  -- One transaction stamps every bill at one time; real bills are made apart, so A is made the oldest here.
  reset role;
  update bills set created_at = now() - interval '2 hours' where id = v_a;
  update bills set created_at = now() - interval '1 hour' where id = v_b;
  set local role authenticated;
  update bills set status = 'approved', approved_by = v_user, approved_at = now() where id = v_b;
  v_c := create_nmr_bill(v_contractor, v_mobilisation, null, null, '', current_date, 1, 0, 1, null);
  insert into bill_lines (bill_id, sort_order, line_kind, description, quantity, rate, gst_pct)
  values (v_c, 1, 'nmr', 'Helpers (man-days)', 4, 450, 0);
  v_d := send_labour_logs_to_bill(array[v_log], null, '', current_date,
    jsonb_build_object('mason', 1100, 'helper', 500, 'gst_pct', 0), null, null, null);
  -- F on the whole of Saarang - Villas with its own reference and a note; G on P2 with a line naming the whole project.
  v_f := create_nmr_bill(v_contractor, v_villas, null, null, 'MR 41', current_date, 1, 0, 1, 'Shed work');
  insert into bill_lines (bill_id, sort_order, line_kind, description, quantity, rate, gst_pct)
  values (v_f, 1, 'other', 'Trial 0167 shed', 1, 5000, 0);
  v_g := create_nmr_bill(v_contractor, v_villas, v_p2, null, '', current_date, 1, 0, 1, null);
  insert into bill_lines (bill_id, sort_order, line_kind, description, quantity, rate, gst_pct, project_id)
  values (v_g, 1, 'other', 'Trial 0167 site clearing', 1, 700, 0, v_villas);
  select reference into v_ref_a from bills where id = v_a;
  select reference into v_ref_b from bills where id = v_b;

  -- 1. Refusals, each before anything changes: two kinds, another company, charges, and a non-approver.
  v_e := create_nmr_bill(v_contractor, v_villas, v_p1, null, '', current_date, 1, 0, 1, null, true);
  insert into bill_lines (bill_id, sort_order, line_kind, description, quantity, rate, gst_pct)
  values (v_e, 1, 'pw_lump', 'Trial 0167 lump', null, 3000, 0);
  v_message := null;
  begin
    perform combine_contractor_bills(array[v_a, v_e]);
  exception when raise_exception then v_message := sqlerrm;
  end;
  if v_message is null or v_message not like 'PW and NMR bills stay separate%' then
    raise exception 'TRIAL 1 FAILED: PW with NMR gave "%"', v_message;
  end if;
  v_e := create_nmr_bill(v_contractor, v_infra, null, null, '', current_date, 1, 0, 1, null);
  insert into bill_lines (bill_id, sort_order, line_kind, description, quantity, rate, gst_pct)
  values (v_e, 1, 'nmr', 'Helpers (man-days)', 1, 450, 0);
  v_message := null;
  begin
    perform combine_contractor_bills(array[v_a, v_e]);
  exception when raise_exception then v_message := sqlerrm;
  end;
  if v_message is null or v_message not like 'Combined bills are one company''s%' then
    raise exception 'TRIAL 1 FAILED: EF with ED gave "%"', v_message;
  end if;
  update bills set charges_amount = 100, charges_gst_pct = 0, charges_note = 'Transport' where id = v_c;
  v_message := null;
  begin
    perform combine_contractor_bills(array[v_a, v_c]);
  exception when raise_exception then v_message := sqlerrm;
  end;
  if v_message is null or v_message not like '%has additional charges%' then
    raise exception 'TRIAL 1 FAILED: a bill with charges gave "%"', v_message;
  end if;
  update bills set charges_amount = null, charges_gst_pct = null, charges_note = null where id = v_c;
  reset role;
  delete from bill_approvers where user_id = v_user;
  set local role authenticated;
  v_message := null;
  begin
    perform combine_contractor_bills(array[v_a, v_b]);
  exception when raise_exception then v_message := sqlerrm;
  end;
  if v_message is null or v_message not like 'Only a named bill approver or an admin%' then
    raise exception 'TRIAL 1 FAILED: a non-approver gave "%"', v_message;
  end if;
  reset role;
  insert into bill_approvers (user_id) values (v_user);
  select coalesce(sum(amount), 0) into v_before from villa_cost_facts where plot_id = v_p2 and kind = 'labour_billed';
  select coalesce(sum(amount), 0) into v_p1_before from villa_cost_facts where plot_id = v_p1 and kind = 'labour_billed';

  -- 2. Combine all six: A keeps its number, takes every line on its villa, the entry follows, the rest are gone.
  set local role authenticated;
  v_keep := combine_contractor_bills(array[v_d, v_c, v_b, v_a, v_f, v_g]);
  if v_keep is distinct from v_a then
    raise exception 'TRIAL 2 FAILED: the oldest bill did not keep its number';
  end if;
  if (select reference from bills where id = v_a) is distinct from v_ref_a
     or (select status from bills where id = v_a) <> 'recorded' then
    raise exception 'TRIAL 2 FAILED: the kept bill changed its number or is not waiting for approval';
  end if;
  if exists (select 1 from bills where id in (v_b, v_c, v_d, v_f, v_g)) then
    raise exception 'TRIAL 2 FAILED: a combined bill is still there';
  end if;
  if (select count(*) from bill_lines where bill_id = v_a) <> 6
     or (select total_amount from bills where id = v_a) <> 900 + 1100 + 1800 + 1000 + 5000 + 700 then
    raise exception 'TRIAL 2 FAILED: the kept bill does not carry every line at its money';
  end if;
  if (select plot_id from bill_lines where bill_id = v_a and description like 'Masons%') is distinct from v_p2
     or (select project_id from bill_lines where bill_id = v_a and quantity = 4) is distinct from v_mobilisation
     or (select plot_id from bill_lines where bill_id = v_a and rate = 500) is distinct from v_p2 then
    raise exception 'TRIAL 2 FAILED: a moved line lost its villa';
  end if;
  if (select bill_id from labour_logs where id = v_log) is distinct from v_a then
    raise exception 'TRIAL 2 FAILED: the labour entry did not follow its line';
  end if;
  if (select note from bills where id = v_a) not like '%Combined with %' || v_ref_b || '%'
     or (select note from bills where id = v_a) not like '%their MR 41%'
     or (select note from bills where id = v_a) not like '%: Shed work%' then
    raise exception 'TRIAL 2 FAILED: the note does not name the bills taken in, their references and notes: %',
      (select note from bills where id = v_a);
  end if;
  reset role;
  -- The whole-project lines of F and G are on no villa, not on A's P1.
  if (select coalesce(sum(amount), 0) from villa_cost_facts where plot_id = v_p1 and kind = 'labour_billed')
     <> v_p1_before then
    raise exception 'TRIAL 2 FAILED: a whole-project line was costed to the kept bill''s villa';
  end if;
  if (select coalesce(sum(amount), 0) from villa_cost_facts where plot_id = v_p2 and kind = 'labour_billed')
     <> v_before then
    raise exception 'TRIAL 2 FAILED: P2''s cost moved when its bills were combined';
  end if;

  raise exception 'ALL TRIALS PASSED';
end $trial$;
