-- Behaviour trial for 0164 — contractor codes, company codes, and each contractor's bill number per company.
-- Runs inside the dry-run transaction; always rolled back. Masters and billing steps run UNDER ROW-LEVEL SECURITY
-- (BUGCATCHER #19) as the staff account made /masters-only, then /bills-only.
--
--   npx tsx scripts/dry-run-migrations.ts --project ipstebqawrvhkyntctrv \
--     supabase/migrations/0164_*.sql --trial scripts/trials/contractor-bill-numbers.sql
do $trial$
declare
  v_user uuid := (select id from auth.users where email = 'siddharth.cyriac.99@gmail.com');
  s_user uuid := gen_random_uuid();
  v_project uuid := '041b4401-ab9c-4ee5-b6d7-3443f58dbc6a';
  v_company uuid := (select company_id from projects where id = '041b4401-ab9c-4ee5-b6d7-3443f58dbc6a');
  v_plot uuid := (select id from plots where project_id = '041b4401-ab9c-4ee5-b6d7-3443f58dbc6a' order by code limit 1);
  v_work uuid := (select id from work_items where is_active order by code limit 1);
  v_contractor uuid;
  v_twin uuid;
  v_code text;
  v_code2 text;
  v_log uuid;
  v_wo uuid;
  v_bill uuid;
  v_ref text;
  v_refused boolean;
  v_message text;
begin
  if v_user is null or v_company is null or v_plot is null or v_work is null then
    raise exception 'TRIAL SETUP: staging is missing the staff account, the project''s company, a plot or a work';
  end if;
  insert into auth_verified_sessions (session_id, user_id, method) values (s_user, v_user, 'otp');

  -- 1. Every contractor has a code, none alike; a new one is made from the name; a taken one moves on.
  if exists (select 1 from vendors where is_contractor and bill_code is null) then
    raise exception 'TRIAL 1 FAILED: a contractor has no bill code';
  end if;
  insert into vendors (name, is_contractor) values ('Qzvy (Trial) Kattan', true) returning id, bill_code into v_contractor, v_code;
  if v_code is distinct from 'QZVY' then raise exception 'TRIAL 1 FAILED: the code is %, not QZVY', v_code; end if;
  insert into vendors (name, is_contractor) values ('Qzvy Trial', true) returning id, bill_code into v_twin, v_code2;
  if v_code2 is distinct from 'QZVT' then raise exception 'TRIAL 1 FAILED: the second code is %, not QZVT', v_code2; end if;
  insert into vendors (name, is_contractor) values ('Qz', true) returning bill_code into v_code2;
  if v_code2 is distinct from 'QZXX' then raise exception 'TRIAL 1 FAILED: a short name gave %', v_code2; end if;
  insert into vendors (name, is_contractor) values ('Qzvy Supplier', false) returning bill_code into v_code2;
  if v_code2 is not null then raise exception 'TRIAL 1 FAILED: a supplier got a bill code'; end if;
  update vendors set bill_code = ' qzv9 ' where id = v_twin returning bill_code into v_code2;
  if v_code2 is distinct from 'QZV9' then raise exception 'TRIAL 1 FAILED: a typed code was kept as %', v_code2; end if;
  v_refused := false;
  begin
    update vendors set bill_code = 'QZVY' where id = v_twin;
  exception when unique_violation then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 1 FAILED: two contractors share a code'; end if;
  update companies set code = 'QF' where id = v_company;

  -- 2. As a /masters-only person: type the last paper number; the app's flag cannot be typed.
  delete from user_apps where user_id = v_user;
  insert into user_apps (user_id, app) values (v_user, '/masters');
  perform set_config('request.jwt.claims', json_build_object('sub', v_user,
    'role', 'authenticated', 'session_id', s_user)::text, true);
  set local role authenticated;
  insert into contractor_bill_numbers (vendor_id, company_id, last_no, app_numbering)
  values (v_contractor, v_company, 7, true);
  if (select app_numbering from contractor_bill_numbers where vendor_id = v_contractor) then
    raise exception 'TRIAL 2 FAILED: Masters set the app''s flag';
  end if;
  update contractor_bill_numbers set last_no = 6 where vendor_id = v_contractor and company_id = v_company;
  reset role;

  -- Setup, as the owner signed in as the staff account (an approver): a daily-wages entry and an approved work order.
  insert into bill_approvers (user_id) values (v_user) on conflict do nothing;
  insert into labour_logs (plot_id, work_item_id, custom_name, contractor_id, log_date, kind, masons, helpers, others, work_class, created_by, updated_by)
  values (v_plot, null, 'Trial 0164 daily', v_contractor, current_date - 3, 'nmr', 1, 1, 0, 'additional', v_user, v_user)
  returning id into v_log;
  insert into labour_contracts (vendor_id, project_id, plot_id, description, contract_value, created_by, updated_by)
  values (v_contractor, v_project, v_plot, 'Trial 0164 order', 1, v_user, v_user) returning id into v_wo;
  update labour_contracts set status = 'approved', approved_by = v_user, approved_at = now() where id = v_wo;

  -- 3. As a /bills-only person: daily wages are NMR and take the next number after the paper one.
  delete from user_apps where user_id = v_user;
  insert into user_apps (user_id, app) values (v_user, '/bills');
  set local role authenticated;
  v_bill := send_labour_logs_to_bill(array[v_log], null, 'MR 0164 A', current_date,
    jsonb_build_object('mason', 900, 'helper', 700, 'gst_pct', 0), null, null, null);
  select reference into v_ref from bills where id = v_bill;
  if v_ref is distinct from 'QZVY-NMR-QF-07' then raise exception 'TRIAL 3 FAILED: the daily-wages bill is %', v_ref; end if;

  -- 4. Direct piece-work and a work-order bill are PW, on the same count.
  reset role;
  insert into labour_logs (plot_id, work_item_id, custom_name, contractor_id, log_date, kind, masons, helpers, others, description, work_class, created_by, updated_by)
  values (v_plot, null, 'Trial 0164 lump', v_contractor, current_date - 2, 'pw_lump', 0, 0, 0, 'Break and relay', 'rework', v_user, v_user)
  returning id into v_log;
  set local role authenticated;
  v_bill := send_labour_logs_to_bill(array[v_log], null, 'MR 0164 B', current_date,
    jsonb_build_object(v_log::text, jsonb_build_object('rate', 5000, 'gst_pct', 0)), null, null, null);
  select reference into v_ref from bills where id = v_bill;
  if v_ref is distinct from 'QZVY-PW-QF-08' then raise exception 'TRIAL 4 FAILED: the piece-work bill is %', v_ref; end if;
  v_bill := create_bill(null, v_wo, 'WO 0164', current_date, 1, 0, 1, null);
  select reference into v_ref from bills where id = v_bill;
  if v_ref is distinct from 'QZVY-PW-QF-09' then raise exception 'TRIAL 4 FAILED: the work-order bill is %', v_ref; end if;
  v_bill := create_nmr_bill(v_contractor, v_project, null, null, 'HAND 0164', current_date, 1, 0, 1, null, true);
  select reference into v_ref from bills where id = v_bill;
  if v_ref is distinct from 'QZVY-PW-QF-10' then raise exception 'TRIAL 4 FAILED: a hand-made piece-work bill is %', v_ref; end if;

  -- 5. PW or NMR is permanent; a /bills person cannot move the count; a muster roll with no contractor keeps BILL/.
  v_refused := false;
  begin
    update bills set work_type = 'NMR' where id = v_bill;
  exception when raise_exception then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 5 FAILED: a bill''s PW became NMR'; end if;
  update contractor_bill_numbers set last_no = 1 where vendor_id = v_contractor;
  v_refused := false;
  begin
    insert into contractor_bill_numbers (vendor_id, company_id, last_no) values (v_twin, v_company, 3);
  exception when insufficient_privilege then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 5 FAILED: a /bills person typed a starting number'; end if;
  v_bill := create_nmr_bill(null, v_project, null, null, 'MR 0164 C', current_date, 1, 0, 1, null);
  select reference into v_ref from bills where id = v_bill;
  if v_ref not like 'BILL/%' then raise exception 'TRIAL 5 FAILED: a muster roll with no contractor is %', v_ref; end if;
  reset role;
  if (select last_no from contractor_bill_numbers where vendor_id = v_contractor and company_id = v_company) <> 10 then
    raise exception 'TRIAL 5 FAILED: the count moved outside a bill';
  end if;

  -- 6. Once the app is counting, Masters can only raise the number, never move the count or the code.
  delete from user_apps where user_id = v_user;
  insert into user_apps (user_id, app) values (v_user, '/masters');
  set local role authenticated;
  v_refused := false;
  begin
    update contractor_bill_numbers set last_no = 2 where vendor_id = v_contractor and company_id = v_company;
  exception when raise_exception then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 6 FAILED: Masters lowered a number the app is counting'; end if;
  v_refused := false;
  begin
    update contractor_bill_numbers set vendor_id = v_twin where vendor_id = v_contractor and company_id = v_company;
  exception when raise_exception then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 6 FAILED: a count moved to another contractor'; end if;
  v_refused := false;
  begin
    update vendors set bill_code = 'QZVA' where id = v_contractor;
  exception when raise_exception then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 6 FAILED: the code on numbered bills changed'; end if;
  update contractor_bill_numbers set last_no = 99 where vendor_id = v_contractor and company_id = v_company;
  reset role;
  delete from user_apps where user_id = v_user;
  insert into user_apps (user_id, app) values (v_user, '/bills');
  set local role authenticated;
  v_bill := create_nmr_bill(v_contractor, v_project, null, null, 'MR 0164 F', current_date, 1, 0, 1, null);
  select reference into v_ref from bills where id = v_bill;
  if v_ref is distinct from 'QZVY-NMR-QF-100' then raise exception 'TRIAL 6 FAILED: the 100th bill is %', v_ref; end if;
  reset role;

  -- 7. A project with no company, or a company with no code, is refused in a sentence.
  update companies set code = null where id = v_company;
  delete from user_apps where user_id = v_user;
  insert into user_apps (user_id, app) values (v_user, '/bills');
  set local role authenticated;
  v_message := null;
  begin
    v_bill := create_nmr_bill(v_contractor, v_project, null, null, 'MR 0164 D', current_date, 1, 0, 1, null);
  exception when raise_exception then v_message := sqlerrm;
  end;
  if v_message is null or v_message not like '%has no bill code yet%Masters → Companies%' then
    raise exception 'TRIAL 7 FAILED: a company with no code gave "%"', v_message;
  end if;
  reset role;
  update projects set company_id = null where id = v_project;
  set local role authenticated;
  v_message := null;
  begin
    v_bill := create_nmr_bill(v_contractor, v_project, null, null, 'MR 0164 E', current_date, 1, 0, 1, null);
  exception when raise_exception then v_message := sqlerrm;
  end;
  if v_message is null or v_message not like 'This project has no company yet%' then
    raise exception 'TRIAL 7 FAILED: a project with no company gave "%"', v_message;
  end if;

  reset role;
  raise exception 'ALL TRIALS PASSED';
end $trial$;
