-- Behaviour trial for 0133 — piece-work billed without a work order, and charges kept apart.
-- Runs inside the dry-run transaction; always rolled back. The billing steps run UNDER ROW-LEVEL
-- SECURITY (BUGCATCHER #19) as the staff account made /bills-only.
--
--   npx tsx scripts/dry-run-migrations.ts --project ipstebqawrvhkyntctrv \
--     supabase/migrations/0133_*.sql --trial scripts/trials/piece-work-and-charges.sql
do $trial$
declare
  v_user uuid := (select id from auth.users where email = 'siddharth.cyriac.99@gmail.com');
  s_user uuid := gen_random_uuid();
  v_project uuid := '041b4401-ab9c-4ee5-b6d7-3443f58dbc6a';
  v_plot uuid;
  v_unit uuid;
  v_ucode text;
  v_vendor uuid := (select id from vendors where not is_contractor and is_active order by name limit 1);
  v_contractor uuid := (select id from vendors where is_contractor and is_active order by name limit 1);
  v_item uuid := (select id from items where kind = 'material' and is_active and default_uom is not null order by code limit 1);
  v_uom text;
  v_work uuid := (select id from work_items where is_active order by code limit 1);
  v_store uuid := (select id from stores where is_active limit 1);
  v_po uuid;
  v_pl uuid;
  v_grn uuid;
  v_log uuid;
  v_rework uuid;
  v_bill uuid;
  v_kind text;
  v_n numeric;
  v_t numeric;
  v_g numeric;
  v_desc text;
  v_refused boolean;
begin
  select default_uom into v_uom from items where id = v_item;
  select p.id, u.id, u.code into v_plot, v_unit, v_ucode
    from plots p join units u on u.plot_id = p.id
    where p.project_id = v_project and u.code is not null limit 1;
  if v_user is null or v_plot is null or v_vendor is null or v_contractor is null or v_item is null then
    raise exception 'TRIAL SETUP: staging is missing an account, a plot, a vendor, a contractor or a material';
  end if;
  insert into auth_verified_sessions (session_id, user_id, method) values (s_user, v_user, 'otp');
  alter table purchase_order_lines drop constraint if exists purchase_order_lines_from_an_indent;

  -- Setup, as the owner: a PO with ₹1,000 of freight at 18% beside one line, issued and received;
  -- two unbilled piece-work entries, one of them rework.
  insert into purchase_orders (project_id, unit_id, scope_code, vendor_id, po_no, reference, status,
    charges_amount, charges_gst_pct, charges_note, created_by, updated_by)
  values (v_project, v_unit, v_ucode, v_vendor, 9301, 'PO/TRIAL/301', 'draft', 1000, 18, 'Freight', v_user, v_user)
  returning id into v_po;
  insert into purchase_order_lines (po_id, item_id, quantity, uom, rate, gst_pct, created_by, updated_by)
  values (v_po, v_item, 10, v_uom, 400, 18, v_user, v_user) returning id into v_pl;
  update purchase_orders set status = 'issued', issued_by = v_user, issued_at = now() where id = v_po;
  insert into goods_receipts (project_id, po_id, store_id, to_site, grn_no, reference, received_at, created_by, updated_by)
  values (v_project, v_po, v_store, false, 9301, 'GRN/TRIAL/301', current_date, v_user, v_user)
  returning id into v_grn;
  insert into goods_receipt_lines (receipt_id, po_line_id, item_id, quantity, uom, created_by, updated_by)
  values (v_grn, v_pl, v_item, 10, v_uom, v_user, v_user);

  insert into labour_logs (plot_id, work_item_id, contractor_id, log_date, kind, masons, helpers, others, quantity, uom, created_by, updated_by)
  values (v_plot, v_work, v_contractor, current_date - 30, 'pw_qty', 0, 0, 0, 2, 'cum', v_user, v_user)
  returning id into v_log;
  insert into labour_logs (plot_id, work_item_id, contractor_id, log_date, kind, masons, helpers, others, quantity, uom, work_class, created_by, updated_by)
  values (v_plot, v_work, v_contractor, current_date - 29, 'pw_qty', 0, 0, 0, 1, 'cum', 'rework', v_user, v_user)
  returning id into v_rework;

  -- 1. A PO's charges count in what was ordered, after a PO is issued its charges are frozen.
  v_refused := false;
  begin
    update purchase_orders set charges_amount = 2000 where id = v_po;
  exception when raise_exception then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 1 FAILED: an issued PO''s charges changed'; end if;

  -- The staff account becomes a /bills-only person.
  delete from user_apps where user_id = v_user;
  insert into user_apps (user_id, app) values (v_user, '/bills');
  insert into bill_approvers (user_id) values (v_user) on conflict do nothing;
  perform set_config('request.jwt.claims', json_build_object('sub', v_user,
    'role', 'authenticated', 'session_id', s_user)::text, true);
  set local role authenticated;

  select ordered_total into v_n from po_billing_totals where po_id = v_po;
  if v_n is distinct from 5900 then
    raise exception 'TRIAL 1 FAILED: ordered % expected 5,900 (4,000 + 18%% and 1,000 + 18%%)', v_n;
  end if;

  -- 2. Piece-work with no work order: a direct labour bill, its lines priced, the rework saying so.
  v_bill := send_labour_logs_to_bill(array[v_log, v_rework], null, 'PW DIRECT T1', current_date,
    jsonb_build_object(v_log::text, jsonb_build_object('rate', 4000, 'gst_pct', 0),
                       v_rework::text, jsonb_build_object('rate', 4000, 'gst_pct', 0)), null, null, null);
  select kind, total_amount into v_kind, v_n from bills where id = v_bill;
  if v_kind <> 'nmr' or v_n <> 12000 then
    raise exception 'TRIAL 2 FAILED: kind % total % expected nmr, 12,000', v_kind, v_n;
  end if;
  select description into v_desc from bill_lines where bill_id = v_bill and labour_log_id = v_rework;
  if v_desc not like '% · Rework' then raise exception 'TRIAL 2 FAILED: the rework line reads "%"', v_desc; end if;
  if exists (select 1 from labour_logs where id in (v_log, v_rework) and bill_id is distinct from v_bill) then
    raise exception 'TRIAL 2 FAILED: the entries were not stamped';
  end if;

  -- 3. Charges on a bill: ₹500 of loading at 18% join the header, and follow an edit.
  update bills set charges_amount = 500, charges_gst_pct = 18, charges_note = 'Loading' where id = v_bill;
  select taxable_amount, gst_amount, total_amount into v_t, v_g, v_n from bills where id = v_bill;
  if (v_t, v_g, v_n) is distinct from (12500::numeric, 90::numeric, 12590::numeric) then
    raise exception 'TRIAL 3 FAILED: taxable % GST % total %, expected 12,500 / 90 / 12,590', v_t, v_g, v_n;
  end if;
  update bills set charges_amount = null, charges_gst_pct = null, charges_note = null where id = v_bill;
  select total_amount into v_n from bills where id = v_bill;
  if v_n <> 12000 then raise exception 'TRIAL 3 FAILED: clearing the charges left %', v_n; end if;

  -- 4. A line change keeps the charges in.
  update bills set charges_amount = 500, charges_gst_pct = 0 where id = v_bill;
  update bill_lines set rate = 5000 where bill_id = v_bill and labour_log_id = v_log;
  select total_amount into v_n from bills where id = v_bill;
  if v_n <> 14500 then raise exception 'TRIAL 4 FAILED: total % expected 14,500', v_n; end if;

  -- 5. Charges are a positive amount with a GST %, or nothing.
  v_refused := false;
  begin
    update bills set charges_amount = 100, charges_gst_pct = null where id = v_bill;
  exception when check_violation then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 5 FAILED: charges without a GST %% were accepted'; end if;

  reset role;
  raise exception 'ALL TRIALS PASSED';
end $trial$;
