-- Behaviour trial for the B8 screens' writes, as the billing team.
-- Runs inside the dry-run transaction; always rolled back.
--
-- Everything after the setup runs UNDER ROW-LEVEL SECURITY (set local
-- role authenticated) as a /bills-only person who is a named bill
-- approver — the staff Siddharth account (the gmail one, not the
-- founder's admin login), made so inside this transaction. A trial run
-- as the database owner bypasses every policy.
--
--   npx tsx scripts/dry-run-migrations.ts --project ipstebqawrvhkyntctrv \
--     supabase/migrations/0110_*.sql supabase/migrations/0111_*.sql \
--     --trial scripts/trials/payments-as-billing-team.sql
do $trial$
declare
  v_user uuid := (select id from auth.users where email = 'siddharth.cyriac.99@gmail.com');
  v_project uuid := '041b4401-ab9c-4ee5-b6d7-3443f58dbc6a';
  v_unit uuid;
  v_ucode text;
  v_vendor uuid := (select id from vendors where not is_contractor order by name limit 1);
  v_contractor uuid := (select id from vendors where is_contractor order by name limit 1);
  v_item uuid := (select id from items where code = 'CVL/08');
  v_uom text := (select default_uom from items where code = 'CVL/08');
  v_work uuid := (select id from work_items where code = 'FD.15');
  v_po uuid;
  v_wo uuid;
  v_bill uuid;
  v_labour_bill uuid;
  v_request uuid;
  v_bill_item uuid;
  v_advance_item uuid;
  v_advance uuid;
  v_status text;
  v_n numeric;
begin
  select u.id, u.code into v_unit, v_ucode
    from plots p join units u on u.plot_id = p.id
    where p.project_id = v_project and u.code is not null limit 1;

  -- Setup, as the owner: two approved bills — 10,000 to a vendor against a
  -- PO, and 8,000 to the contractor against an approved work order.
  insert into bill_approvers (user_id) values (v_user) on conflict do nothing;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated')::text, true);

  insert into purchase_orders (project_id, unit_id, scope_code, vendor_id, po_no, reference, status, created_by, updated_by)
  values (v_project, v_unit, v_ucode, v_vendor, 9301, 'PO/TRIAL/301', 'draft', v_user, v_user)
  returning id into v_po;
  insert into purchase_order_lines (po_id, item_id, quantity, uom, rate, gst_pct, created_by, updated_by)
  values (v_po, v_item, 25, v_uom, 400, 0, v_user, v_user);
  update purchase_orders set status = 'issued', issued_by = v_user, issued_at = now() where id = v_po;
  insert into bills (project_id, unit_id, scope_code, vendor_id, po_id, kind, bill_no, reference,
                     invoice_no, invoice_date, taxable_amount, gst_amount, total_amount, created_by, updated_by)
  values (v_project, v_unit, v_ucode, v_vendor, v_po, 'po', 9301, 'BILL/TRIAL/301',
          'INV-T301', current_date, 10000, 0, 10000, v_user, v_user)
  returning id into v_bill;
  update bills set status = 'approved', approved_by = v_user, approved_at = now() where id = v_bill;

  insert into labour_contracts (vendor_id, project_id, unit_id, description, contract_value, created_by, updated_by)
  values (v_contractor, v_project, v_unit, 'Trial footing', 8000, v_user, v_user)
  returning id into v_wo;
  update labour_contracts set status = 'approved', approved_by = v_user, approved_at = now() where id = v_wo;
  insert into bills (project_id, unit_id, scope_code, vendor_id, labour_contract_id, kind, bill_no, reference,
                     invoice_no, invoice_date, taxable_amount, gst_amount, total_amount, created_by, updated_by)
  values (v_project, v_unit, v_ucode, v_contractor, v_wo, 'contract', 9302, 'BILL/TRIAL/302',
          'PW-T302', current_date, 8000, 0, 8000, v_user, v_user)
  returning id into v_labour_bill;
  update bills set status = 'approved', approved_by = v_user, approved_at = now() where id = v_labour_bill;

  -- The founder becomes a /bills-only person (still a named approver).
  delete from user_apps where user_id = v_user
    and app in ('/purchase-orders', '/reporter', '/supervisors', '/inventory', '/estimator');
  insert into user_apps (user_id, app) values (v_user, '/bills') on conflict do nothing;
  set local role authenticated;

  -- 1. A draft request for this week, with the vendor's bill and an advance.
  insert into cash_requests (week_of, created_by, updated_by)
  values (date_trunc('week', current_date)::date, v_user, v_user) returning id into v_request;
  insert into cash_request_items (cash_request_id, item_kind, bill_id, requested_amount, created_by, updated_by)
  values (v_request, 'bill', v_bill, 10000, v_user, v_user) returning id into v_bill_item;
  insert into cash_request_items (cash_request_id, item_kind, vendor_id, project_id, labour_contract_id, requested_amount, created_by, updated_by)
  values (v_request, 'advance', v_contractor, v_project, v_wo, 3000, v_user, v_user)
  returning id into v_advance_item;
  update cash_request_items set requested_amount = 9500, updated_by = v_user where id = v_bill_item;

  -- 2. Submitted; the approver cuts the bill line to 6,000 and releases.
  update cash_requests set status = 'submitted', submitted_by = v_user, submitted_at = now(), updated_by = v_user
    where id = v_request;
  update cash_request_items set released_amount = 6000, updated_by = v_user where id = v_bill_item;
  update cash_requests set status = 'released', released_by = v_user, released_at = now(), updated_by = v_user
    where id = v_request;
  select released_amount into v_n from cash_request_items where id = v_advance_item;
  if v_n <> 3000 then raise exception 'TRIAL 2 FAILED: the uncut advance released % expected 3000', v_n; end if;

  -- 3. A part-payment of 6,000: the bill stays approved with 4,000 pending.
  insert into bill_payments (bill_id, amount, paid_on, payment_ref, cash_request_item_id, created_by, updated_by)
  values (v_bill, 6000, current_date, 'UTR-T1', v_bill_item, v_user, v_user);
  select status into v_status from bills where id = v_bill;
  if v_status <> 'approved' then raise exception 'TRIAL 3 FAILED: part-paid bill is %', v_status; end if;

  -- 4. Paying more than is pending is refused.
  begin
    insert into bill_payments (bill_id, amount, paid_on, payment_ref, created_by, updated_by)
    values (v_bill, 4001, current_date, 'UTR-T2', v_user, v_user);
    raise exception 'TRIAL 4 FAILED: an overpayment went through';
  exception when others then
    if sqlerrm not like '%more than this bill has pending%' then raise; end if;
  end;

  -- 5. The advance is given, then 3,000 of it recovered against the
  --    contractor's bill; 5,000 more pays that bill — paid by itself.
  insert into contractor_advances (vendor_id, project_id, labour_contract_id, amount, paid_on, payment_ref, cash_request_item_id, created_by, updated_by)
  values (v_contractor, v_project, v_wo, 3000, current_date, 'UTR-ADV', v_advance_item, v_user, v_user)
  returning id into v_advance;
  insert into advance_recoveries (advance_id, bill_id, amount, recovered_on, created_by, updated_by)
  values (v_advance, v_labour_bill, 3000, current_date, v_user, v_user);
  insert into bill_payments (bill_id, amount, paid_on, payment_ref, created_by, updated_by)
  values (v_labour_bill, 5000, current_date, 'UTR-T3', v_user, v_user);
  select status into v_status from bills where id = v_labour_bill;
  if v_status <> 'paid' then raise exception 'TRIAL 5 FAILED: settled bill is %', v_status; end if;

  -- 6. An advance is never recovered from another vendor's bill.
  begin
    insert into advance_recoveries (advance_id, bill_id, amount, recovered_on, created_by, updated_by)
    values (v_advance, v_bill, 1, current_date, v_user, v_user);
    raise exception 'TRIAL 6 FAILED: a recovery crossed contractors';
  exception when others then
    if sqlerrm not like '%same contractor%' and sqlerrm not like '%still to recover%' then raise; end if;
  end;

  -- 7. The week is closed.
  update cash_requests set status = 'closed', updated_by = v_user where id = v_request;
  select status into v_status from cash_requests where id = v_request;
  if v_status <> 'closed' then raise exception 'TRIAL 7 FAILED: request is %', v_status; end if;

  reset role;
  raise notice 'TRIAL B8 OK — the billing team requests, releases and pays under RLS';
end $trial$;
