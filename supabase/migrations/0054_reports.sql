-- 0054 — Reporter: saved reports.
--
-- Stage 5 of app/(dashboard)/reporter/PLAN.md. A saved report is a NAME
-- and a SPEC — which data set, which columns, filters, grouping,
-- measures, sort and chart. It is not a snapshot of numbers: running it
-- re-reads the live tables through the reader's own RLS, so the same
-- saved report shows a person exactly what that person is allowed to
-- see, and nothing about who saved it changes that.
--
-- Shaped like 0048_business_plans.sql, and for the same reason: a spec
-- is only ever read and written whole, has a variable shape, and gains
-- fields as the tool grows. As columns it would be a migration every
-- time the builder learns a new trick. `schema_version` sits beside it
-- so a document written before a field existed can be migrated in code,
-- with the version to migrate FROM known rather than guessed.
--
-- What the database cannot check here, code must. `parseReportSpec`
-- (lib/reporter/spec.ts) is that gate: every string in a spec resolves
-- against the dataset registry, unknown keys are DROPPED rather than
-- thrown, so a report saved before a rename still opens. Nothing in
-- this jsonb ever reaches a select, a filter column or an order clause
-- as text.
--
-- Re-runnable throughout.

-- ---------------------------------------------------------------------
-- 1. reports — a report is a saved question, not a saved answer
-- ---------------------------------------------------------------------
-- `dataset` is denormalised out of the spec so the list page can say
-- what each report is over without parsing every document. The spec
-- remains the truth; this column is a label. It is not a foreign key
-- because the registry is code, not a table.

create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  description text,
  dataset text not null,
  schema_version int not null default 1,
  spec jsonb not null default '{}'::jsonb,
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The list page orders by most-recently-touched. No unique constraint
-- on name: two reports called "Cement" that differ by project are the
-- normal case, and the seven starting points exist precisely so people
-- make their own variants of them.
create index if not exists reports_updated_idx
  on reports (updated_at desc);

-- ---------------------------------------------------------------------
-- 2. Audit, updated_at, RLS
-- ---------------------------------------------------------------------

drop trigger if exists audit_reports on reports;
create trigger audit_reports
  after insert or update or delete on reports
  for each row execute function audit_row();

drop trigger if exists set_updated_at on reports;
create trigger set_updated_at
  before update on reports
  for each row execute function set_updated_at();

alter table reports enable row level security;

-- SELECT is gated on the grant, but note what it is gating: a spec
-- holds no money, no names and no figures — it is a question. The
-- money appears only when the report is RUN, and then through the
-- normal policies on whatever tables it reads. Widening this policy
-- would leak nothing; it is gated only because a person without
-- /reporter has no screen to see it on.
drop policy if exists "reports readable by reporter app" on reports;
create policy "reports readable by reporter app"
  on reports for select to authenticated
  using (has_app('/reporter'));

drop policy if exists "reports writable by reporter app" on reports;
create policy "reports writable by reporter app"
  on reports for insert to authenticated
  with check (has_app('/reporter'));

-- Anyone with the grant may edit any report. Reports are shared team
-- property, like a spreadsheet on a shared drive — the audit trigger
-- keeps every before-image, and `updated_by` says who last touched it.
drop policy if exists "reports updatable by reporter app" on reports;
create policy "reports updatable by reporter app"
  on reports for update to authenticated
  using (has_app('/reporter')) with check (has_app('/reporter'));

-- Delete is narrower than update, on the "recorded bills deletable by
-- recorder" precedent (0025:561): editing someone's report is a change
-- they can see and undo, deleting it is not. Your own, or an admin's
-- call.
drop policy if exists "reports deletable by owner" on reports;
create policy "reports deletable by owner"
  on reports for delete to authenticated
  using (has_app('/reporter') and (is_admin() or created_by = auth.uid()));

-- ---------------------------------------------------------------------
-- 3. No CHECK change needed
-- ---------------------------------------------------------------------
-- '/reporter' was added to both user_apps_app_known and
-- role_apps_app_known by 0052. Settings can already grant this tool.
-- Noted so the next person does not go looking for the CHECK that
-- "must" be missing.
