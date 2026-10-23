-- 0145 — Review of 0144: two refusals said plainly. No policy, view, grant or definer changes.
--
-- 1. A work order deleted while an advance or cash request line is being added to it was called cancelled.
-- 2. A draft cash request whose line something names would have shown the database's own foreign-key error.

create or replace function work_order_not_cancelled()
returns trigger
language plpgsql
as $$
begin
  if new.labour_contract_id is null then
    return new;
  end if;
  perform 1 from labour_contracts
   where id = new.labour_contract_id and status <> 'cancelled'
     for share;
  if not found then
    raise exception 'That work order is cancelled or no longer exists';
  end if;
  return new;
end $$;

revoke execute on function work_order_not_cancelled() from public, anon, authenticated;

create or replace function delete_draft_cash_request(p_request_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  perform 1 from cash_requests
   where id = p_request_id and status = 'draft'
     for update;
  if not found then
    raise exception 'Only a draft cash request can be deleted — a submitted one goes back through its approver';
  end if;

  begin
    delete from cash_request_items where cash_request_id = p_request_id;
    delete from cash_requests where id = p_request_id;
  exception when foreign_key_violation then
    raise exception 'A payment or advance names a line of this cash request, so it cannot be deleted';
  end;
end $$;

revoke execute on function delete_draft_cash_request(uuid) from public, anon;
grant execute on function delete_draft_cash_request(uuid) to authenticated;

do $$
begin
  if position('for share' in pg_get_functiondef('work_order_not_cancelled()'::regprocedure)) = 0
     or position('no longer exists' in pg_get_functiondef('work_order_not_cancelled()'::regprocedure)) = 0 then
    raise exception '0145: work_order_not_cancelled lost its share lock or its wording';
  end if;
  if has_function_privilege('authenticated', 'work_order_not_cancelled()', 'execute') then
    raise exception '0145: work_order_not_cancelled is executable by a client role';
  end if;
  if position('foreign_key_violation' in pg_get_functiondef('delete_draft_cash_request(uuid)'::regprocedure)) = 0 then
    raise exception '0145: delete_draft_cash_request does not word a foreign-key refusal';
  end if;
  if has_function_privilege('anon', 'delete_draft_cash_request(uuid)', 'execute')
     or not has_function_privilege('authenticated', 'delete_draft_cash_request(uuid)', 'execute') then
    raise exception '0145: delete_draft_cash_request has the wrong execute grants';
  end if;
  if not exists (
    select 1 from pg_policies
     where tablename = 'labour_contracts' and cmd = 'DELETE' and qual like '%pending_approval%'
  ) or not exists (
    select 1 from pg_policies
     where tablename = 'cash_requests' and cmd = 'DELETE' and qual like '%draft%'
  ) then
    raise exception '0145: a delete policy lost its status condition';
  end if;
end $$;
