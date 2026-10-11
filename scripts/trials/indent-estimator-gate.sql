-- Behaviour trial for 0113 — indents wait for the estimator, PO lines
-- come from indents. Runs inside the dry-run transaction; always rolled
-- back.
--
-- Everything after the setup runs UNDER ROW-LEVEL SECURITY (set local
-- role authenticated) as one person holding ONE grant at a time — the
-- staff Siddharth account (the gmail one, not the founder's admin login),
-- made an indent approver and stripped of any role bundle inside this
-- transaction. A trial run as the database owner bypasses every policy
-- (BUGCATCHER #19).
--
--   npx tsx scripts/dry-run-migrations.ts --project ipstebqawrvhkyntctrv \
--     supabase/migrations/0113_*.sql \
--     --trial scripts/trials/indent-estimator-gate.sql
do $trial$
declare
  v_user uuid := (select id from auth.users where email = 'siddharth.cyriac.99@gmail.com');
  v_project uuid := '041b4401-ab9c-4ee5-b6d7-3443f58dbc6a';
  v_unit uuid;
  v_ucode text;
  v_work uuid := (select id from work_items where code = 'FD.15');
  v_on uuid := (select id from items where code = 'CVL/08');
  v_on_uom text := (select default_uom from items where code = 'CVL/08');
  v_off uuid;
  v_off_uom text;
  v_vendor uuid := (select id from vendors where not is_contractor order by name limit 1);
  v_estimate uuid;
  v_indent uuid;
  v_direct uuid;
  v_po uuid;
  v_text text;
  v_refused boolean;
begin
  if v_user is null or v_work is null or v_on is null or v_vendor is null then
    raise exception 'TRIAL SETUP: the staff account, FD.15, CVL/08 or a vendor is missing on staging';
  end if;
  select id, default_uom into v_off, v_off_uom from items
   where id <> v_on and default_uom is not null and is_active order by code limit 1;

  -- Setup, as the owner. A villa with no official estimate gets one,
  -- listing CVL/08 under FD.15 (the frozen-snapshot trigger is set aside
  -- for the two fixture rows only).
  select u.id, u.code into v_unit, v_ucode
    from units u join plots p on p.id = u.plot_id
   where p.project_id = v_project and u.code is not null
     and not exists (select 1 from estimator_estimates e
                      where e.unit_id = u.id and e.status = 'submitted')
   limit 1;
  if v_unit is null then
    raise exception 'TRIAL SETUP: every Saarang villa already has an official estimate';
  end if;
  insert into estimator_estimates (project_id, unit_id, name, status, reference, submitted_at)
  values (v_project, v_unit, 'Trial official', 'submitted', 'EST/TRIAL/113', now())
  returning id into v_estimate;
  alter table estimator_estimate_takeoff disable trigger estimator_snapshot_frozen;
  insert into estimator_estimate_takeoff (estimate_id, work_item_id, item_id, material_name, uom, quantity)
  values (v_estimate, v_work, v_on, 'Trial cement', v_on_uom, 100);
  alter table estimator_estimate_takeoff enable trigger estimator_snapshot_frozen;

  update profiles set role_id = null where id = v_user;
  delete from user_apps where user_id = v_user;
  insert into user_apps (user_id, app) values (v_user, '/indents');
  insert into indent_approvers (user_id) values (v_user) on conflict do nothing;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- 1. An /indents person raises an indent on the villa for FD.15.
  v_indent := create_indent(v_project, null, v_unit, null, null, 'Trial 0113');
  update indents set work_item_id = v_work, updated_by = v_user where id = v_indent;

  -- 2. A direct line goes in; a false estimate anchor does not.
  insert into indent_lines (indent_id, item_id, quantity, uom, created_by, updated_by)
  values (v_indent, v_off, 5, v_off_uom, v_user, v_user) returning id into v_direct;
  v_refused := false;
  begin
    insert into indent_lines (indent_id, item_id, quantity, uom, estimate_id, created_by, updated_by)
    values (v_indent, v_off, 5, v_off_uom, v_estimate, v_user, v_user);
  exception when others then
    v_refused := sqlerrm like '%not on this villa''s official estimate%';
  end;
  if not v_refused then raise exception 'TRIAL 2 FAILED: a false estimate anchor was accepted'; end if;
  insert into indent_lines (indent_id, item_id, quantity, uom, estimate_id, created_by, updated_by)
  values (v_indent, v_on, 40, v_on_uom, v_estimate, v_user, v_user);

  -- 3. The site team cannot write the estimator's answer themselves.
  v_refused := false;
  begin
    update indent_lines set estimator_decision = 'approved', estimator_decided_at = now()
     where id = v_direct;
  exception when others then
    v_refused := sqlerrm like '%Only the estimator answers%';
  end;
  if not v_refused then raise exception 'TRIAL 3 FAILED: an /indents person wrote the answer'; end if;

  -- 4. No reason, no submit; with one, it submits.
  v_refused := false;
  begin
    update indents set status = 'submitted', submitted_by = v_user, submitted_at = now()
     where id = v_indent;
  exception when others then
    v_refused := sqlerrm like '%Say why each line outside the estimate%';
  end;
  if not v_refused then raise exception 'TRIAL 4 FAILED: submitted without a reason'; end if;
  update indent_lines set off_estimate_reason = 'Extra for the sump', updated_by = v_user
   where id = v_direct;
  update indents set status = 'submitted', submitted_by = v_user, submitted_at = now()
   where id = v_indent;

  -- 5. The approver cannot approve before the estimator; the /indents
  --    person cannot answer for the estimator.
  v_refused := false;
  begin
    update indents set status = 'approved', approved_by = v_user, approved_at = now()
     where id = v_indent;
  exception when others then
    v_refused := sqlerrm like '%estimator has not approved%';
  end;
  if not v_refused then raise exception 'TRIAL 5 FAILED: approved before the estimator'; end if;
  v_refused := false;
  begin
    perform decide_indent_line(v_direct, 'approved', null);
  exception when others then
    v_refused := sqlerrm like '%Only someone with the Estimator%';
  end;
  if not v_refused then raise exception 'TRIAL 5 FAILED: an /indents person answered'; end if;

  -- 6. The estimator (only /estimator) refuses — a note is required.
  reset role;
  delete from user_apps where user_id = v_user;
  insert into user_apps (user_id, app) values (v_user, '/estimator');
  set local role authenticated;
  v_refused := false;
  begin
    perform decide_indent_line(v_direct, 'refused', '  ');
  exception when others then
    v_refused := sqlerrm like '%Say why it is refused%';
  end;
  if not v_refused then raise exception 'TRIAL 6 FAILED: refused without a note'; end if;
  perform decide_indent_line(v_direct, 'refused', 'Use the stock in Farm Store');
  select estimator_decision into v_text from indent_lines
   where id = v_direct and estimator_decided_by = v_user and estimator_note is not null;
  if v_text is distinct from 'refused' then
    raise exception 'TRIAL 6 FAILED: the refusal reads %', v_text;
  end if;
  -- The estimator's write reached nothing else on the line.
  if (select quantity from indent_lines where id = v_direct) <> 5 then
    raise exception 'TRIAL 6 FAILED: the answer moved the quantity';
  end if;

  -- 7. Refused: the approver still cannot approve, and sends it back.
  reset role;
  delete from user_apps where user_id = v_user;
  insert into user_apps (user_id, app) values (v_user, '/indents');
  set local role authenticated;
  v_refused := false;
  begin
    update indents set status = 'approved', approved_by = v_user, approved_at = now()
     where id = v_indent;
  exception when others then
    v_refused := sqlerrm like '%estimator has not approved%';
  end;
  if not v_refused then raise exception 'TRIAL 7 FAILED: approved over a refusal'; end if;
  update indents
     set status = 'draft', rejection_note = 'See the estimator''s note',
         submitted_by = null, submitted_at = null
   where id = v_indent;

  -- 8. Back in draft the answer stands until the line changes; a new
  --    quantity empties it.
  update indent_lines set note = 'checked', updated_by = v_user where id = v_direct;
  if (select estimator_decision from indent_lines where id = v_direct) is distinct from 'refused' then
    raise exception 'TRIAL 8 FAILED: a note edit emptied the answer';
  end if;
  update indent_lines set quantity = 3, updated_by = v_user where id = v_direct;
  if (select estimator_decision from indent_lines where id = v_direct) is not null then
    raise exception 'TRIAL 8 FAILED: a new quantity kept the old answer';
  end if;
  update indents
     set status = 'submitted', submitted_by = v_user, submitted_at = now(), rejection_note = null
   where id = v_indent;

  -- 9. The estimator approves; then the approver approves; then the
  --    estimator can no longer answer.
  reset role;
  delete from user_apps where user_id = v_user;
  insert into user_apps (user_id, app) values (v_user, '/estimator');
  set local role authenticated;
  perform decide_indent_line(v_direct, 'approved', null);
  reset role;
  delete from user_apps where user_id = v_user;
  insert into user_apps (user_id, app) values (v_user, '/indents');
  set local role authenticated;
  update indents set status = 'approved', approved_by = v_user, approved_at = now()
   where id = v_indent;
  reset role;
  delete from user_apps where user_id = v_user;
  insert into user_apps (user_id, app) values (v_user, '/estimator');
  set local role authenticated;
  v_refused := false;
  begin
    perform decide_indent_line(v_direct, 'refused', 'Too late');
  exception when others then
    v_refused := sqlerrm like '%waits for approval%';
  end;
  if not v_refused then raise exception 'TRIAL 9 FAILED: answered an approved indent'; end if;

  -- 10. A PO line needs an indent line behind it (a /purchase-orders
  --     person, on a draft PO made by the owner).
  reset role;
  insert into purchase_orders (project_id, unit_id, scope_code, vendor_id, po_no, reference, status, created_by, updated_by)
  values (v_project, v_unit, v_ucode, v_vendor, 9113, 'PO/TRIAL/113', 'draft', v_user, v_user)
  returning id into v_po;
  delete from user_apps where user_id = v_user;
  insert into user_apps (user_id, app) values (v_user, '/purchase-orders');
  set local role authenticated;
  v_refused := false;
  begin
    insert into purchase_order_lines (po_id, item_id, quantity, uom, created_by, updated_by)
    values (v_po, v_off, 1, v_off_uom, v_user, v_user);
  exception when others then
    v_refused := sqlerrm like '%purchase_order_lines_from_an_indent%';
  end;
  if not v_refused then raise exception 'TRIAL 10 FAILED: a PO line with no indent was accepted'; end if;
  insert into purchase_order_lines (po_id, item_id, quantity, uom, indent_line_id, created_by, updated_by)
  values (v_po, v_off, 3, v_off_uom, v_direct, v_user, v_user);

  raise exception 'ALL TRIALS PASSED — 0113: the reason, the estimator, the anchor, the PO line';
end $trial$;
