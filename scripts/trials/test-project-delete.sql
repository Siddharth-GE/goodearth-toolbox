-- Behaviour trial for 0142 — the red button. Runs after the seed inside the dry-run transaction; always rolled back.
--
--   npx tsx scripts/dry-run-migrations.ts --project ipstebqawrvhkyntctrv supabase/migrations/0142_*.sql \
--     scripts/trials/test-project-before.sql scripts/seed-test-project.sql --trial scripts/trials/test-project-delete.sql
do $trial$
declare
  v_admin uuid := (select id from auth.users where email = 'siddharth@goodearthkannur.org');
  v_staff uuid := (select id from auth.users where email = 'siddharth.cyriac.99@gmail.com');
  v_staff_session uuid := gen_random_uuid();
  v_admin_session uuid := gen_random_uuid();
  v_test uuid := (select id from projects where is_test);
  v_real uuid := (select id from projects where code = 'SAAVILLA');
  v_result jsonb;
  v_refused text;
  v_po uuid;
  v_line uuid;
  v_disabled int;
  v_t text;
  v_n bigint;
  v_diff text := '';
  v_started timestamptz;
  v_audited bigint;
begin
  if v_admin is null or v_staff is null or v_test is null or v_real is null then
    raise exception 'TRIAL SETUP: the admin, the staff account, the seeded test project or Saarang is missing';
  end if;
  insert into auth_verified_sessions (session_id, user_id, method) values (v_staff_session, v_staff, 'otp');
  insert into auth_verified_sessions (session_id, user_id, method) values (v_admin_session, v_admin, 'otp');
  create temp table trial_staff_apps on commit drop as select * from user_apps where user_id = v_staff;
  delete from user_apps where user_id = v_staff;
  insert into user_apps (user_id, app) values (v_staff, '/masters');

  -- 1. Not an admin: refused. 2. A /masters holder cannot mark a real project as test.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_staff, 'role', 'authenticated', 'session_id', v_staff_session)::text, true);
  set local role authenticated;
  v_refused := null;
  begin
    perform delete_test_project(v_test);
  exception when others then v_refused := sqlerrm;
  end;
  if v_refused is null or v_refused not like 'Only an admin%' then
    raise exception 'TRIAL 1 FAILED: a staff account got %', coalesce(v_refused, 'through');
  end if;
  v_refused := null;
  begin
    update projects set is_test = true where id = v_real;
  exception when others then v_refused := sqlerrm;
  end;
  if v_refused is null or v_refused not like 'Only the seed script%' then
    raise exception 'TRIAL 2 FAILED: a Masters holder marking Saarang as test got %', coalesce(v_refused, 'through');
  end if;
  reset role;

  -- As the admin from here.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_admin_session)::text, true);

  -- 3. A real project: refused.
  set local role authenticated;
  v_refused := null;
  begin
    perform delete_test_project(v_real);
  exception when others then v_refused := sqlerrm;
  end;
  reset role;
  if v_refused is null or v_refused not like '%not marked as a test project%' then
    raise exception 'TRIAL 3 FAILED: Saarang got %', coalesce(v_refused, 'through');
  end if;

  -- 4. A real PO that gathered a test indent line: refused, and nothing deleted.
  select id into v_line from indent_lines where indent_id in (select id from indents where project_id = v_test) limit 1;
  alter table purchase_order_lines disable trigger user;
  insert into purchase_orders (project_id, scope_code, vendor_id, po_no, reference, status)
  values (v_real, 'GEN', (select vendor_id from purchase_orders where project_id = v_test limit 1), 99001, 'PO/TRIAL/TANGLE', 'draft')
  returning id into v_po;
  insert into purchase_order_lines (po_id, item_id, quantity, uom, indent_line_id)
  select v_po, item_id, 1, uom, id from indent_lines where id = v_line;
  alter table purchase_order_lines enable trigger user;
  set local role authenticated;
  v_refused := null;
  begin
    perform delete_test_project(v_test);
  exception when others then v_refused := sqlerrm;
  end;
  reset role;
  if v_refused is null or v_refused not like '%Nothing was deleted%' then
    raise exception 'TRIAL 4 FAILED: a tangled project got %', coalesce(v_refused, 'deleted');
  end if;
  if not exists (select 1 from projects where id = v_test) then
    raise exception 'TRIAL 4 FAILED: the refusal still deleted the project';
  end if;
  alter table purchase_order_lines disable trigger user;
  delete from purchase_order_lines where po_id = v_po;
  alter table purchase_order_lines enable trigger user;
  delete from purchase_orders where id = v_po;
  delete from po_counters where project_id = v_real and scope = 'GEN' and last_no = 99001;

  -- 5. The admin deletes it under the app's own time limits: every table is back to its count before the seed, the
  --    budgeting rates add up as before, every guard is back on, and the delete is in the audit log.
  select count(*) into v_audited from audit_log where table_name = 'purchase_orders' and lower(action) = 'delete';
  set local role authenticated;
  set local statement_timeout = '8s';
  set local lock_timeout = '8s';
  v_started := clock_timestamp();
  v_result := delete_test_project(v_test);
  reset statement_timeout;
  reset lock_timeout;
  reset role;
  delete from user_apps where user_id = v_staff;
  insert into user_apps select * from trial_staff_apps;
  for v_t in select t from trial_counts_before where t <> 'items.indicative_price' loop
    execute format('select count(*) from %I', v_t) into v_n;
    if v_n <> (select n from trial_counts_before where t = v_t) then
      v_diff := v_diff || format('%s %s→%s; ', v_t, (select n from trial_counts_before where t = v_t), v_n);
    end if;
  end loop;
  if v_diff <> '' then
    raise exception 'TRIAL 5 FAILED: tables differ from before the seed: %', v_diff;
  end if;
  if (select sum(indicative_price) from items) is distinct from
     (select prices from trial_counts_before where t = 'items.indicative_price') then
    raise exception 'TRIAL 5 FAILED: the budgeting rates moved';
  end if;
  select count(*) into v_disabled from pg_trigger t join pg_class c on c.oid = t.tgrelid
   where c.relnamespace = 'public'::regnamespace and not t.tgisinternal and t.tgenabled = 'D';
  if v_disabled > 0 then
    raise exception 'TRIAL 5 FAILED: % guards left switched off', v_disabled;
  end if;
  if (select count(*) from audit_log where table_name = 'purchase_orders' and lower(action) = 'delete') <= v_audited then
    raise exception 'TRIAL 5 FAILED: the delete left nothing in the audit log';
  end if;

  raise exception 'ALL TRIALS PASSED in % ms: %', round(extract(epoch from clock_timestamp() - v_started) * 1000), v_result;
end $trial$;
