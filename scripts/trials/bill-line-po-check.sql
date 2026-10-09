-- Behaviour trial for 0111. Runs inside the dry-run transaction; always rolled back.
--
-- Unlike erp-chain.sql, the line is written UNDER ROW-LEVEL SECURITY
-- (set local role authenticated): a trial run as the database owner
-- bypasses every policy, which is how 0106's guard passed review while
-- refusing the billing team. The founder's staging account is made a
-- /bills-only person for the length of the transaction.
do $trial$
declare
  v_user uuid := (select id from auth.users where email = 'siddharth.cyriac.99@gmail.com');
  v_project uuid := '041b4401-ab9c-4ee5-b6d7-3443f58dbc6a';
  v_unit uuid;
  v_ucode text;
  v_vendor uuid := (select id from vendors where not is_contractor order by name limit 1);
  v_item uuid := (select id from items where code = 'CVL/08');
  v_uom text := (select default_uom from items where code = 'CVL/08');
  v_po uuid;
  v_pl uuid;
  v_bill uuid;
  v_n numeric;
  v_seen int;
begin
  select u.id, u.code into v_unit, v_ucode
    from plots p join units u on u.plot_id = p.id
    where p.project_id = v_project and u.code is not null limit 1;

  -- As the owner: an issued PO with one line, and a bill recorded against it.
  insert into purchase_orders (project_id, unit_id, scope_code, vendor_id, po_no, reference, status, created_by, updated_by)
  values (v_project, v_unit, v_ucode, v_vendor, 9101, 'PO/TRIAL/101', 'draft', v_user, v_user)
  returning id into v_po;
  insert into purchase_order_lines (po_id, item_id, quantity, uom, rate, gst_pct, created_by, updated_by)
  values (v_po, v_item, 50, v_uom, 400, 18, v_user, v_user) returning id into v_pl;
  update purchase_orders set status = 'issued', issued_by = v_user, issued_at = now() where id = v_po;
  insert into bills (project_id, unit_id, scope_code, vendor_id, po_id, kind, bill_no, reference,
                     invoice_no, invoice_date, taxable_amount, gst_amount, total_amount, created_by, updated_by)
  values (v_project, v_unit, v_ucode, v_vendor, v_po, 'po', 9101, 'BILL/TRIAL/101',
          'INV-T101', current_date, 1, 0, 1, v_user, v_user)
  returning id into v_bill;

  -- The founder becomes a /bills-only person, inside this transaction.
  delete from user_apps where user_id = v_user and app in ('/purchase-orders', '/reporter');
  insert into user_apps (user_id, app) values (v_user, '/bills') on conflict do nothing;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- 1. Under RLS the PO line itself is hidden from a /bills-only person…
  select count(*) into v_seen from purchase_order_lines where id = v_pl;
  if v_seen <> 0 then
    raise exception 'TRIAL SETUP: a /bills-only person should not see the PO line (saw %)', v_seen;
  end if;
  -- …but the billing window shows it.
  select count(*) into v_seen from po_line_billing_facts where po_line_id = v_pl;
  if v_seen <> 1 then
    raise exception 'TRIAL SETUP: po_line_billing_facts shows % rows of the PO line, expected 1', v_seen;
  end if;

  -- 2. The material line goes on the bill, and the header follows it.
  insert into bill_lines (bill_id, line_kind, po_line_id, item_id, description, uom, quantity, rate, gst_pct, created_by, updated_by)
  values (v_bill, 'material', v_pl, v_item, 'Cement', v_uom, 2, 4000, 0, v_user, v_user);
  select total_amount into v_n from bills where id = v_bill;
  if v_n <> 8000 then
    raise exception 'TRIAL 2 FAILED: 2 x 4000 gave %', v_n;
  end if;

  reset role;
  raise notice 'TRIAL 0111 OK — a /bills-only person bills a PO line';
end $trial$;
