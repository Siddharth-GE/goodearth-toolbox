-- 0040 — Pusher: give pusher_project_plans the surrogate id audit needs.
--
-- 0039 attached audit_row() to a table keyed on project_id with no `id`
-- column. audit_row() (0006) does `target := new.id`, so EVERY write to
-- that table raised at runtime — setting a project's start date failed
-- with "Could not set the start date." and no schedule could be created
-- at all.
--
-- This is the same trap that user_apps hit in 0018, gst_rates in 0031
-- and role_apps in 0034, and the fix is theirs: add a surrogate id
-- rather than drop the auditing. A project's schedule start moving is
-- exactly the kind of change someone will later want to account for.
--
-- The primary key stays project_id — one plan per project is the point.
-- The id is only ever read by the audit trigger.
--
-- Found by driving the running app, which is the only place it could
-- have been found: it typechecks, it builds, and the SQL is valid.
--
-- Re-runnable.

alter table pusher_project_plans
  add column if not exists id uuid not null default gen_random_uuid();

create unique index if not exists pusher_project_plans_id_key
  on pusher_project_plans (id);
