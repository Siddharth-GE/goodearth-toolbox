-- 0058 — Financial Management: funding facilities, movements, and the
-- tool's read surface.
--
-- The founder's decision (Financial Management PLAN.md): the tool shows
-- the company's whole money picture — collections in, bills out, plan
-- targets ahead — and owns one genuinely new area, funds raised from
-- banks, private equity and private lenders, with interest.
--
-- THE READ SURFACE IS VIEWS ONLY. No table's SELECT qual changes here.
-- 0055's invariants ("exactly seven widened policies, no doubles") stay
-- untouched; "never a second SELECT policy" is satisfied trivially.
-- Three moves below:
--
--   * A NEW owner view, bill_money_facts — bills money for
--     /financial-management without widening the bills qual a second
--     time. 0055 states the cost of a widened table qual plainly: every
--     column travels with the grant. This tool needs amounts, dates and
--     identity, not `payment_ref`, `rejection_note` or `note` — so the
--     column list is the boundary, 0056's exact mechanism. It must
--     never be confused with `bill_facts`, which is money-free by
--     design and must stay that way (0025:460, asserted below).
--
--   * The 0056 CRM fact views and 0057's business_plan_target_facts are
--     RESTATED with their WHERE widened three-way to add
--     has_app('/financial-management'). Column lists byte-identical —
--     the prose omission (0056) and the aggregate-not-join shape (0057)
--     are unchanged.
--
-- RE-RUN HAZARD, stated plainly: 0056 and 0057 are re-runnable and
-- restate these views with the TWO-way WHERE. Re-running either AFTER
-- this file would silently strip /financial-management back out.
-- Accepted — migrations run in order — but any future correction to
-- those views must carry the three-way WHERE forward, and the assertion
-- in §7 fails loudly if this file's own widening didn't land.
--
-- Re-runnable throughout.

-- ---------------------------------------------------------------------
-- 1. funding_facilities — one row per source of funds
-- ---------------------------------------------------------------------
-- Set up once: who, what kind of money, at what rate. Terms across
-- banks, PE and private lenders are mixed and different by nature, so
-- `interest_rate_pct` is nullable (equity has no rate; an irregular
-- deal may have no meaningful one) and `terms` is free text — the
-- computed accrual in lib/financial-management/interest.ts is
-- informational, the recorded movements are the truth.

create table if not exists funding_facilities (
  id uuid primary key default gen_random_uuid(),
  party text not null check (length(trim(party)) > 0),
  kind text not null check (kind in ('bank_loan', 'private_equity', 'private_debt')),
  interest_rate_pct numeric check (interest_rate_pct >= 0),
  -- Informational; accrual runs from the first drawdown movement, not
  -- from this date.
  start_date date,
  -- The agreed cap, where one exists. Null = no cap agreed.
  sanctioned_amount numeric check (sanctioned_amount > 0),
  terms text,
  -- Deactivate, don't delete: a closed loan keeps its history.
  is_active boolean not null default true,
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists audit_funding_facilities on funding_facilities;
create trigger audit_funding_facilities
  after insert or update or delete on funding_facilities
  for each row execute function audit_row();

drop trigger if exists set_updated_at on funding_facilities;
create trigger set_updated_at
  before update on funding_facilities
  for each row execute function set_updated_at();

alter table funding_facilities enable row level security;

-- SELECT is gated too: who lent the company what, at what rate, is not
-- for general staff (the 0048 reasoning).
drop policy if exists "facilities readable by financial management app" on funding_facilities;
create policy "facilities readable by financial management app"
  on funding_facilities for select to authenticated
  using (has_app('/financial-management'));

drop policy if exists "facilities writable by financial management app" on funding_facilities;
create policy "facilities writable by financial management app"
  on funding_facilities for insert to authenticated
  with check (has_app('/financial-management'));

drop policy if exists "facilities updatable by financial management app" on funding_facilities;
create policy "facilities updatable by financial management app"
  on funding_facilities for update to authenticated
  using (has_app('/financial-management')) with check (has_app('/financial-management'));

-- DELETE exists, but the RESTRICT FK from movements makes a facility
-- with history undeletable — deletion is refused, not cascaded. The UI
-- offers "deactivate" instead.
drop policy if exists "facilities deletable by financial management app" on funding_facilities;
create policy "facilities deletable by financial management app"
  on funding_facilities for delete to authenticated
  using (has_app('/financial-management'));

-- ---------------------------------------------------------------------
-- 2. funding_movements — one row per rupee event against a facility
-- ---------------------------------------------------------------------
-- `kind` carries the direction, so `amount` is always positive:
--   drawdown  — money received from the facility
--   repayment — principal returned (return of capital, on equity)
--   interest  — interest actually paid
-- Interest movements never touch principal; the pure module keeps the
-- two ledgers apart.

create table if not exists funding_movements (
  id uuid primary key default gen_random_uuid(),
  -- RESTRICT (the default): a facility with movements cannot be
  -- deleted at all.
  facility_id uuid not null references funding_facilities (id),
  kind text not null check (kind in ('drawdown', 'repayment', 'interest')),
  amount numeric not null check (amount > 0),
  happened_on date not null,
  -- UTR / cheque no. — a reconciliation fact, kept for the same reason
  -- crm_receipt_facts keeps `reference`.
  reference text,
  note text,
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists funding_movements_facility_idx
  on funding_movements (facility_id);
create index if not exists funding_movements_happened_idx
  on funding_movements (happened_on);

drop trigger if exists audit_funding_movements on funding_movements;
create trigger audit_funding_movements
  after insert or update or delete on funding_movements
  for each row execute function audit_row();

drop trigger if exists set_updated_at on funding_movements;
create trigger set_updated_at
  before update on funding_movements
  for each row execute function set_updated_at();

alter table funding_movements enable row level security;

drop policy if exists "movements readable by financial management app" on funding_movements;
create policy "movements readable by financial management app"
  on funding_movements for select to authenticated
  using (has_app('/financial-management'));

drop policy if exists "movements writable by financial management app" on funding_movements;
create policy "movements writable by financial management app"
  on funding_movements for insert to authenticated
  with check (has_app('/financial-management'));

drop policy if exists "movements updatable by financial management app" on funding_movements;
create policy "movements updatable by financial management app"
  on funding_movements for update to authenticated
  using (has_app('/financial-management')) with check (has_app('/financial-management'));

-- Movements ARE deletable: a mistyped payment must be correctable, and
-- the audit trigger keeps the before-image.
drop policy if exists "movements deletable by financial management app" on funding_movements;
create policy "movements deletable by financial management app"
  on funding_movements for delete to authenticated
  using (has_app('/financial-management'));

-- ---------------------------------------------------------------------
-- 3. bill_money_facts — bills money for Financial Management
-- ---------------------------------------------------------------------
-- Owner view, 0056's pattern: postgres bypasses bills' RLS, so the
-- WHERE clause and the column list ARE the gate. The prose stays
-- behind: no `payment_ref`, no `rejection_note`, no `note` (asserted
-- in §7). Paid outflow = total_amount where status = 'paid', dated
-- paid_at; approved-not-paid is the near-term payables figure.

drop view if exists bill_money_facts;

create view bill_money_facts
with (security_barrier) as
select b.id,
       b.project_id,
       b.plot_id,
       b.unit_id,
       b.scope_code,
       b.vendor_id,
       b.kind,
       b.status,
       b.invoice_date,
       b.taxable_amount,
       b.gst_amount,
       b.total_amount,
       b.approved_at,
       b.paid_at,
       b.created_at,
       v.name as vendor_name,
       p.name as project_name
  from bills b
  join projects p on p.id = b.project_id
  left join vendors v on v.id = b.vendor_id
 where has_app('/bills') or has_app('/financial-management');

revoke all on bill_money_facts from public, anon;
grant select on bill_money_facts to authenticated;

-- ---------------------------------------------------------------------
-- 4. The 0056 CRM fact views, restated with a three-way WHERE
-- ---------------------------------------------------------------------
-- Everything except the WHERE is byte-identical to 0056. The omission
-- of `details`, `registration_note`, `note` and `bottlenecks` remains
-- the boundary, and §7 re-carries 0056's assertion of it.

drop view if exists crm_milestone_facts;

create view crm_milestone_facts
with (security_barrier) as
select m.id,
       m.engagement_id,
       e.project_id,
       e.unit_id,
       p.name  as project_name,
       u.name  as unit_name,
       u.client_id,
       c.name  as client_name,
       m.stage,
       m.sort_order,
       m.due_amount,
       m.due_on,
       m.invoice_no,
       m.invoiced_on,
       coalesce(rs.total, 0) as received_amount,
       m.created_at
  from client_payment_milestones m
  join client_engagements e on e.id = m.engagement_id
  join units u    on u.id = e.unit_id
  join projects p on p.id = e.project_id
  left join clients c on c.id = u.client_id
  left join (
    select milestone_id, sum(amount) as total
      from client_receipts
     where milestone_id is not null
     group by milestone_id
  ) rs on rs.milestone_id = m.id
 where has_app('/client-relations')
    or has_app('/reporter')
    or has_app('/financial-management');

revoke all on crm_milestone_facts from public, anon;
grant select on crm_milestone_facts to authenticated;

drop view if exists crm_receipt_facts;

create view crm_receipt_facts
with (security_barrier) as
select r.id,
       r.engagement_id,
       e.project_id,
       e.unit_id,
       p.name  as project_name,
       u.name  as unit_name,
       u.client_id,
       c.name  as client_name,
       r.milestone_id,
       m.stage as milestone_stage,
       r.amount,
       r.received_on,
       r.mode,
       r.reference,
       r.created_at
  from client_receipts r
  join client_engagements e on e.id = r.engagement_id
  join units u    on u.id = e.unit_id
  join projects p on p.id = e.project_id
  left join clients c on c.id = u.client_id
  left join client_payment_milestones m on m.id = r.milestone_id
 where has_app('/client-relations')
    or has_app('/reporter')
    or has_app('/financial-management');

revoke all on crm_receipt_facts from public, anon;
grant select on crm_receipt_facts to authenticated;

-- ---------------------------------------------------------------------
-- 5. business_plan_target_facts, restated with a three-way WHERE
-- ---------------------------------------------------------------------
-- Byte-identical to 0057 §3 except the WHERE.

drop view if exists business_plan_target_facts;

create view business_plan_target_facts
with (security_barrier) as
select t.id,
       t.plan_id,
       t.plan_name,
       t.scenario_name,
       t.project_id,
       p.name as project_name,
       t.revenue,
       t.total_cost,
       t.pbt,
       t.margin_pct,
       t.peak_funding,
       coalesce((
         select sum(b.total_amount) from bills b where b.project_id = t.project_id
       ), 0) as actual_spend,
       coalesce((
         select sum(r.amount)
           from client_receipts r
           join client_engagements e on e.id = r.engagement_id
          where e.project_id = t.project_id
       ), 0) as actual_collections,
       t.updated_at as published_at
  from business_plan_targets t
  join projects p on p.id = t.project_id
 where has_app('/business-planning')
    or has_app('/reporter')
    or has_app('/financial-management');

revoke all on business_plan_target_facts from public, anon;
grant select on business_plan_target_facts to authenticated;

-- ---------------------------------------------------------------------
-- 6. No CHECK change needed
-- ---------------------------------------------------------------------
-- '/financial-management' has been in both user_apps_app_known and
-- role_apps_app_known since 0030 (restated whole in 0052). Noted so
-- nobody goes looking — the same note 0048 §3 and 0050 §11 leave.

-- ---------------------------------------------------------------------
-- 7. Proof, not trust
-- ---------------------------------------------------------------------

do $$
declare
  widened int;
begin
  -- (a) Exactly four views admit /financial-management: the new
  -- bill_money_facts plus the three restated above. A typo in a WHERE
  -- would otherwise pass silently.
  select count(*) into widened
    from pg_views
   where schemaname = 'public'
     and definition like '%/financial-management%';
  if widened <> 4 then
    raise exception 'expected 4 views admitting /financial-management, found %', widened;
  end if;

  -- (b) bill_money_facts leaks no prose — the column list is the
  -- boundary, so a careless column added later fails loudly here.
  if exists (
    select 1 from information_schema.columns
     where table_name = 'bill_money_facts'
       and column_name in ('payment_ref', 'rejection_note', 'note')
  ) then
    raise exception 'bill_money_facts exposes a prose column';
  end if;

  -- (c) The restated CRM views still omit every prose column — 0056's
  -- assertion, re-carried because this file redefines them.
  if exists (
    select 1 from information_schema.columns
     where table_name in ('crm_milestone_facts', 'crm_receipt_facts')
       and column_name in ('note', 'details', 'registration_note', 'bottlenecks')
  ) then
    raise exception 'a CRM fact view exposes a prose column';
  end if;

  -- (d) bill_facts stayed money-free (0025:460's rule) — this file adds
  -- a money-bearing bills view and must not be confused with it.
  if exists (
    select 1 from information_schema.columns
     where table_name = 'bill_facts'
       and column_name in ('taxable_amount', 'gst_amount', 'total_amount')
  ) then
    raise exception 'bill_facts has grown a money column';
  end if;

  -- (e) The two new tables are RLS'd with exactly one SELECT policy
  -- each — never a second policy, which ORs in invisibly (0025:470).
  if exists (
    select 1 from pg_tables
     where schemaname = 'public'
       and tablename in ('funding_facilities', 'funding_movements')
       and not rowsecurity
  ) then
    raise exception 'a funding table has RLS off';
  end if;

  if exists (
    select 1 from pg_policies
     where cmd = 'SELECT'
       and tablename in ('funding_facilities', 'funding_movements')
     group by tablename having count(*) <> 1
  ) then
    raise exception 'a funding table does not have exactly one SELECT policy';
  end if;
end $$;
