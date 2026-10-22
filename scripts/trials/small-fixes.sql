-- Behaviour trial for 0132 — urgent indents, deduction rows, the work class and the GRN's invoice.
-- Runs inside the dry-run transaction; always rolled back. The labour and request steps run UNDER
-- ROW-LEVEL SECURITY (BUGCATCHER #19), as the staff account made /supervisors-only, then
-- /inventory-only; the trigger-only steps run as the owner, whom triggers still bind.
--
--   npx tsx scripts/dry-run-migrations.ts --project ipstebqawrvhkyntctrv \
--     supabase/migrations/0132_*.sql --trial scripts/trials/small-fixes.sql
do $trial$
declare
  v_user uuid := (select id from auth.users where email = 'siddharth.cyriac.99@gmail.com');
  s_user uuid := gen_random_uuid();
  v_plot uuid := (select p.id from plots p join units u on u.plot_id = p.id limit 1);
  v_work uuid := (select id from work_items where is_active order by code limit 1);
  v_contractor uuid := (select id from vendors where is_contractor and is_active order by name limit 1);
  v_item uuid := (select id from items where kind = 'material' and is_active order by code limit 1);
  v_bill uuid := (select id from bills order by created_at limit 1);
  v_indent uuid := (select id from indents where status <> 'draft' limit 1);
  v_receipt uuid := (select id from goods_receipts limit 1);
  v_log uuid;
  v_billed uuid;
  v_request uuid;
  v_refused boolean;
begin
  if v_user is null or v_plot is null or v_work is null or v_contractor is null or v_item is null then
    raise exception 'TRIAL SETUP: staging is missing the staff account, a plot, a work, a contractor or a material';
  end if;
  insert into auth_verified_sessions (session_id, user_id, method) values (s_user, v_user, 'otp');

  -- A billed entry to try to change: stamped as the owner, the way Send to Bill would.
  if v_bill is not null then
    perform set_config('toolbox.labour_billing', 'on', true);
    insert into labour_logs (plot_id, work_item_id, contractor_id, log_date, kind, masons, helpers, others, created_by, updated_by)
    values (v_plot, v_work, v_contractor, current_date - 40, 'nmr', 1, 1, 0, v_user, v_user)
    returning id into v_billed;
    update labour_logs set bill_id = v_bill where id = v_billed;
    perform set_config('toolbox.labour_billing', '', true);
  end if;

  -- The staff account becomes a /supervisors-only person.
  delete from user_apps where user_id = v_user;
  insert into user_apps (user_id, app) values (v_user, '/supervisors');
  perform set_config('request.jwt.claims', json_build_object('sub', v_user,
    'role', 'authenticated', 'session_id', s_user)::text, true);
  set local role authenticated;

  -- 1. The standard gang and a rework gang log the same work on the same day, separately.
  insert into labour_logs (plot_id, work_item_id, contractor_id, log_date, kind, masons, helpers, others, work_class, created_by, updated_by)
  values (v_plot, v_work, v_contractor, current_date - 41, 'nmr', 2, 1, 0, 'standard', v_user, v_user)
  returning id into v_log;
  insert into labour_logs (plot_id, work_item_id, contractor_id, log_date, kind, masons, helpers, others, work_class, created_by, updated_by)
  values (v_plot, v_work, v_contractor, current_date - 41, 'nmr', 1, 0, 0, 'rework', v_user, v_user);
  v_refused := false;
  begin
    insert into labour_logs (plot_id, work_item_id, contractor_id, log_date, kind, masons, helpers, others, work_class, created_by, updated_by)
    values (v_plot, v_work, v_contractor, current_date - 41, 'nmr', 3, 0, 0, 'standard', v_user, v_user);
  exception when unique_violation then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 1 FAILED: a second standard entry for the day was accepted'; end if;

  v_refused := false;
  begin
    update labour_logs set work_class = 'repair' where id = v_log;
  exception when check_violation then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 1 FAILED: an unknown work class was accepted'; end if;

  -- 2. A billed entry's class is frozen with the rest of it.
  if v_billed is not null then
    v_refused := false;
    begin
      update labour_logs set work_class = 'rework' where id = v_billed;
    exception when raise_exception then v_refused := true;
    end;
    if not v_refused then raise exception 'TRIAL 2 FAILED: a billed entry''s class changed'; end if;
  end if;

  -- 3. A request carries its class; the store cannot rewrite it while declining.
  insert into issue_requests (plot_id, work_item_id, item_id, quantity, status, work_class, created_by, updated_by)
  values (v_plot, v_work, v_item, 5, 'requested', 'additional', v_user, v_user)
  returning id into v_request;
  update issue_requests set work_class = 'rework' where id = v_request;

  reset role;
  delete from user_apps where user_id = v_user;
  insert into user_apps (user_id, app) values (v_user, '/inventory');
  set local role authenticated;
  v_refused := false;
  begin
    update issue_requests set status = 'declined', declined_reason = 'Trial', work_class = 'standard'
     where id = v_request;
  exception when raise_exception then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 3 FAILED: declining rewrote the class'; end if;
  update issue_requests set status = 'declined', declined_reason = 'Trial' where id = v_request;
  reset role;

  -- 4. An urgent mark is a draft's to set (indents_guard freezes the header after it).
  if v_indent is not null then
    v_refused := false;
    begin
      update indents set is_urgent = true where id = v_indent;
    exception when raise_exception then v_refused := true;
    end;
    if not v_refused then raise exception 'TRIAL 4 FAILED: a submitted indent was marked urgent'; end if;
  end if;

  -- 5. A delivery's invoice number is editable like its challan, and never blank.
  if v_receipt is not null then
    update goods_receipts set invoice_no = 'INV-TRIAL-1', invoice_date = current_date where id = v_receipt;
    v_refused := false;
    begin
      update goods_receipts set invoice_no = '   ' where id = v_receipt;
    exception when check_violation then v_refused := true;
    end;
    if not v_refused then raise exception 'TRIAL 5 FAILED: a blank invoice number was accepted'; end if;
  end if;

  raise exception 'ALL TRIALS PASSED';
end $trial$;
