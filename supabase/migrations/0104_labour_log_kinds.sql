-- 0104 — Labour logs in the billing formats; the work's unit on site;
--        a reason when a request is off the estimate
--
-- FOUNDER, 2026-10-08 (plan.md, B5 and B10). The labour log learns the
-- two billing formats the Bills team pays in:
--
--   nmr      daily wages — heads by trade (masons / helpers / others),
--            as today
--   pw_qty   piece-work by quantity — how much of the work was done, in
--            the work's unit ("2 cum")
--   pw_lump  piece-work, lump sum — a description of what was done
--
-- STILL NO RUPEES ON THE SUPERVISOR'S PHONE. Rates are the billing
-- team's (0106). The supervisor logs; Bills ticks logs and presses
-- "Send to Bill", which stamps each log's bill_id (0106's definer
-- function). A sent log is frozen: the guard below refuses any edit or
-- delete once bill_id is set, and refuses setting bill_id except from
-- inside that function (a transaction-local flag only it raises).
--
-- READS WIDEN, ONE POLICY: Bills reads the logs it bills — the existing
-- SELECT qual becomes /supervisors OR /bills. Writes stay /supervisors.
--
-- THE WORK'S UNIT: a supervisor logging "2 cum" must see the unit, which
-- lives in estimator_work_info — /estimator-gated, because the labour
-- rate sits beside it. work_unit_facts is the money-free window: the
-- unit and nothing else, open to every signed-in person. A view owned by
-- postgres bypasses the table's RLS; its column list is the boundary
-- (scripts/view-manifest.ts pins it). NEVER add labour_rate to it.
--
-- OFF-ESTIMATE REQUESTS: a supervisor asking for something the official
-- estimate does not list for that work says why (founder: "allowed with
-- a reason"). The reason is required by the action, which knows the
-- estimate; the database stores it and keeps it permanent with the rest
-- of the request's identity.
--
-- Re-runnable throughout.

-- ---------------------------------------------------------------------
-- 1. labour_logs: kind, quantity, unit, description, bill
-- ---------------------------------------------------------------------

alter table labour_logs add column if not exists kind text not null default 'nmr';
alter table labour_logs add column if not exists quantity numeric;
alter table labour_logs add column if not exists uom text;
alter table labour_logs add column if not exists description text;
alter table labour_logs add column if not exists bill_id uuid references bills (id);

alter table labour_logs drop constraint if exists labour_logs_uom_fkey;
alter table labour_logs
  add constraint labour_logs_uom_fkey foreign key (uom) references uoms (name) on update cascade;

alter table labour_logs drop constraint if exists labour_logs_kind_known;
alter table labour_logs add constraint labour_logs_kind_known
  check (kind in ('nmr', 'pw_qty', 'pw_lump'));

-- Heads are for daily wages only; piece-work is measured, not counted.
alter table labour_logs drop constraint if exists labour_logs_some_workers;
alter table labour_logs drop constraint if exists labour_logs_shape_matches_kind;
alter table labour_logs add constraint labour_logs_shape_matches_kind check (
  (kind = 'nmr' and masons + helpers + others > 0 and quantity is null)
  or (kind = 'pw_qty' and quantity is not null and quantity > 0 and uom is not null)
  or (kind = 'pw_lump' and description is not null and length(trim(description)) > 0
      and quantity is null)
);

-- One entry per plot + work + contractor + day + KIND: a gang can be on
-- daily wages and piece-work the same day.
alter table labour_logs drop constraint if exists labour_logs_one_per_day;
alter table labour_logs add constraint labour_logs_one_per_day
  unique (plot_id, work_item_id, contractor_id, log_date, kind);

create index if not exists labour_logs_bill_idx on labour_logs (bill_id);

-- A sent log is the bill's record; nothing moves it afterwards.
create or replace function labour_logs_billed_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if old.bill_id is not null then
      raise exception 'This entry has been billed and can no longer be removed.';
    end if;
    return old;
  end if;

  -- The stamp moves (set by Send to Bill, cleared when a recorded bill
  -- is deleted) only under the transaction-local flag that 0106's two
  -- definer functions raise; nothing a client can call sets it. And the
  -- stamp is all they move.
  if new.bill_id is distinct from old.bill_id then
    if coalesce(current_setting('toolbox.labour_billing', true), '') <> 'on' then
      raise exception 'Labour entries are billed from Bills → Labour, with Send to Bill.';
    end if;
    if (new.plot_id, new.work_item_id, new.contractor_id, new.log_date, new.kind,
        new.masons, new.helpers, new.others, new.quantity, new.description, new.note)
       is distinct from
       (old.plot_id, old.work_item_id, old.contractor_id, old.log_date, old.kind,
        old.masons, old.helpers, old.others, old.quantity, old.description, old.note) then
      raise exception 'Billing an entry does not rewrite it.';
    end if;
    return new;
  end if;

  -- uom is left out of the comparison: a unit renamed in Masters cascades
  -- here (0082) and must not be refused.
  if old.bill_id is not null
     and (new.plot_id, new.work_item_id, new.contractor_id, new.log_date, new.kind,
          new.masons, new.helpers, new.others, new.quantity, new.description, new.note)
         is distinct from
         (old.plot_id, old.work_item_id, old.contractor_id, old.log_date, old.kind,
          old.masons, old.helpers, old.others, old.quantity, old.description, old.note) then
    raise exception 'This entry has been billed and can no longer be changed.';
  end if;

  return new;
end $$;

drop trigger if exists labour_logs_billed_guard on labour_logs;
create trigger labour_logs_billed_guard
  before update or delete on labour_logs
  for each row execute function labour_logs_billed_guard();

drop policy if exists "labour_logs readable by supervisors app" on labour_logs;
drop policy if exists "labour_logs readable by supervisors or bills" on labour_logs;
create policy "labour_logs readable by supervisors or bills" on labour_logs
  for select to authenticated using (has_app('/supervisors') or has_app('/bills'));

drop policy if exists "labour_logs writable by supervisors app" on labour_logs;
create policy "labour_logs writable by supervisors app" on labour_logs
  for insert to authenticated with check (has_app('/supervisors') and bill_id is null);

-- ---------------------------------------------------------------------
-- 2. work_unit_facts — the work's unit, nothing else
-- ---------------------------------------------------------------------

create or replace view work_unit_facts as
  select i.work_item_id, i.uom
  from estimator_work_info i;

revoke all on work_unit_facts from public, anon;
revoke insert, update, delete, truncate on work_unit_facts from anon, authenticated;
grant select on work_unit_facts to authenticated;

-- ---------------------------------------------------------------------
-- 3. issue_requests: the reason a request is off the estimate
-- ---------------------------------------------------------------------

alter table issue_requests add column if not exists off_estimate_reason text;

alter table issue_requests drop constraint if exists issue_requests_reason_not_blank;
alter table issue_requests add constraint issue_requests_reason_not_blank
  check (off_estimate_reason is null or length(trim(off_estimate_reason)) > 0);

-- 0084's guard, with the reason joining what resolving may not rewrite.
-- Everything else is unchanged.
create or replace function issue_requests_guard()
returns trigger
language plpgsql
as $fn$
begin
  if new.plot_id <> old.plot_id
    or new.work_item_id <> old.work_item_id
    or new.item_id <> old.item_id
    or new.created_by is distinct from old.created_by
    or new.created_at <> old.created_at then
    raise exception 'A request''s villa, work, item and requester never change — withdraw it and raise another.';
  end if;

  if old.status <> 'requested' then
    raise exception 'This request is already % — it cannot change.', old.status;
  end if;

  if new.status = 'requested' then
    if not has_app('/supervisors') then
      raise exception 'Only the supervisors app edits an open request.';
    end if;
  elsif new.status in ('fulfilled', 'declined') then
    if not has_app('/inventory') then
      raise exception 'Only the store can fulfil or decline a request.';
    end if;
    if new.quantity <> old.quantity or new.note is distinct from old.note
       or new.off_estimate_reason is distinct from old.off_estimate_reason then
      raise exception 'Resolving a request does not rewrite it — the issue records what was actually given.';
    end if;
  end if;

  return new;
end;
$fn$;

-- ---------------------------------------------------------------------
-- 4. Prove it
-- ---------------------------------------------------------------------

do $$
declare
  v int;
begin
  select count(*) into v from pg_policies
    where schemaname = 'public' and tablename = 'labour_logs' and cmd = 'SELECT';
  if v <> 1 then raise exception '0104: labour_logs has % SELECT policies, expected 1', v; end if;

  if not exists (select 1 from pg_policies
    where schemaname = 'public' and tablename = 'labour_logs' and cmd = 'SELECT'
      and qual like '%/bills%' and qual like '%/supervisors%') then
    raise exception '0104: the labour_logs SELECT qual must admit /supervisors and /bills';
  end if;

  if not exists (select 1 from pg_trigger
    where tgname = 'labour_logs_billed_guard' and tgrelid = 'labour_logs'::regclass) then
    raise exception '0104: labour_logs_billed_guard is missing';
  end if;

  if (select array_agg(column_name::text order by ordinal_position)
      from information_schema.columns
      where table_schema = 'public' and table_name = 'work_unit_facts')
     <> array['work_item_id', 'uom'] then
    raise exception '0104: work_unit_facts must carry exactly work_item_id, uom';
  end if;

  if exists (select 1 from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'work_unit_facts'
      and grantee in ('anon', 'authenticated', 'PUBLIC')
      and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')) then
    raise exception '0104: work_unit_facts is writable';
  end if;

  if not exists (select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'issue_requests'
      and column_name = 'off_estimate_reason') then
    raise exception '0104: issue_requests.off_estimate_reason is missing';
  end if;
end $$;
