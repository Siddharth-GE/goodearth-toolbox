-- Second-pass audit — audit coverage for access control, and index
-- housekeeping.
--
-- Re-runnable throughout: `if not exists` / `if exists` on everything.

-- ---------------------------------------------------------------------
-- 1. Audit the two tables access control lives in
-- ---------------------------------------------------------------------
-- audit_row() (0006) covers every selections/budgets table, but not
-- profiles or user_apps — so "who made this person an admin" and "who
-- granted this person /budgets" were unanswerable, on exactly the two
-- tables migrations 0013/0014 spent hardening. Recorded now, before a
-- maintainer gets an account.

drop trigger if exists audit_profiles on profiles;
create trigger audit_profiles
  after insert or update or delete on profiles
  for each row execute function audit_row();

-- audit_row() records new.id, and user_apps had no id column (its primary
-- key is the (user_id, app) pair — still is). The surrogate id exists
-- only so the shared audit trigger works; PLAN.md already records this
-- convention: any audited table needs an `id`.
alter table user_apps add column if not exists id uuid not null default gen_random_uuid();
create unique index if not exists user_apps_id_key on user_apps (id);

drop trigger if exists audit_user_apps on user_apps;
create trigger audit_user_apps
  after insert or update or delete on user_apps
  for each row execute function audit_row();

-- ---------------------------------------------------------------------
-- 2. Drop five redundant indexes
-- ---------------------------------------------------------------------
-- The same class 0016's section 4 removed — except two of these 0016
-- itself created, as duplicates under new names of auto-named indexes
-- that already existed (so its own `if not exists` didn't catch them),
-- and three are originals its additions superseded. Each pair is listed;
-- the survivor stays because it covers everything the dropped one did.

-- Duplicate of item_requests_provisional_item_id_idx (0006) — identical
-- definition, different name.
drop index if exists item_requests_provisional_idx;

-- Duplicate of marathon_entries_run_id_idx (0002) — identical definition.
drop index if exists marathon_entries_run_idx;

-- Full index superseded by the partial budget_lines_vendor_idx (0016):
-- every real query filters on a non-null vendor, which the partial covers
-- with a fraction of the writes.
drop index if exists budget_lines_expected_vendor_id_idx;

-- Strict prefix of selections_status_issued_idx (0016).
drop index if exists selections_status_idx;

-- Strict prefix of marathon_entries_agent_created_idx (0016).
drop index if exists marathon_entries_agent_id_idx;
