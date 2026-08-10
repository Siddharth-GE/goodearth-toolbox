-- 0048 — Business Planning: the quick project plan.
--
-- Founder, 2026-08-10, handing over Vihara_BusinessPlan_JV.xlsx: "in the
-- business planning module of our app i want to build something like
-- this for quick plans", and then the shape it should take — "each line
-- like row house, plotted development, apartment, commercial, senior
-- living etc will have their own inputs (some projects may just be one
-- thing other projects will be a mix of some) ... then a summary that
-- collates all of them. keep this app simple and independent completely."
--
-- That workbook's own Guide sheet states its reuse plan: "clone the
-- workbook per village/hamlet and re-enter the blue assumptions." Which
-- is the spreadsheet problem this whole toolbox exists to end — clones
-- drift, nobody knows which file is current, and two plans can never sit
-- side by side.
--
-- ONE TABLE. No views, no functions, no triggers of its own beyond the
-- shared two, and no foreign key to any other tool's data — not even
-- `projects`. "Completely independent" was an explicit instruction, and
-- it is worth honouring literally: a plan is for land you have not
-- bought, for a project that does not exist yet, and nothing in Masters
-- moving should ever be able to break one.
--
-- Re-runnable throughout.

-- ---------------------------------------------------------------------
-- 1. business_plans — a plan is a document
-- ---------------------------------------------------------------------
-- The `inputs` jsonb holds the plan's assumptions AND its lines. This is
-- the first jsonb *document column* in the schema (jsonb exists today
-- only as function parameters in Relay and as the before/after images in
-- audit_log), so it is a deliberate departure and worth the paragraph:
--
--   * A plan has ~40 scalar assumptions plus a variable-length list of
--     lines, each with ~20 fields of its own, and the two line kinds
--     (SALE and HOLD) share almost none of those fields. As columns that
--     is a table nobody can read; as child tables it is three tables,
--     ordering and orphan handling for something that is only ever read
--     and written whole.
--   * Nothing queries across plans by assumption. There is no "show me
--     every plan with a cap rate above 9%" question, and if one ever
--     arrives, jsonb answers it.
--   * Migrations here are additive-only and never edited once applied.
--     A column per assumption means a migration every time the founder
--     wants one more number in the model — which, for a modelling tool,
--     is the normal case rather than the exception.
--
-- What that costs: the database cannot validate the contents. So the
-- code side is not optional. `parsePlanInputs` in lib/business-planning/
-- inputs.ts is the single gate every read goes through; it defaults and
-- clamps every field, so a document written before a field existed still
-- opens. `schema_version` is stored next to it so that migration can
-- happen in code, with the version to migrate FROM known for certain
-- rather than guessed from which keys are present.
--
-- `location` is free text, not a project_id. See the header.

create table if not exists business_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  location text,
  schema_version int not null default 1,
  inputs jsonb not null default '{}'::jsonb,
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The list page orders by most-recently-touched. No unique constraint on
-- name: two plans called "Vihara" that differ only in their land deal is
-- exactly the comparison this tool exists to make possible.
create index if not exists business_plans_updated_idx
  on business_plans (updated_at desc);

-- ---------------------------------------------------------------------
-- 2. Audit, updated_at, RLS
-- ---------------------------------------------------------------------

drop trigger if exists audit_business_plans on business_plans;
create trigger audit_business_plans
  after insert or update or delete on business_plans
  for each row execute function audit_row();

drop trigger if exists set_updated_at on business_plans;
create trigger set_updated_at
  before update on business_plans
  for each row execute function set_updated_at();

alter table business_plans enable row level security;

-- SELECT is gated too, not just writes — the same exception Budgets
-- makes (0011, "the margin boundary") and for the same reason. A plan
-- carries land cost, profit, peak funding and IRR. Most tables in this
-- schema are readable by any signed-in member of staff; this one is not.
drop policy if exists "business_plans readable by business planning app" on business_plans;
create policy "business_plans readable by business planning app"
  on business_plans for select to authenticated
  using (has_app('/business-planning'));

drop policy if exists "business_plans writable by business planning app" on business_plans;
create policy "business_plans writable by business planning app"
  on business_plans for insert to authenticated
  with check (has_app('/business-planning'));

drop policy if exists "business_plans updatable by business planning app" on business_plans;
create policy "business_plans updatable by business planning app"
  on business_plans for update to authenticated
  using (has_app('/business-planning')) with check (has_app('/business-planning'));

-- Deletable, unlike a budget: a plan is a sketch, and a sketch you
-- cannot throw away stops being a sketch. The audit trigger keeps the
-- before-image either way.
drop policy if exists "business_plans deletable by business planning app" on business_plans;
create policy "business_plans deletable by business planning app"
  on business_plans for delete to authenticated
  using (has_app('/business-planning'));

-- ---------------------------------------------------------------------
-- 3. No CHECK change needed
-- ---------------------------------------------------------------------
-- '/business-planning' has been a known grant slug since 0030 and is in
-- both user_apps_app_known and role_apps_app_known as re-added by 0047
-- (lines 36 and 47). Settings could already grant this tool; it just had
-- nothing behind it. Nothing to add here — noted so the next person does
-- not go looking for the CHECK that "must" be missing.
