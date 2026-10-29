-- Behaviour trial for 0169 — Kaadal Billing. Runs inside the dry-run transaction; always rolled back.
-- UNDER ROW-LEVEL SECURITY: the staff account holding /kaadal-billing alone does the work, the probe
-- (no grant) is refused (BUGCATCHER #19).
--
--   npx tsx scripts/dry-run-migrations.ts --project ipstebqawrvhkyntctrv \
--     supabase/migrations/0169_*.sql --trial scripts/trials/kaadal-billing.sql
do $trial$
declare
  v_staff uuid := (select id from auth.users where email = 'siddharth.cyriac.99@gmail.com');
  v_probe uuid := (select id from auth.users where email = 'siddharth.cyriac.99+probe@gmail.com');
  s_staff uuid := gen_random_uuid();
  s_probe uuid := gen_random_uuid();
  v_vendor uuid;
  v_order uuid;
  v_payment uuid;
  v_rows int;
  v_refused boolean;
begin
  if v_staff is null or v_probe is null then
    raise exception 'TRIAL SETUP: staging is missing the staff or probe account';
  end if;
  insert into auth_verified_sessions (session_id, user_id, method)
  values (s_staff, v_staff, 'otp'), (s_probe, v_probe, 'otp');
  update profiles set role_id = null, role = 'staff' where id in (v_staff, v_probe);
  delete from user_apps where user_id in (v_staff, v_probe);
  insert into user_apps (user_id, app) values (v_staff, '/kaadal-billing'), (v_probe, '/inventory');

  -- 1. The grant adds a vendor, a two-plot order and a payment split across the plots.
  perform set_config('request.jwt.claims', json_build_object('sub', v_staff,
    'role', 'authenticated', 'session_id', s_staff)::text, true);
  set local role authenticated;
  insert into kaadal_billing_vendors (name, bank) values ('Trial Furniture', 'A/C 1') returning id into v_vendor;
  insert into kaadal_billing_orders (vendor_id, plots, gross, split, deduction, deduction_plot, deduction_note)
  values (v_vendor, array['Plot 11', 'Plot 14'], 1000, '{"Plot 11": 600, "Plot 14": 400}', 100, 'Plot 14', 'A lamp')
  returning id into v_order;
  insert into kaadal_billing_payments (order_id, amount, paid_on, paid_by, kind, alloc)
  values (v_order, 500, date '2026-10-28', 'Client', 'Advance', '{"Plot 11": 300, "Plot 14": 200}')
  returning id into v_payment;
  if (select created_by from kaadal_billing_orders where id = v_order) is distinct from v_staff
     or (select updated_by from kaadal_billing_payments where id = v_payment) is distinct from v_staff then
    raise exception 'TRIAL 1 FAILED: the rows do not name who made them';
  end if;

  -- 2. Who made and changed a row is the session's, whatever the screen sends.
  update kaadal_billing_payments set notes = 'edited', updated_by = v_probe, created_by = v_probe,
    created_at = timestamptz '2000-01-01' where id = v_payment;
  if (select updated_by from kaadal_billing_payments where id = v_payment) is distinct from v_staff
     or (select created_by from kaadal_billing_payments where id = v_payment) is distinct from v_staff
     or (select created_at from kaadal_billing_payments where id = v_payment) < timestamptz '2026-01-01' then
    raise exception 'TRIAL 2 FAILED: an edit rewrote who made the row or took the editor sent';
  end if;
  insert into kaadal_billing_vendors (name, created_by) values ('Trial Forged', v_probe);
  if (select created_by from kaadal_billing_vendors where name = 'Trial Forged') is distinct from v_staff then
    raise exception 'TRIAL 2 FAILED: an insert kept a forged created_by';
  end if;

  -- 2b. The sheet's money rules: plot values and split payments that don't add up, a payment marked for a plot
  --     not on its order, and removing a plot a payment is marked for, are all refused.
  v_refused := false;
  begin update kaadal_billing_orders set split = '{"Plot 11": 600, "Plot 14": 300}' where id = v_order;
  exception when check_violation then v_refused := true; end;
  if not v_refused then raise exception 'TRIAL 2b FAILED: plot values short of the order value were kept'; end if;
  v_refused := false;
  begin update kaadal_billing_orders set split = '{"Plot 11": 1000}' where id = v_order;
  exception when check_violation then v_refused := true; end;
  if not v_refused then raise exception 'TRIAL 2b FAILED: plot values missing a plot were kept'; end if;
  v_refused := false;
  begin update kaadal_billing_orders set split = '{"Plot 11": "abc", "Plot 14": 1000}' where id = v_order;
  exception when check_violation then v_refused := true; end;
  if not v_refused then raise exception 'TRIAL 2b FAILED: a plot value that is not a number was kept'; end if;
  update kaadal_billing_orders set gross = 1500, split = '{"Plot 11": 900, "Plot 14": 600}' where id = v_order;
  update kaadal_billing_orders set gross = 1000, split = '{"Plot 11": 600, "Plot 14": 400}' where id = v_order;
  v_refused := false;
  begin update kaadal_billing_payments set alloc = '{"Plot 11": 300, "Plot 14": 100}' where id = v_payment;
  exception when check_violation then v_refused := true; end;
  if not v_refused then raise exception 'TRIAL 2b FAILED: a split payment short of its amount was kept'; end if;
  v_refused := false;
  begin update kaadal_billing_payments set alloc = '{"Plot 24": 500}' where id = v_payment;
  exception when check_violation then v_refused := true; end;
  if not v_refused then raise exception 'TRIAL 2b FAILED: a payment marked for a plot not on its order was kept'; end if;
  v_refused := false;
  begin update kaadal_billing_orders set plots = array['Plot 11'], split = '{}' where id = v_order;
  exception when check_violation then v_refused := true; end;
  if not v_refused then raise exception 'TRIAL 2b FAILED: a plot left the order with a payment marked for it'; end if;
  update kaadal_billing_orders set plots = array['Plot 11', 'Plot 14', 'Plot 24'], split = '{}' where id = v_order;
  update kaadal_billing_orders set plots = array['Plot 11', 'Plot 14'], split = '{"Plot 11": 600, "Plot 14": 400}'
  where id = v_order;
  v_refused := false;
  begin insert into kaadal_billing_orders (vendor_id, plots, gross) values (v_vendor, array['Plot 1', null], 10);
  exception when check_violation then v_refused := true; end;
  if not v_refused then raise exception 'TRIAL 2b FAILED: a blank (null) plot was kept'; end if;
  v_refused := false;
  begin insert into kaadal_billing_orders (vendor_id, plots, gross) values (v_vendor, array['Plot 1', 'Plot 1'], 10);
  exception when check_violation then v_refused := true; end;
  if not v_refused then raise exception 'TRIAL 2b FAILED: a plot named twice was kept'; end if;

  -- 3. The database refuses a deduction as large as the order, one on a plot not on it, a second vendor of the
  --    same name, a blank plot and a payment of nothing.
  v_refused := false;
  begin update kaadal_billing_orders set deduction = 1000 where id = v_order;
  exception when check_violation then v_refused := true; end;
  if not v_refused then raise exception 'TRIAL 3 FAILED: a deduction as large as the order was kept'; end if;
  v_refused := false;
  begin update kaadal_billing_orders set deduction_plot = 'Plot 24' where id = v_order;
  exception when check_violation then v_refused := true; end;
  if not v_refused then raise exception 'TRIAL 3 FAILED: a deduction on a plot not on the order was kept'; end if;
  v_refused := false;
  begin insert into kaadal_billing_vendors (name) values ('trial furniture');
  exception when unique_violation then v_refused := true; end;
  if not v_refused then raise exception 'TRIAL 3 FAILED: a vendor named twice was kept'; end if;
  v_refused := false;
  begin insert into kaadal_billing_orders (vendor_id, plots, gross) values (v_vendor, array[''], 10);
  exception when check_violation then v_refused := true; end;
  if not v_refused then raise exception 'TRIAL 3 FAILED: a blank plot was kept'; end if;
  v_refused := false;
  begin insert into kaadal_billing_payments (order_id, amount, kind) values (v_order, 0, 'Advance');
  exception when check_violation then v_refused := true; end;
  if not v_refused then raise exception 'TRIAL 3 FAILED: a payment of nothing was kept'; end if;

  -- 4. A vendor with an order cannot be deleted.
  v_refused := false;
  begin delete from kaadal_billing_vendors where id = v_vendor;
  exception when foreign_key_violation then v_refused := true; end;
  if not v_refused then raise exception 'TRIAL 4 FAILED: a vendor with an order was deleted'; end if;

  -- 5. Someone without the grant sees nothing and changes nothing.
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_probe,
    'role', 'authenticated', 'session_id', s_probe)::text, true);
  set local role authenticated;
  if not (select has_app('/inventory')) then
    raise exception 'TRIAL SETUP: the probe''s session is not live, so seeing nothing proves nothing';
  end if;
  if exists (select 1 from kaadal_billing_vendors) or exists (select 1 from kaadal_billing_orders)
     or exists (select 1 from kaadal_billing_payments) then
    raise exception 'TRIAL 5 FAILED: a person without the grant reads the ledger';
  end if;
  update kaadal_billing_payments set amount = 1 where id = v_payment;
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then raise exception 'TRIAL 5 FAILED: a person without the grant changed a payment'; end if;
  delete from kaadal_billing_orders where id = v_order;
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then raise exception 'TRIAL 5 FAILED: a person without the grant changed the ledger'; end if;
  v_refused := false;
  begin insert into kaadal_billing_vendors (name) values ('Probe Vendor');
  exception when insufficient_privilege then v_refused := true; end;
  if not v_refused then raise exception 'TRIAL 5 FAILED: a person without the grant added a vendor'; end if;
  v_refused := false;
  begin insert into kaadal_billing_payments (order_id, amount, kind) values (v_order, 1, 'Advance');
  exception when insufficient_privilege then v_refused := true; end;
  if not v_refused then raise exception 'TRIAL 5 FAILED: a person without the grant added a payment'; end if;

  -- 5b. The grant on a session that never passed the emailed code reads and writes nothing.
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_staff,
    'role', 'authenticated', 'session_id', gen_random_uuid())::text, true);
  set local role authenticated;
  if exists (select 1 from kaadal_billing_orders) then
    raise exception 'TRIAL 5b FAILED: an unverified session reads the ledger';
  end if;
  v_refused := false;
  begin insert into kaadal_billing_vendors (name) values ('Unverified Vendor');
  exception when insufficient_privilege then v_refused := true; end;
  if not v_refused then raise exception 'TRIAL 5b FAILED: an unverified session added a vendor'; end if;

  -- 6. The grant deletes the order, and its payments go with it; then the vendor can go.
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_staff,
    'role', 'authenticated', 'session_id', s_staff)::text, true);
  set local role authenticated;
  delete from kaadal_billing_orders where id = v_order;
  if exists (select 1 from kaadal_billing_payments where id = v_payment) then
    raise exception 'TRIAL 6 FAILED: the payment outlived its order';
  end if;
  delete from kaadal_billing_vendors where id = v_vendor;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then raise exception 'TRIAL 6 FAILED: the vendor with no orders was not deleted'; end if;

  -- 7. Every change was audited, the cascaded delete included.
  reset role;
  if (select count(*) from audit_log where row_id = v_payment) < 3 then
    raise exception 'TRIAL 7 FAILED: the payment''s insert, edit and delete were not all audited';
  end if;

  raise exception 'ALL TRIALS PASSED';
end $trial$;
