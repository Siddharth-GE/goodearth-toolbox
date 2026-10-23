-- Behaviour trial for 0142 — the red button. Runs after the seed inside the dry-run transaction; always rolled back.
--
--   npx tsx scripts/dry-run-migrations.ts --project ipstebqawrvhkyntctrv \
--     supabase/migrations/0142_*.sql scripts/seed-test-project.sql --trial scripts/trials/test-project-delete.sql
do $trial$
declare
  v_admin uuid := (select id from auth.users where email = 'siddharth@goodearthkannur.org');
  v_staff uuid := (select id from auth.users where email = 'siddharth.cyriac.99@gmail.com');
  v_session uuid := gen_random_uuid();
  v_test uuid := (select id from projects where is_test);
  v_real uuid := (select id from projects where code = 'SAAVILLA');
  v_before jsonb;
  v_after jsonb;
  v_result jsonb;
  v_refused text;
  v_po uuid;
  v_line uuid;
  v_disabled int;
begin
  if v_admin is null or v_staff is null or v_test is null or v_real is null then
    raise exception 'TRIAL SETUP: the admin, the staff account, the seeded test project or Saarang is missing';
  end if;
  -- Everything outside the test project, counted before.
  select jsonb_object_agg(t, n) into v_before from (
    select 'indents' t, count(*) n from indents where project_id <> v_test union all
    select 'purchase_orders', count(*) from purchase_orders where project_id <> v_test union all
    select 'site_stages', count(*) from site_stages where plot_id not in (select id from plots where project_id = v_test) union all
    select 'drawing_revisions', count(*) from drawing_revisions where unit_id not in (select id from units where project_id = v_test) union all
    select 'items', count(*) from items union all
    select 'vendors', count(*) from vendors union all
    select 'stores', count(*) from stores where project_id is distinct from v_test union all
    select 'projects', count(*) from projects where not is_test) x;

  insert into auth_verified_sessions (session_id, user_id, method) values (v_session, v_staff, 'otp');
  insert into auth_verified_sessions (session_id, user_id, method)
  values (gen_random_uuid(), v_admin, 'otp');

  -- 1. Not an admin: refused.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_staff, 'role', 'authenticated', 'session_id', v_session)::text, true);
  set local role authenticated;
  v_refused := null;
  begin
    perform delete_test_project(v_test);
  exception when others then v_refused := sqlerrm;
  end;
  if v_refused is null or v_refused not like 'Only an admin%' then
    raise exception 'TRIAL 1 FAILED: a staff account got %', coalesce(v_refused, 'through');
  end if;
  reset role;

  -- As the admin from here.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated',
      'session_id', (select session_id from auth_verified_sessions where user_id = v_admin order by created_at desc limit 1))::text, true);
  set local role authenticated;

  -- 2. A real project: refused.
  v_refused := null;
  begin
    perform delete_test_project(v_real);
  exception when others then v_refused := sqlerrm;
  end;
  if v_refused is null or v_refused not like '%not marked as a test project%' then
    raise exception 'TRIAL 2 FAILED: Saarang got %', coalesce(v_refused, 'through');
  end if;
  reset role;

  -- 3. A real PO that gathered a test indent line: refused, and nothing deleted.
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
    raise exception 'TRIAL 3 FAILED: a tangled project got %', coalesce(v_refused, 'deleted');
  end if;
  if not exists (select 1 from projects where id = v_test) then
    raise exception 'TRIAL 3 FAILED: the refusal still deleted the project';
  end if;
  delete from purchase_order_lines where po_id = v_po;
  delete from purchase_orders where id = v_po;

  -- 4. The admin deletes the test project: all of it gone, nothing else touched, every guard back on.
  set local role authenticated;
  v_result := delete_test_project(v_test);
  reset role;
  if exists (select 1 from projects where id = v_test)
     or exists (select 1 from plots where project_id = v_test)
     or exists (select 1 from estimator_estimates where project_id = v_test)
     or exists (select 1 from indents where project_id = v_test)
     or exists (select 1 from goods_receipts where project_id = v_test)
     or exists (select 1 from bills where project_id = v_test) then
    raise exception 'TRIAL 4 FAILED: test rows left after %', v_result;
  end if;
  select jsonb_object_agg(t, n) into v_after from (
    select 'indents' t, count(*) n from indents where project_id <> v_test union all
    select 'purchase_orders', count(*) from purchase_orders where project_id <> v_test union all
    select 'site_stages', count(*) from site_stages where plot_id not in (select id from plots where project_id = v_test) union all
    select 'drawing_revisions', count(*) from drawing_revisions where unit_id not in (select id from units where project_id = v_test) union all
    select 'items', count(*) from items union all
    select 'vendors', count(*) from vendors union all
    select 'stores', count(*) from stores where project_id is distinct from v_test union all
    select 'projects', count(*) from projects where not is_test) x;
  if v_after is distinct from v_before then
    raise exception 'TRIAL 4 FAILED: rows outside the test project changed: % → %', v_before, v_after;
  end if;
  select count(*) into v_disabled from pg_trigger t join pg_class c on c.oid = t.tgrelid
   where c.relnamespace = 'public'::regnamespace and not t.tgisinternal and t.tgenabled = 'D';
  if v_disabled > 0 then
    raise exception 'TRIAL 4 FAILED: % guards left switched off', v_disabled;
  end if;

  raise exception 'ALL TRIALS PASSED: %', v_result;
end $trial$;
