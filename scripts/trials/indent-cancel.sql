-- Behaviour trial for 0143 — cancelling an indent, deleting a budget in pricing and a draft revision. Runs inside the
-- dry-run transaction; always rolled back, UNDER ROW-LEVEL SECURITY (BUGCATCHER #19), as the staff account holding one
-- tool at a time: the cancel's PO check must work for an /indents holder who cannot read the PO tables.
--
--   npx tsx scripts/dry-run-migrations.ts --project ipstebqawrvhkyntctrv \
--     supabase/migrations/0143_*.sql --trial scripts/trials/indent-cancel.sql
do $trial$
declare
  v_user uuid := (select id from auth.users where email = 'siddharth.cyriac.99@gmail.com');
  s_user uuid := gen_random_uuid();
  v_project uuid := (select id from projects where not is_test order by name limit 1);
  v_unit uuid := (select u.id from units u where not exists (select 1 from selections s where s.unit_id = u.id)
                   order by u.id limit 1);
  v_space_type uuid := (select id from space_types order by id limit 1);
  v_item uuid;
  v_uom text;
  v_vendor uuid := (select id from vendors where not is_contractor order by name limit 1);
  v_indent uuid;
  v_draft uuid;
  v_line uuid;
  v_submitted uuid;
  v_key uuid := gen_random_uuid();
  v_po uuid;
  v_space uuid;
  v_selection uuid;
  v_issued uuid;
  v_budget uuid;
  v_row indents;
  v_text text;
  v_refused boolean;
begin
  select id, default_uom into v_item, v_uom from items
   where default_uom is not null and is_active order by code limit 1;
  if v_user is null or v_project is null or v_unit is null or v_space_type is null or v_item is null
     or v_vendor is null then
    raise exception 'TRIAL SETUP: staging is missing the staff account, a project, a unit with no selection, '
      'a space type, an item or a vendor';
  end if;

  insert into auth_verified_sessions (session_id, user_id, method) values (s_user, v_user, 'otp');
  update profiles set role_id = null where id = v_user;
  delete from user_apps where user_id = v_user;
  insert into user_apps (user_id, app) values (v_user, '/indents'), (v_user, '/estimator');
  insert into indent_approvers (user_id) values (v_user) on conflict do nothing;
  perform set_config('request.jwt.claims', json_build_object('sub', v_user,
    'role', 'authenticated', 'session_id', s_user)::text, true);
  set local role authenticated;

  -- Setup: an approved indent with one line outside the estimate, and a draft beside it.
  v_indent := create_indent(v_project, null, null, null, null, 'Trial 0143');
  insert into indent_lines (indent_id, item_id, quantity, uom, off_estimate_reason, created_by, updated_by)
  values (v_indent, v_item, 5, v_uom, 'Trial', v_user, v_user) returning id into v_line;
  update indents set status = 'submitted', submitted_by = v_user, submitted_at = now() where id = v_indent;
  perform decide_indent_line(v_line, 'approved', null);
  update indents set status = 'approved', approved_by = v_user, approved_at = now() where id = v_indent;
  v_draft := create_indent(v_project, null, null, null, null, 'Trial 0143 draft');
  v_submitted := create_indent(v_project, null, null, null, null, 'Trial 0143 submitted');
  insert into indent_lines (indent_id, item_id, quantity, uom, off_estimate_reason, created_by, updated_by)
  values (v_submitted, v_item, 2, v_uom, 'Trial', v_user, v_user);
  update indents set status = 'submitted', submitted_by = v_user, submitted_at = now() where id = v_submitted;

  reset role;
  delete from user_apps where user_id = v_user and app = '/estimator';
  -- A draft PO orders from the indent; the owner writes it, as the /indents holder cannot.
  insert into purchase_orders (project_id, scope_code, vendor_id, po_no, reference, status, created_by, updated_by)
  values (v_project, 'TRIAL', v_vendor, 9431, 'PO/TRIAL/431', 'draft', v_user, v_user) returning id into v_po;
  insert into purchase_order_lines (po_id, indent_line_id, item_id, quantity, uom, rate, gst_pct, created_by, updated_by)
  values (v_po, v_line, v_item, 2, v_uom, 100, 18, v_user, v_user);
  set local role authenticated;

  -- 1. The PO tables are out of this person's sight, and the cancel still finds the PO.
  if exists (select 1 from purchase_orders where id = v_po) then
    raise exception 'TRIAL 1 SETUP: an /indents-only person can read purchase_orders';
  end if;
  v_text := null;
  begin
    update indents set status = 'cancelled', cancel_reason = 'Raised twice' where id = v_indent;
  exception when others then v_text := sqlerrm;
  end;
  if v_text is null or v_text not like 'A purchase order orders from this indent%' then
    raise exception 'TRIAL 1 FAILED: an indent with a live PO gave %', coalesce(v_text, 'no refusal');
  end if;

  reset role;
  delete from purchase_order_lines where po_id = v_po;
  delete from purchase_orders where id = v_po;
  set local role authenticated;

  -- 2. No reason, no cancel.
  v_refused := false;
  begin
    update indents set status = 'cancelled', cancel_reason = '  ' where id = v_indent;
  exception when others then v_refused := sqlerrm like 'Say why%';
  end;
  if not v_refused then raise exception 'TRIAL 2 FAILED: a cancel with no reason went through'; end if;

  -- 3. Cancelling changes nothing else.
  v_refused := false;
  begin
    update indents set status = 'cancelled', cancel_reason = 'Raised twice', note = 'changed' where id = v_indent;
  exception when others then v_refused := sqlerrm like 'Cancelling an indent changes nothing else%';
  end;
  if not v_refused then raise exception 'TRIAL 3 FAILED: a cancel rewrote the note'; end if;

  -- 4. With a reason, it cancels, stamped by the database whatever the caller sent.
  update indents set status = 'cancelled', cancel_reason = ' Raised twice ',
                     cancelled_at = date '2000-01-01', cancelled_by = null
   where id = v_indent;
  select * into v_row from indents where id = v_indent;
  if v_row.status <> 'cancelled' or v_row.cancelled_by is distinct from v_user
     or v_row.cancelled_at < now() - interval '1 minute' or v_row.cancel_reason <> 'Raised twice' then
    raise exception 'TRIAL 4 FAILED: the cancel landed as (%, %, %, %)',
      v_row.status, v_row.cancelled_by, v_row.cancelled_at, v_row.cancel_reason;
  end if;

  -- 4b. A submitted indent cancels too, and may not rewrite who raised it.
  v_refused := false;
  begin
    update indents set status = 'cancelled', cancel_reason = 'Not needed', created_by = null where id = v_submitted;
  exception when others then v_refused := sqlerrm like 'Cancelling an indent changes nothing else%';
  end;
  if not v_refused then raise exception 'TRIAL 4b FAILED: a cancel rewrote who raised the indent'; end if;
  update indents set status = 'cancelled', cancel_reason = 'Not needed' where id = v_submitted;
  if (select status from indents where id = v_submitted) <> 'cancelled' then
    raise exception 'TRIAL 4c FAILED: a submitted indent did not cancel';
  end if;

  -- 5. Cancelled is final.
  v_refused := false;
  begin
    update indents set status = 'approved', cancelled_at = null, cancelled_by = null, cancel_reason = null
     where id = v_indent;
  exception when others then v_refused := sqlerrm like 'Invalid indent status change%';
  end;
  if not v_refused then raise exception 'TRIAL 5a FAILED: a cancelled indent came back'; end if;
  v_refused := false;
  begin
    update indents set cancel_reason = 'Something else' where id = v_indent;
  exception when others then v_refused := sqlerrm like 'A cancelled indent can no longer be edited%';
  end;
  if not v_refused then raise exception 'TRIAL 5b FAILED: a cancelled indent was edited'; end if;

  -- 6. No PO line can come from a cancelled indent.
  reset role;
  insert into purchase_orders (project_id, scope_code, vendor_id, po_no, reference, status, created_by, updated_by)
  values (v_project, 'TRIAL', v_vendor, 9432, 'PO/TRIAL/432', 'draft', v_user, v_user) returning id into v_po;
  v_refused := false;
  begin
    insert into purchase_order_lines (po_id, indent_line_id, item_id, quantity, uom, rate, gst_pct, created_by, updated_by)
    values (v_po, v_line, v_item, 1, v_uom, 100, 18, v_user, v_user);
  exception when others then v_refused := sqlerrm like '%APPROVED indent lines%';
  end;
  if not v_refused then raise exception 'TRIAL 6 FAILED: a PO ordered from a cancelled indent'; end if;
  set local role authenticated;

  -- 7. A draft is deleted, never cancelled; a reason on it is refused too.
  v_refused := false;
  begin
    update indents set status = 'cancelled', cancel_reason = 'Draft' where id = v_draft;
  exception when others then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 7a FAILED: a draft was cancelled'; end if;
  v_refused := false;
  begin
    update indents set cancel_reason = 'Draft' where id = v_draft;
  exception when check_violation then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 7b FAILED: a draft took a cancel reason'; end if;

  -- 8. A draft revision is deleted whole, as a /selections holder; an issued one is not, nor one a budget prices.
  reset role;
  delete from user_apps where user_id = v_user;
  insert into user_apps (user_id, app) values (v_user, '/selections');
  insert into spaces (unit_id, space_type_id, label) values (v_unit, v_space_type, 'Trial room') returning id into v_space;
  insert into selections (unit_id, revision_no, status, title) values (v_unit, 0, 'draft', 'Trial R0')
  returning id into v_issued;
  insert into selection_lines (selection_id, unit_id, unit_space_id, item_id, quantity, uom, line_key)
  values (v_issued, v_unit, v_space, v_item, 3, v_uom, v_key);
  update selections set status = 'issued' where id = v_issued;
  insert into selections (unit_id, revision_no, status, title) values (v_unit, 1, 'draft', 'Trial R1')
  returning id into v_selection;
  insert into selection_lines (selection_id, unit_id, unit_space_id, item_id, quantity, uom)
  values (v_selection, v_unit, v_space, v_item, 3, v_uom);
  -- A budget forced onto the draft through a raw insert, which this person cannot read.
  insert into budgets (selection_id, unit_id, status, version) values (v_selection, v_unit, 'pricing', 1)
  returning id into v_budget;
  set local role authenticated;

  v_refused := false;
  begin
    perform delete_draft_selection(v_issued);
  exception when others then v_refused := sqlerrm like 'Only a draft revision%';
  end;
  if not v_refused then raise exception 'TRIAL 8a FAILED: an issued revision was deleted'; end if;
  v_text := null;
  begin
    perform delete_draft_selection(v_selection);
  exception when others then v_text := sqlerrm;
  end;
  if v_text is distinct from 'A budget prices this revision, so it cannot be deleted' then
    raise exception 'TRIAL 8b FAILED: a draft with a budget gave %', coalesce(v_text, 'no refusal');
  end if;
  reset role;
  delete from budgets where id = v_budget;
  set local role authenticated;
  perform delete_draft_selection(v_selection);
  reset role;
  if exists (select 1 from selections where id = v_selection)
     or exists (select 1 from selection_lines where selection_id = v_selection) then
    raise exception 'TRIAL 8c FAILED: the draft revision or its lines are still there';
  end if;

  -- 9. A budget in its first pricing is deleted whole, lines and all, as a /budgets holder; a re-opened one is not,
  --    nor one an indent asks from.
  delete from user_apps where user_id = v_user;
  insert into user_apps (user_id, app) values (v_user, '/budgets');
  insert into budgets (selection_id, unit_id, status, version) values (v_issued, v_unit, 'pricing', 2)
  returning id into v_budget;
  set local role authenticated;
  v_refused := false;
  begin
    perform delete_pricing_budget(v_budget);
  exception when others then v_refused := sqlerrm like 'This budget was approved before%';
  end;
  if not v_refused then raise exception 'TRIAL 9a FAILED: a re-opened budget was deleted'; end if;
  reset role;
  delete from budgets where id = v_budget;
  insert into budgets (selection_id, unit_id, status, version) values (v_issued, v_unit, 'pricing', 1)
  returning id into v_budget;
  insert into budget_lines (budget_id, selection_id, line_key, quantity, unit_cost, margin_pct)
  values (v_budget, v_issued, v_key, 3, 100, 10);
  alter table indent_lines disable trigger indent_lines_budget_current;
  insert into indent_lines (indent_id, item_id, quantity, uom, budget_id, line_key, created_by, updated_by)
  values (v_draft, v_item, 1, v_uom, v_budget, v_key, v_user, v_user) returning id into v_line;
  alter table indent_lines enable trigger indent_lines_budget_current;
  set local role authenticated;
  v_refused := false;
  begin
    perform delete_pricing_budget(v_budget);
  exception when others then v_refused := sqlerrm like 'An indent asks for lines from this budget%';
  end;
  if not v_refused then raise exception 'TRIAL 9b FAILED: a budget an indent asks from was deleted'; end if;
  reset role;
  delete from indent_lines where id = v_line;
  set local role authenticated;
  perform delete_pricing_budget(v_budget);
  reset role;
  if exists (select 1 from budgets where id = v_budget) or exists (select 1 from budget_lines where budget_id = v_budget) then
    raise exception 'TRIAL 9c FAILED: the budget in pricing or its lines are still there';
  end if;

  raise exception 'ALL TRIALS PASSED';
end $trial$;
