-- 0083 — Material outside the estimate is flagged, and the flag is forever
--
-- FOUNDER, 2026-08-20: "when a po is sent with material not part of an
-- estimate it needs to be clearly flagged like a reconciliation or
-- something into the estimate that the estimator will need to approve
-- and it sits in the estimate forever with that flag."
--
-- The DETECTION is already derived, and stays derived: every arrival at
-- the villa (a store issue, 0080, or a direct-to-site delivery, 0081)
-- that the official estimate's frozen takeoff cannot account for is
-- computed live by lib/estimator/compare.ts — no store-keeper does
-- anything extra, and nothing can be forgotten because there is no row
-- to forget to write. What needs STORING is only the estimator's
-- acknowledgement. So this table holds approvals and nothing else: a
-- row means "the estimator has seen this unplanned material and
-- accepts it". No row means pending. The flag itself never clears —
-- an approved arrival still renders with its "outside the estimate"
-- badge, permanently; approval changes who has looked, not what
-- happened.
--
-- Anchored to the ESTIMATE, not the villa: if a revision resubmits and
-- the material is now planned, the flag disappears because the takeoff
-- accounts for it — the right reconciliation loop. If it is still
-- unplanned, the new official estimate asks its estimator again.
--
-- /estimator-gated on every verb like the rest of the tool (0074).
-- There is no money here, but the approvals belong to the estimator's
-- surface and nothing else reads them. No view, no function — so no
-- revokes beyond RLS itself.
--
-- Re-runnable throughout.

create table if not exists estimator_reconciliation_approvals (
  id uuid primary key default gen_random_uuid(),
  estimate_id uuid not null references estimator_estimates (id),
  -- The work the arrival was tagged with; null = untagged history.
  work_item_id uuid references work_items (id),
  item_id uuid not null references items (id),
  note text,
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One approval per (estimate, work, item) — the untagged bucket keys on
-- the zero uuid so two null-work approvals for one item collide too.
create unique index if not exists estimator_reconciliation_approvals_key
  on estimator_reconciliation_approvals (
    estimate_id,
    item_id,
    coalesce(work_item_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

create index if not exists estimator_reconciliation_approvals_estimate_idx
  on estimator_reconciliation_approvals (estimate_id);

drop trigger if exists audit_estimator_reconciliation_approvals
  on estimator_reconciliation_approvals;
create trigger audit_estimator_reconciliation_approvals
  after insert or update or delete on estimator_reconciliation_approvals
  for each row execute function audit_row();

drop trigger if exists set_updated_at on estimator_reconciliation_approvals;
create trigger set_updated_at
  before update on estimator_reconciliation_approvals
  for each row execute function set_updated_at();

alter table estimator_reconciliation_approvals enable row level security;

drop policy if exists "estimator_reconciliation_approvals readable by estimator app"
  on estimator_reconciliation_approvals;
create policy "estimator_reconciliation_approvals readable by estimator app"
  on estimator_reconciliation_approvals for select to authenticated
  using (has_app('/estimator'));

drop policy if exists "estimator_reconciliation_approvals writable by estimator app"
  on estimator_reconciliation_approvals;
create policy "estimator_reconciliation_approvals writable by estimator app"
  on estimator_reconciliation_approvals for insert to authenticated
  with check (has_app('/estimator'));

drop policy if exists "estimator_reconciliation_approvals updatable by estimator app"
  on estimator_reconciliation_approvals;
create policy "estimator_reconciliation_approvals updatable by estimator app"
  on estimator_reconciliation_approvals for update to authenticated
  using (has_app('/estimator')) with check (has_app('/estimator'));

-- Deliberately NO delete policy: an approval is an acknowledgement on
-- the record, and the founder's "sits in the estimate forever" applies
-- to the acknowledgement too. A genuine mistake is an admin fix.

-- Prove it all landed.
do $$
declare
  v int;
begin
  if not exists (
    select 1 from pg_class cl
    join pg_namespace n on n.oid = cl.relnamespace
    where n.nspname = 'public'
      and cl.relname = 'estimator_reconciliation_approvals'
      and cl.relkind = 'r' and cl.relrowsecurity
  ) then
    raise exception '0083: estimator_reconciliation_approvals is missing or has RLS off';
  end if;

  select count(*) into v from pg_policies
  where schemaname = 'public'
    and tablename = 'estimator_reconciliation_approvals';
  if v <> 3 then
    raise exception '0083: expected 3 policies (no delete), found %', v;
  end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'estimator_reconciliation_approvals_key'
  ) then
    raise exception '0083: the one-approval-per-arrival index is missing';
  end if;
end $$;
