-- 0080 — A store issue says which work it serves
--
-- FOUNDER, 2026-08-19, the heart of the backbone decision: construction
-- material is bought in bulk, so indents and POs cannot tie consumption
-- to a villa — the store ISSUE is the one moment somebody stands there
-- and knows exactly what the material is for. From now on an issue to a
-- plot names the WORK it serves, from the works masters (0073) — the
-- same vocabulary the official estimate speaks — and "stage" is simply
-- that work's category, derived, never stored. That is what makes
-- issued-vs-estimated comparison possible at all, and what Phase 2's
-- Supervisors request-per-work flow lands on.
--
-- ON THE HEADER, NOT THE LINE. One physical issue serves one work at a
-- time — a store-keeper hands over material for "Excavation for rubble
-- foundation", not a basket split across five works. The phone UI stays
-- one picker; issuing for two works is two issues, which is also how
-- the paper works today.
--
-- HISTORY IS EXCUSED, THE FUTURE IS NOT. The CHECK is NOT VALID (the
-- 0053 arrangement): every existing plot issue predates the works
-- vocabulary and stays as it is; every NEW plot issue must name its
-- work. Transfers never need one — material moving between stores
-- serves no work yet.
--
-- RETAGGING IS ALLOWED. work_item_id deliberately does NOT join
-- stock_issues_guard()'s permanence tuple: a mis-picked work is a label
-- fix with no quantity effect, and audit_row() records every change.
-- The store, destination and number stay permanent as before.
--
-- Re-runnable throughout.

alter table stock_issues
  add column if not exists work_item_id uuid references work_items (id);

create index if not exists stock_issues_work_item_idx
  on stock_issues (work_item_id)
  where work_item_id is not null;

alter table stock_issues
  drop constraint if exists stock_issues_plot_needs_work;
alter table stock_issues
  add constraint stock_issues_plot_needs_work
  check (to_store_id is not null or work_item_id is not null)
  not valid;

-- ---------------------------------------------------------------------
-- create_stock_issue() grows a work argument
-- ---------------------------------------------------------------------
-- The 7-arg signature is the real one: body is 0023 §12 plus the work
-- validations. The old 6-arg signature is recreated as a delegating
-- wrapper so code deployed before this migration keeps working through
-- the migrate-before-deploy window — its plot issues get the friendly
-- refusal below rather than a constraint error, and its transfers work
-- unchanged. Both signatures carry the full revoke set: `revoke from
-- public` alone leaves anon able to call a function (0071's lesson).

create or replace function create_stock_issue(
  p_store_id uuid,
  p_to_store_id uuid,
  p_plot_id uuid,
  p_work_item_id uuid,
  p_project_id uuid,
  p_issued_at date,
  p_note text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_project_id uuid;
  v_project_code text;
  v_store_active boolean;
  v_work_active boolean;
  v_no int;
  v_id uuid;
begin
  if (p_to_store_id is not null) = (p_plot_id is not null) then
    raise exception 'Send this to one place: another store, or a plot';
  end if;
  if p_to_store_id = p_store_id then
    raise exception 'A transfer needs a different store to go to';
  end if;

  -- The work: mandatory for a plot, meaningless for a transfer.
  if p_plot_id is not null and p_work_item_id is null then
    raise exception 'Say which work this material is for';
  end if;
  if p_to_store_id is not null and p_work_item_id is not null then
    raise exception 'A transfer between stores serves no work yet — leave it off';
  end if;
  if p_work_item_id is not null then
    select is_active into v_work_active from work_items where id = p_work_item_id;
    if v_work_active is null then
      raise exception 'That work no longer exists';
    end if;
    if not v_work_active then
      raise exception 'That work is marked inactive in Masters';
    end if;
  end if;

  select is_active into v_store_active from stores where id = p_store_id;
  if v_store_active is null then
    raise exception 'Pick the store the goods are leaving';
  end if;
  if not v_store_active then
    raise exception 'That store is marked inactive in Masters';
  end if;

  if p_to_store_id is not null then
    select is_active into v_store_active from stores where id = p_to_store_id;
    if v_store_active is null then
      raise exception 'Pick the store the goods are going to';
    end if;
    if not v_store_active then
      raise exception 'The receiving store is marked inactive in Masters';
    end if;
  end if;

  if p_plot_id is not null then
    select project_id into v_project_id from plots where id = p_plot_id;
    if v_project_id is null then
      raise exception 'That plot no longer exists';
    end if;
  else
    select project_id into v_project_id from stores where id = p_store_id;
    v_project_id := coalesce(v_project_id, p_project_id);
    if v_project_id is null then
      raise exception 'Pick the project this transfer belongs to — the issuing store is not tied to one';
    end if;
  end if;

  select code into v_project_code from projects where id = v_project_id;
  if v_project_code is null then
    raise exception 'This project has no short code yet — set one in Masters before issuing material';
  end if;

  insert into iss_counters (project_id, last_no)
  values (v_project_id, 1)
  on conflict (project_id) do update set last_no = iss_counters.last_no + 1
  returning last_no into v_no;

  insert into stock_issues (
    project_id, store_id, to_store_id, plot_id, work_item_id, iss_no, reference,
    issued_at, note, created_by, updated_by
  )
  values (
    v_project_id, p_store_id, p_to_store_id, p_plot_id, p_work_item_id, v_no,
    'ISS/' || v_project_code || '/'
      || lpad(v_no::text, greatest(3, length(v_no::text)), '0'),
    coalesce(p_issued_at, current_date), nullif(trim(p_note), ''),
    auth.uid(), auth.uid()
  )
  returning id into v_id;

  return v_id;
end $$;

-- The pre-0080 signature, now a wrapper.
create or replace function create_stock_issue(
  p_store_id uuid,
  p_to_store_id uuid,
  p_plot_id uuid,
  p_project_id uuid,
  p_issued_at date,
  p_note text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
begin
  return create_stock_issue(
    p_store_id, p_to_store_id, p_plot_id, null, p_project_id, p_issued_at, p_note
  );
end $$;

revoke execute on function create_stock_issue(uuid, uuid, uuid, uuid, uuid, date, text)
  from public, anon;
grant execute on function create_stock_issue(uuid, uuid, uuid, uuid, uuid, date, text)
  to authenticated;
revoke execute on function create_stock_issue(uuid, uuid, uuid, uuid, date, text)
  from public, anon;
grant execute on function create_stock_issue(uuid, uuid, uuid, uuid, date, text)
  to authenticated;

-- Prove it all landed.
do $$
declare
  v int;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'stock_issues' and column_name = 'work_item_id'
  ) then
    raise exception '0080: stock_issues.work_item_id is missing';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'stock_issues_plot_needs_work' and not convalidated
  ) then
    raise exception '0080: the NOT VALID plot-needs-work check is missing';
  end if;

  select count(*) into v from pg_proc where proname = 'create_stock_issue';
  if v <> 2 then
    raise exception '0080: expected both create_stock_issue signatures, found %', v;
  end if;

  if exists (
    select 1
    from information_schema.routine_privileges
    where routine_schema = 'public'
      and routine_name = 'create_stock_issue'
      and grantee in ('PUBLIC', 'anon')
      and privilege_type = 'EXECUTE'
  ) then
    raise exception '0080: anon can still execute create_stock_issue';
  end if;
end $$;
