-- 0105 — Labour contracts become Work Orders
--
-- FOUNDER, 2026-10-08 (plan.md, B6): "add a facility to create work
-- orders … a few standard templates that can be reused … select works
-- from the Work list in the Master". Decided: the labour contract IS the
-- work order, made richer — renamed on every screen, the table kept, so
-- bills.kind = 'contract', labour_contract_id, Financial Management and
-- Reporter are untouched.
--
--   * A number: WO/<project code>/NNN, minted on insert by a trigger from
--     wo_counters (the bill_counters shape: an upsert with a row lock;
--     gaps accepted, reuse never). Existing contracts are numbered in the
--     order they were made, where their project has a code.
--   * terms — copied from a document_terms 'work_order' text (0101) and
--     edited on the order; permanent once approved, like the value.
--   * labour_contract_lines — the works: a work from the Masters list,
--     its description and unit, a quantity and a rate, or a lump sum.
--     Editable only while the order is pending approval. While lines
--     exist, contract_value IS their sum — a trigger writes it, so the
--     approved value and the lines can never disagree. An order with no
--     lines (every contract before today) keeps its typed value.
--   * work_order_templates (+ lines) — a name, terms and a list of works
--     with no quantities. "Start from template" copies them; "Save as
--     template" makes one. Not seeded: the founder makes the standard
--     ones on staging.
--   * work_labour_rate_facts — the rate book's labour rate per work, for
--     the rate a work order line is offered. MONEY: the estimator's rate
--     book is /estimator-gated (0074), and this is a second window onto
--     it, WHERE-gated to /bills or /estimator, security_barrier, never
--     open. For the Fable review.
--
-- Re-runnable throughout.

-- ---------------------------------------------------------------------
-- 1. The number and the terms
-- ---------------------------------------------------------------------

alter table labour_contracts add column if not exists wo_no int;
alter table labour_contracts add column if not exists reference text;
alter table labour_contracts add column if not exists terms text;

create unique index if not exists labour_contracts_reference_unique
  on labour_contracts (reference) where reference is not null;

create table if not exists wo_counters (
  project_id uuid primary key references projects (id),
  last_no int not null default 0
);

alter table wo_counters enable row level security;

drop policy if exists "wo_counters readable by authenticated users" on wo_counters;
create policy "wo_counters readable by authenticated users"
  on wo_counters for select to authenticated using (true);
drop policy if exists "wo_counters writable by bills app" on wo_counters;
create policy "wo_counters writable by bills app"
  on wo_counters for insert to authenticated with check (has_app('/bills'));
drop policy if exists "wo_counters updatable by bills app" on wo_counters;
create policy "wo_counters updatable by bills app"
  on wo_counters for update to authenticated
  using (has_app('/bills')) with check (has_app('/bills'));

create or replace function labour_contracts_mint_reference()
returns trigger
language plpgsql
as $$
declare
  v_code text;
  v_no int;
begin
  if new.reference is not null then
    return new;
  end if;
  select code into v_code from projects where id = new.project_id;
  if v_code is null then
    raise exception 'This project has no short code yet — set one in Masters before making work orders';
  end if;
  insert into wo_counters (project_id, last_no) values (new.project_id, 1)
  on conflict (project_id) do update set last_no = wo_counters.last_no + 1
  returning last_no into v_no;
  new.wo_no := v_no;
  new.reference := 'WO/' || v_code || '/' || lpad(v_no::text, greatest(3, length(v_no::text)), '0');
  return new;
end $$;

drop trigger if exists labour_contracts_mint_reference on labour_contracts;
create trigger labour_contracts_mint_reference
  before insert on labour_contracts
  for each row execute function labour_contracts_mint_reference();

-- Number the orders that already exist, oldest first, per project.
do $$
declare
  r record;
  v_no int;
begin
  for r in
    select c.id, c.project_id, p.code
    from labour_contracts c join projects p on p.id = c.project_id
    where c.reference is null and p.code is not null
    order by c.project_id, c.created_at, c.id
  loop
    insert into wo_counters (project_id, last_no) values (r.project_id, 1)
    on conflict (project_id) do update set last_no = wo_counters.last_no + 1
    returning last_no into v_no;
    -- The guard (below) refuses identity changes on approved orders; the
    -- backfill runs before it learns about the reference.
    update labour_contracts
      set wo_no = v_no,
          reference = 'WO/' || r.code || '/' || lpad(v_no::text, greatest(3, length(v_no::text)), '0')
      where id = r.id;
  end loop;
end $$;

-- 0026's guard, with the number permanent always and the terms
-- permanent once approved. Everything else unchanged.
create or replace function labour_contracts_guard()
returns trigger
language plpgsql
as $$
begin
  if (new.wo_no, new.reference) is distinct from (old.wo_no, old.reference)
     and old.reference is not null then
    raise exception 'A work order''s number is permanent';
  end if;

  if new.status = old.status then
    if old.status = 'approved'
       and (new.vendor_id, new.project_id, new.plot_id, new.unit_id,
            new.description, new.contract_value, new.terms)
           is distinct from
           (old.vendor_id, old.project_id, old.plot_id, old.unit_id,
            old.description, old.contract_value, old.terms) then
      raise exception 'An approved work order''s terms are permanent — deactivate it and make a new one';
    end if;
    return new;
  end if;

  if old.status = 'pending_approval' and new.status = 'approved' then
    if not (is_admin() or exists (
      select 1 from bill_approvers a where a.user_id = auth.uid()
    )) then
      raise exception 'Only a named bill approver or an admin can approve a work order';
    end if;
    if new.approved_by is null or new.approved_at is null then
      raise exception 'Approving must record who approved and when';
    end if;
    return new;
  end if;

  raise exception 'Invalid work order status change: % -> %', old.status, new.status;
end $$;

-- ---------------------------------------------------------------------
-- 2. The works on a work order
-- ---------------------------------------------------------------------

create table if not exists labour_contract_lines (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references labour_contracts (id),
  sort_order int not null default 0,
  work_item_id uuid references work_items (id),
  description text not null check (length(trim(description)) > 0),
  is_lump_sum boolean not null default false,
  uom text references uoms (name) on update cascade,
  quantity numeric,
  rate numeric not null check (rate >= 0),
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint labour_contract_lines_shape check (
    (is_lump_sum and quantity is null)
    or (not is_lump_sum and quantity is not null and quantity > 0 and uom is not null)
  )
);

create index if not exists labour_contract_lines_contract_idx on labour_contract_lines (contract_id);
create index if not exists labour_contract_lines_work_idx on labour_contract_lines (work_item_id);

-- Lines move only while the order awaits approval; FOR SHARE on the
-- parent serialises a line write against the approval (the
-- po_lines_draft_only shape).
create or replace function labour_contract_lines_pending_only()
returns trigger
language plpgsql
as $$
declare
  v_contract uuid;
  v_status text;
begin
  v_contract := case when tg_op = 'DELETE' then old.contract_id else new.contract_id end;
  select status into v_status from labour_contracts where id = v_contract for share;
  if v_status is distinct from 'pending_approval' then
    raise exception 'This work order is approved — its works can no longer change';
  end if;
  if tg_op = 'UPDATE' and new.contract_id <> old.contract_id then
    raise exception 'A line stays on the work order it was made on';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

drop trigger if exists labour_contract_lines_pending_only on labour_contract_lines;
create trigger labour_contract_lines_pending_only
  before insert or update or delete on labour_contract_lines
  for each row execute function labour_contract_lines_pending_only();

-- While lines exist, the order's value IS their sum. The last line
-- removed leaves the value as it was (contract_value must stay > 0).
create or replace function labour_contract_lines_sum_value()
returns trigger
language plpgsql
as $$
declare
  v_contract uuid;
  v_sum numeric;
begin
  v_contract := case when tg_op = 'DELETE' then old.contract_id else new.contract_id end;
  select round(sum(case when is_lump_sum then rate else quantity * rate end), 2)
    into v_sum
    from labour_contract_lines where contract_id = v_contract;
  if v_sum is not null and v_sum > 0 then
    update labour_contracts set contract_value = v_sum where id = v_contract;
  end if;
  return null;
end $$;

drop trigger if exists labour_contract_lines_sum_value on labour_contract_lines;
create trigger labour_contract_lines_sum_value
  after insert or update or delete on labour_contract_lines
  for each row execute function labour_contract_lines_sum_value();

-- ---------------------------------------------------------------------
-- 3. Templates
-- ---------------------------------------------------------------------

create table if not exists work_order_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  terms text,
  is_active boolean not null default true,
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists work_order_templates_name_unique
  on work_order_templates (lower(trim(name)));

create table if not exists work_order_template_lines (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references work_order_templates (id) on delete cascade,
  sort_order int not null default 0,
  work_item_id uuid references work_items (id),
  description text not null check (length(trim(description)) > 0),
  is_lump_sum boolean not null default false,
  uom text references uoms (name) on update cascade,
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists work_order_template_lines_template_idx
  on work_order_template_lines (template_id);

-- ---------------------------------------------------------------------
-- 4. Audit, updated_at, RLS — every new table
-- ---------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['labour_contract_lines', 'work_order_templates', 'work_order_template_lines'] loop
    execute format('drop trigger if exists audit_%s on %I', t, t);
    execute format(
      'create trigger audit_%s after insert or update or delete on %I for each row execute function audit_row()', t, t);
    execute format('drop trigger if exists set_updated_at on %I', t);
    execute format(
      'create trigger set_updated_at before update on %I for each row execute function set_updated_at()', t);
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- Lines carry rates: the labour_contracts qual (0055 — /bills or
-- /reporter), one policy per verb.
drop policy if exists "labour_contract_lines readable by bills or reporter" on labour_contract_lines;
create policy "labour_contract_lines readable by bills or reporter" on labour_contract_lines
  for select to authenticated using (has_app('/bills') or has_app('/reporter'));
drop policy if exists "labour_contract_lines insertable by bills app" on labour_contract_lines;
create policy "labour_contract_lines insertable by bills app" on labour_contract_lines
  for insert to authenticated with check (has_app('/bills'));
drop policy if exists "labour_contract_lines updatable by bills app" on labour_contract_lines;
create policy "labour_contract_lines updatable by bills app" on labour_contract_lines
  for update to authenticated using (has_app('/bills')) with check (has_app('/bills'));
drop policy if exists "labour_contract_lines deletable by bills app" on labour_contract_lines;
create policy "labour_contract_lines deletable by bills app" on labour_contract_lines
  for delete to authenticated using (has_app('/bills'));

-- Templates hold no money; they are Bills' working papers.
drop policy if exists "work_order_templates readable by bills app" on work_order_templates;
create policy "work_order_templates readable by bills app" on work_order_templates
  for select to authenticated using (has_app('/bills'));
drop policy if exists "work_order_templates insertable by bills app" on work_order_templates;
create policy "work_order_templates insertable by bills app" on work_order_templates
  for insert to authenticated with check (has_app('/bills'));
drop policy if exists "work_order_templates updatable by bills app" on work_order_templates;
create policy "work_order_templates updatable by bills app" on work_order_templates
  for update to authenticated using (has_app('/bills')) with check (has_app('/bills'));

drop policy if exists "work_order_template_lines readable by bills app" on work_order_template_lines;
create policy "work_order_template_lines readable by bills app" on work_order_template_lines
  for select to authenticated using (has_app('/bills'));
drop policy if exists "work_order_template_lines insertable by bills app" on work_order_template_lines;
create policy "work_order_template_lines insertable by bills app" on work_order_template_lines
  for insert to authenticated with check (has_app('/bills'));
drop policy if exists "work_order_template_lines updatable by bills app" on work_order_template_lines;
create policy "work_order_template_lines updatable by bills app" on work_order_template_lines
  for update to authenticated using (has_app('/bills')) with check (has_app('/bills'));
drop policy if exists "work_order_template_lines deletable by bills app" on work_order_template_lines;
create policy "work_order_template_lines deletable by bills app" on work_order_template_lines
  for delete to authenticated using (has_app('/bills'));

-- ---------------------------------------------------------------------
-- 5. work_labour_rate_facts — the rate book's labour rate, for Bills
-- ---------------------------------------------------------------------

create or replace view work_labour_rate_facts with (security_barrier) as
  select i.work_item_id, i.uom, i.labour_rate
  from estimator_work_info i
  where has_app('/bills') or has_app('/estimator');

revoke all on work_labour_rate_facts from public, anon;
revoke insert, update, delete, truncate on work_labour_rate_facts from anon, authenticated;
grant select on work_labour_rate_facts to authenticated;

-- ---------------------------------------------------------------------
-- 6. Prove it
-- ---------------------------------------------------------------------

do $$
declare
  t text;
  v int;
begin
  foreach t in array array['labour_contract_lines', 'work_order_templates', 'work_order_template_lines', 'wo_counters'] loop
    if not exists (select 1 from pg_class where relname = t and relrowsecurity) then
      raise exception '0105: % is missing or has RLS off', t;
    end if;
    select count(*) into v from pg_policies
      where schemaname = 'public' and tablename = t and cmd = 'SELECT';
    if v <> 1 then raise exception '0105: % has % SELECT policies, expected 1', t, v; end if;
    if exists (select 1 from pg_policies
      where schemaname = 'public' and tablename = t and 'anon' = any(roles)) then
      raise exception '0105: % has a policy for anon', t;
    end if;
  end loop;

  if exists (select 1 from labour_contracts c join projects p on p.id = c.project_id
    where c.reference is null and p.code is not null) then
    raise exception '0105: a work order on a coded project has no number';
  end if;

  if not exists (select 1 from pg_views where viewname = 'work_labour_rate_facts'
    and definition like '%has_app(''/bills''%' and definition like '%has_app(''/estimator''%') then
    raise exception '0105: work_labour_rate_facts must be gated to /bills or /estimator';
  end if;

  if exists (select 1 from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'work_labour_rate_facts'
      and grantee in ('anon', 'authenticated', 'PUBLIC')
      and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')) then
    raise exception '0105: work_labour_rate_facts is writable';
  end if;
end $$;
