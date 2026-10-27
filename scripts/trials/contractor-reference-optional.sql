-- Behaviour trial for 0165 — a contractor's own reference is optional; the bill's number fills a blank one.
-- Runs inside the dry-run transaction; always rolled back. Billing runs UNDER ROW-LEVEL SECURITY (BUGCATCHER #19)
-- as the staff account made /bills-only.
--
--   npx tsx scripts/dry-run-migrations.ts --project ipstebqawrvhkyntctrv \
--     supabase/migrations/0165_*.sql --trial scripts/trials/contractor-reference-optional.sql
do $trial$
declare
  v_user uuid := (select id from auth.users where email = 'siddharth.cyriac.99@gmail.com');
  s_user uuid := gen_random_uuid();
  v_project uuid := '041b4401-ab9c-4ee5-b6d7-3443f58dbc6a';
  v_company uuid := (select company_id from projects where id = '041b4401-ab9c-4ee5-b6d7-3443f58dbc6a');
  v_plot uuid := (select id from plots where project_id = '041b4401-ab9c-4ee5-b6d7-3443f58dbc6a' order by code limit 1);
  v_contractor uuid;
  v_supplier uuid;
  v_log uuid;
  v_wo uuid;
  v_supplier_wo uuid;
  v_bill uuid;
  v_ref text;
  v_invoice text;
  v_message text;
  v_code text;
begin
  if v_user is null or v_company is null or v_plot is null then
    raise exception 'TRIAL SETUP: staging is missing the staff account, the project''s company or a plot';
  end if;
  insert into auth_verified_sessions (session_id, user_id, method) values (s_user, v_user, 'otp');
  -- Setup as the owner signed in as the staff account (an approver); billing below drops to /bills-only.
  perform set_config('request.jwt.claims', json_build_object('sub', v_user,
    'role', 'authenticated', 'session_id', s_user)::text, true);
  update companies set code = 'QF' where id = v_company;
  insert into vendors (name, is_contractor) values ('Qzvy Trial 0165', true) returning id, bill_code into v_contractor, v_code;
  insert into vendors (name, is_contractor) values ('Qzvy Supplier 0165', false) returning id into v_supplier;
  insert into bill_approvers (user_id) values (v_user) on conflict do nothing;
  insert into labour_logs (plot_id, work_item_id, custom_name, contractor_id, log_date, kind, masons, helpers, others, work_class, created_by, updated_by)
  values (v_plot, null, 'Trial 0165 daily', v_contractor, current_date - 3, 'nmr', 1, 0, 0, 'additional', v_user, v_user)
  returning id into v_log;
  insert into labour_contracts (vendor_id, project_id, plot_id, description, contract_value, created_by, updated_by)
  values (v_contractor, v_project, v_plot, 'Trial 0165 order', 1, v_user, v_user) returning id into v_wo;
  update labour_contracts set status = 'approved', approved_by = v_user, approved_at = now() where id = v_wo;
  insert into labour_contracts (vendor_id, project_id, plot_id, description, contract_value, created_by, updated_by)
  values (v_supplier, v_project, v_plot, 'Trial 0165 supplier order', 1, v_user, v_user) returning id into v_supplier_wo;
  update labour_contracts set status = 'approved', approved_by = v_user, approved_at = now() where id = v_supplier_wo;

  delete from user_apps where user_id = v_user;
  insert into user_apps (user_id, app) values (v_user, '/bills');
  set local role authenticated;

  -- 1. Send to Bill with nothing typed: the bill's number stands in for the contractor's reference.
  v_bill := send_labour_logs_to_bill(array[v_log], null, '', current_date,
    jsonb_build_object('mason', 900, 'gst_pct', 0), null, null, null);
  select reference, invoice_no into v_ref, v_invoice from bills where id = v_bill;
  if v_ref is distinct from v_code || '-NMR-QF-01' or v_invoice is distinct from v_ref then
    raise exception 'TRIAL 1 FAILED: a blank Send to Bill gave % / %', v_ref, v_invoice;
  end if;

  -- 2. A work-order bill and a hand-made labour bill, blank or null: the same; a typed one is kept.
  v_bill := create_bill(null, v_wo, '  ', current_date, 1, 0, 1, null);
  select reference, invoice_no into v_ref, v_invoice from bills where id = v_bill;
  if v_ref is distinct from v_code || '-PW-QF-02' or v_invoice is distinct from v_ref then
    raise exception 'TRIAL 2 FAILED: a blank work-order bill gave % / %', v_ref, v_invoice;
  end if;
  v_bill := create_nmr_bill(v_contractor, v_project, null, null, null, current_date, 1, 0, 1, null, true);
  select reference, invoice_no into v_ref, v_invoice from bills where id = v_bill;
  if v_ref is distinct from v_code || '-PW-QF-03' or v_invoice is distinct from v_ref then
    raise exception 'TRIAL 2 FAILED: a null hand-made bill gave % / %', v_ref, v_invoice;
  end if;
  v_bill := create_nmr_bill(v_contractor, v_project, null, null, ' MR 41 ', current_date, 1, 0, 1, null);
  select reference, invoice_no into v_ref, v_invoice from bills where id = v_bill;
  if v_ref is distinct from v_code || '-NMR-QF-04' or v_invoice is distinct from 'MR 41' then
    raise exception 'TRIAL 2 FAILED: a typed reference gave % / %', v_ref, v_invoice;
  end if;

  -- 3. A muster roll paid directly, or a vendor who is not a contractor, still needs a reference.
  v_message := null;
  begin
    v_bill := create_nmr_bill(null, v_project, null, null, '', current_date, 1, 0, 1, null);
  exception when raise_exception then v_message := sqlerrm;
  end;
  if v_message is distinct from 'Type the muster roll or bill reference' then
    raise exception 'TRIAL 3 FAILED: a blank direct muster roll gave "%"', v_message;
  end if;
  v_message := null;
  begin
    v_bill := create_nmr_bill(v_supplier, v_project, null, null, '', current_date, 1, 0, 1, null);
  exception when raise_exception then v_message := sqlerrm;
  end;
  if v_message is distinct from 'Type the muster roll or bill reference' then
    raise exception 'TRIAL 3 FAILED: a blank supplier''s labour bill gave "%"', v_message;
  end if;
  v_message := null;
  begin
    v_bill := create_bill(null, v_supplier_wo, '', current_date, 1, 0, 1, null);
  exception when raise_exception then v_message := sqlerrm;
  end;
  if v_message is distinct from 'Type the invoice number as printed on the vendor''s bill' then
    raise exception 'TRIAL 3 FAILED: a blank work order for a non-contractor gave "%"', v_message;
  end if;

  reset role;
  if (select last_no from contractor_bill_numbers where vendor_id = v_contractor and company_id = v_company) <> 4 then
    raise exception 'TRIAL 3 FAILED: a refused bill moved the count';
  end if;
  raise exception 'ALL TRIALS PASSED';
end $trial$;
