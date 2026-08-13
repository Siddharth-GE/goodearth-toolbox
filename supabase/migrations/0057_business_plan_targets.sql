-- 0057 — Business Planning publishes targets; Reporter reads them.
--
-- Stage 10 of app/(dashboard)/reporter/PLAN.md, DECLARED BY BUSINESS
-- PLANNING so the coupling points the right way (the 0045 precedent:
-- the migration lives with the tool that owns the write).
--
-- WHY THIS TABLE EXISTS: Reporter must not import
-- lib/business-planning/model.ts. 0048 gave business_plans no FK to
-- anything on purpose ("a plan is for land you have not bought"), and a
-- plan's revenue and PBT are not stored at all — they are recomputed by
-- runScenario on every read. Publishing targets into a table of plain
-- numbers, written by Business Planning's own actions from its own
-- engine, is the only route that respects "one tool never imports
-- another tool's code."
--
-- Re-runnable throughout.

-- ---------------------------------------------------------------------
-- 1. business_plans gains an OPTIONAL project link
-- ---------------------------------------------------------------------
-- Nullable, and the tool stays fully usable without it: a plan for land
-- not yet bought has no project. Setting the link is what turns the
-- plan's headline numbers into published targets.

alter table business_plans
  add column if not exists project_id uuid references projects (id);

-- ---------------------------------------------------------------------
-- 2. business_plan_targets — the published headline numbers
-- ---------------------------------------------------------------------
-- One row per plan, upserted by savePlan/renamePlan whenever a linked
-- plan is saved, deleted when the link is removed. Plain numbers from
-- the active scenario — no jsonb, because Reporter reads these as
-- columns and the engine remains the one place that computes them.

create table if not exists business_plan_targets (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null unique references business_plans (id) on delete cascade,
  project_id uuid not null references projects (id),
  plan_name text not null,
  scenario_name text not null,
  revenue numeric not null,
  total_cost numeric not null,
  pbt numeric not null,
  margin_pct numeric,
  peak_funding numeric not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles (id)
);

create index if not exists business_plan_targets_project_idx
  on business_plan_targets (project_id);

drop trigger if exists audit_business_plan_targets on business_plan_targets;
create trigger audit_business_plan_targets
  after insert or update or delete on business_plan_targets
  for each row execute function audit_row();

drop trigger if exists set_updated_at on business_plan_targets;
create trigger set_updated_at
  before update on business_plan_targets
  for each row execute function set_updated_at();

alter table business_plan_targets enable row level security;

-- Same boundary as the plans themselves (0048): the numbers carry land
-- cost, profit and funding, so SELECT is gated too. Reporter reads the
-- VIEW below, never this table.
drop policy if exists "plan targets readable by business planning app" on business_plan_targets;
create policy "plan targets readable by business planning app"
  on business_plan_targets for select to authenticated
  using (has_app('/business-planning'));

drop policy if exists "plan targets writable by business planning app" on business_plan_targets;
create policy "plan targets writable by business planning app"
  on business_plan_targets for insert to authenticated
  with check (has_app('/business-planning'));

drop policy if exists "plan targets updatable by business planning app" on business_plan_targets;
create policy "plan targets updatable by business planning app"
  on business_plan_targets for update to authenticated
  using (has_app('/business-planning')) with check (has_app('/business-planning'));

drop policy if exists "plan targets deletable by business planning app" on business_plan_targets;
create policy "plan targets deletable by business planning app"
  on business_plan_targets for delete to authenticated
  using (has_app('/business-planning'));

-- ---------------------------------------------------------------------
-- 3. business_plan_target_facts — targets BESIDE actuals
-- ---------------------------------------------------------------------
-- The founder's decision 7: "Business Planning gains a project link and
-- publishes its numbers so Reporter can put actuals beside them." The
-- actuals are aggregates, computed here so no dataset ever joins plan
-- rows to bill or receipt rows (the fan-out that triples a sum):
--
--   actual_spend        every bill's total for the project, any status —
--                       a recorded bill is claimed money even before
--                       approval, and this is a planning comparison,
--                       not a payment run
--   actual_collections  every client receipt for the project
--
-- Owner view: WHERE + column list are the gate, 0056's exact pattern,
-- because /reporter must read it without holding /business-planning.

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
 where has_app('/business-planning') or has_app('/reporter');

revoke all on business_plan_target_facts from public, anon;
grant select on business_plan_target_facts to authenticated;
