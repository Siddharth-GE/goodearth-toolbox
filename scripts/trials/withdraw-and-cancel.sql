-- Behaviour trial for 0144 — withdrawing an official estimate, deleting or cancelling a work order, deleting a draft
-- cash request. Runs inside the dry-run transaction; always rolled back, UNDER ROW-LEVEL SECURITY (BUGCATCHER #19), as
-- the staff account holding one tool at a time.
--
--   npx tsx scripts/dry-run-migrations.ts --project ipstebqawrvhkyntctrv \
--     supabase/migrations/0144_*.sql --trial scripts/trials/withdraw-and-cancel.sql
do $trial$
declare
  v_user uuid := (select id from auth.users where email = 'siddharth.cyriac.99@gmail.com');
  s_user uuid := gen_random_uuid();
  v_project uuid := (select p.id from projects p where not p.is_test and p.code is not null order by p.name limit 1);
  v_unit uuid;
  v_work uuid := (select id from work_items where is_active order by code limit 1);
  v_item uuid;
  v_uom text;
  v_contractor uuid := (select id from vendors where is_contractor and is_active order by name limit 1);
  v_estimate uuid;
  v_indent uuid;
  v_line uuid;
  v_order uuid;
  v_pending uuid;
  v_advance uuid;
  v_request uuid;
  v_submitted uuid;
  v_text text;
  v_refused boolean;
begin
  select id, default_uom into v_item, v_uom from items
   where default_uom is not null and is_active order by code limit 1;
  select u.id into v_unit from units u
   where u.project_id = v_project
     and not exists (select 1 from estimator_estimates e where e.unit_id = u.id and e.status = 'submitted')
   order by u.id limit 1;
  if v_user is null or v_project is null or v_unit is null or v_work is null or v_item is null
     or v_contractor is null then
    raise exception 'TRIAL SETUP: staging is missing the staff account, a coded project with a villa free of an '
      'official estimate, a work, an item or a contractor';
  end if;

  insert into auth_verified_sessions (session_id, user_id, method) values (s_user, v_user, 'otp');
  update profiles set role_id = null where id = v_user;
  delete from user_apps where user_id = v_user;
  delete from bill_approvers where user_id = v_user;
  insert into user_apps (user_id, app) values (v_user, '/estimator');
  perform set_config('request.jwt.claims', json_build_object('sub', v_user,
    'role', 'authenticated', 'session_id', s_user)::text, true);

  -- Setup as the owner: an official estimate on the villa, and a draft indent drawing on it.
  insert into estimator_estimates (project_id, unit_id, name, status, est_no, reference, submitted_by, submitted_at)
  values (v_project, v_unit, 'Trial official', 'submitted', 9441, 'EST/TRIAL/441', v_user, now())
  returning id into v_estimate;
  insert into indents (project_id, unit_id, indent_no, reference, status, created_by)
  values (v_project, v_unit, 9441, 'IND/TRIAL/441', 'draft', v_user) returning id into v_indent;
  alter table indent_lines disable trigger indent_lines_estimate_anchor;
  insert into indent_lines (indent_id, item_id, quantity, uom, estimate_id, created_by, updated_by)
  values (v_indent, v_item, 1, v_uom, v_estimate, v_user, v_user) returning id into v_line;
  alter table indent_lines enable trigger indent_lines_estimate_anchor;
  set local role authenticated;

  -- 1. A live indent holds the estimate.
  v_text := null;
  begin
    update estimator_estimates set status = 'cancelled', cancel_reason = 'Wrong villa' where id = v_estimate;
  exception when others then v_text := sqlerrm;
  end;
  if v_text is distinct from 'An indent draws on this estimate — cancel it first' then
    raise exception 'TRIAL 1 FAILED: an estimate an indent draws on gave %', coalesce(v_text, 'no refusal');
  end if;

  -- 2. With the indent gone: no reason, no withdraw; nothing else may change; then it withdraws, stamped.
  reset role;
  delete from indent_lines where id = v_line;
  set local role authenticated;
  v_refused := false;
  begin
    update estimator_estimates set status = 'cancelled', cancel_reason = '' where id = v_estimate;
  exception when others then v_refused := sqlerrm like 'Say why%';
  end;
  if not v_refused then raise exception 'TRIAL 2a FAILED: a withdraw with no reason went through'; end if;
  v_refused := false;
  begin
    update estimator_estimates set status = 'cancelled', cancel_reason = 'Wrong villa', name = 'x' where id = v_estimate;
  exception when others then v_refused := sqlerrm like 'Withdrawing an estimate changes nothing else%';
  end;
  if not v_refused then raise exception 'TRIAL 2b FAILED: a withdraw renamed the estimate'; end if;
  update estimator_estimates set status = 'cancelled', cancel_reason = ' Wrong villa ' where id = v_estimate;
  if (select (status, cancelled_by, cancel_reason) from estimator_estimates where id = v_estimate)
     is distinct from ('cancelled'::text, v_user, 'Wrong villa'::text) then
    raise exception 'TRIAL 2c FAILED: the withdraw did not land as stamped';
  end if;

  -- 3. Withdrawn is final, and the villa's official reads are empty.
  v_refused := false;
  begin
    update estimator_estimates set status = 'submitted', cancelled_at = null, cancelled_by = null, cancel_reason = null
     where id = v_estimate;
  exception when others then v_refused := sqlerrm like 'Invalid estimate status change%';
  end;
  if not v_refused then raise exception 'TRIAL 3a FAILED: a withdrawn estimate came back'; end if;
  if exists (select 1 from estimate_work_facts where estimate_id = v_estimate) then
    raise exception 'TRIAL 3b FAILED: a withdrawn estimate still reads as official';
  end if;

  -- 4. Work orders, as a /bills holder who is not an approver.
  reset role;
  delete from user_apps where user_id = v_user;
  insert into user_apps (user_id, app) values (v_user, '/bills');
  insert into labour_contracts (vendor_id, project_id, unit_id, description, contract_value, status, approved_by, approved_at)
  values (v_contractor, v_project, v_unit, 'Trial approved', 1000, 'approved', v_user, now()) returning id into v_order;
  insert into labour_contracts (vendor_id, project_id, unit_id, description, contract_value, status)
  values (v_contractor, v_project, v_unit, 'Trial pending', 500, 'pending_approval') returning id into v_pending;
  insert into labour_contract_lines (contract_id, work_item_id, description, is_lump_sum, rate)
  values (v_pending, v_work, 'Trial lump sum', true, 500);
  insert into contractor_advances (vendor_id, project_id, labour_contract_id, amount, payment_ref)
  values (v_contractor, v_project, v_order, 100, 'TRIAL-UTR') returning id into v_advance;
  set local role authenticated;

  v_refused := false;
  begin
    update labour_contracts set status = 'cancelled', cancel_reason = 'Wrong contractor' where id = v_order;
  exception when others then v_refused := sqlerrm like 'Only a named bill approver or an admin can cancel%';
  end;
  if not v_refused then raise exception 'TRIAL 4a FAILED: a non-approver cancelled a work order'; end if;

  reset role;
  insert into bill_approvers (user_id) values (v_user);
  set local role authenticated;
  v_text := null;
  begin
    update labour_contracts set status = 'cancelled', cancel_reason = 'Wrong contractor' where id = v_order;
  exception when others then v_text := sqlerrm;
  end;
  if v_text is distinct from 'It has an advance, so it cannot be cancelled — switch it off instead' then
    raise exception 'TRIAL 4b FAILED: a work order with an advance gave %', coalesce(v_text, 'no refusal');
  end if;

  reset role;
  delete from contractor_advances where id = v_advance;
  set local role authenticated;
  update labour_contracts set status = 'cancelled', cancel_reason = 'Wrong contractor' where id = v_order;
  if (select (status, cancelled_by) from labour_contracts where id = v_order)
     is distinct from ('cancelled'::text, v_user) then
    raise exception 'TRIAL 4c FAILED: the cancel did not land as stamped';
  end if;
  v_refused := false;
  begin
    update labour_contracts set is_active = false where id = v_order;
  exception when others then v_refused := sqlerrm like 'A cancelled work order can no longer be changed%';
  end;
  if not v_refused then raise exception 'TRIAL 4d FAILED: a cancelled work order was switched off'; end if;

  -- 5. Nothing new rests on a cancelled work order.
  v_refused := false;
  begin
    insert into contractor_advances (vendor_id, project_id, labour_contract_id, amount, payment_ref)
    values (v_contractor, v_project, v_order, 100, 'TRIAL-UTR-2');
  exception when others then v_refused := sqlerrm like 'That work order is cancelled%';
  end;
  if not v_refused then raise exception 'TRIAL 5 FAILED: an advance landed on a cancelled work order'; end if;

  -- 6. A pending work order is deleted with its works; an approved one is not.
  perform delete_pending_work_order(v_pending);
  reset role;
  if exists (select 1 from labour_contracts where id = v_pending)
     or exists (select 1 from labour_contract_lines where contract_id = v_pending) then
    raise exception 'TRIAL 6a FAILED: the pending work order or its works are still there';
  end if;
  set local role authenticated;
  v_refused := false;
  begin
    perform delete_pending_work_order(v_order);
  exception when others then v_refused := sqlerrm like 'Only a work order waiting for approval%';
  end;
  if not v_refused then raise exception 'TRIAL 6b FAILED: a cancelled work order was deleted'; end if;

  -- 7. A draft cash request is deleted with its lines; a submitted one is not.
  insert into cash_requests (week_of, created_by) values (date '2020-03-09', v_user) returning id into v_request;
  insert into cash_request_items (cash_request_id, item_kind, vendor_id, project_id, requested_amount)
  values (v_request, 'advance', v_contractor, v_project, 100);
  insert into cash_requests (week_of, created_by) values (date '2020-03-16', v_user) returning id into v_submitted;
  insert into cash_request_items (cash_request_id, item_kind, vendor_id, project_id, requested_amount)
  values (v_submitted, 'advance', v_contractor, v_project, 100);
  update cash_requests set status = 'submitted', submitted_by = v_user, submitted_at = now() where id = v_submitted;

  perform delete_draft_cash_request(v_request);
  v_refused := false;
  begin
    perform delete_draft_cash_request(v_submitted);
  exception when others then v_refused := sqlerrm like 'Only a draft cash request%';
  end;
  if not v_refused then raise exception 'TRIAL 7a FAILED: a submitted cash request was deleted'; end if;
  reset role;
  if exists (select 1 from cash_requests where id = v_request)
     or exists (select 1 from cash_request_items where cash_request_id = v_request) then
    raise exception 'TRIAL 7b FAILED: the draft cash request or its lines are still there';
  end if;

  raise exception 'ALL TRIALS PASSED';
end $trial$;
