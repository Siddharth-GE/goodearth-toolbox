-- 0077 — Submit makes an estimate official
--
-- FOUNDER, 2026-08-19 (the estimator-becomes-the-backbone decision):
-- indents will pull from a villa's estimate and store issues will be
-- compared against it, so "the estimate" has to mean ONE document — not
-- whichever of a villa's drafts was edited last. Submit is that moment:
-- the estimate locks, gets a reference (EST/<project code>/NNN), records
-- who submitted it, and becomes the villa's official estimate. A later
-- revision supersedes it, the Selections shape. Drafts stay freely
-- editable alongside; templates never submit.
--
-- THE SNAPSHOT IS WRITTEN BY THE APP, VALIDATED BY THE DATABASE. The
-- arithmetic that expands works into materials lives in
-- lib/estimator/calc.ts (pure, tested) and nowhere else — porting it
-- into SQL would be a second implementation that drifts. So the app
-- computes the per-line costs and the per-work material takeoff and
-- writes them into the two snapshot tables below while the estimate is
-- still a draft; submit_estimate() then refuses to run if the snapshot
-- is missing. Three problems die at once: totals stop moving when a
-- rate changes ("locked estimates", TODO §11), the frozen quantities
-- are readable by SQL (the 0078 cross-tool view needs no arithmetic),
-- and the takeoff is pinned per (work, material) — which is the only
-- granularity from which "issues for this work exceed the estimate"
-- can ever be computed.
--
-- NULL-NOT-ZERO SURVIVES THE FREEZE. A rate nobody had entered at
-- submit time is null in the snapshot too; the frozen BOQ says "not
-- priced", exactly as the live one did. A snapshot that turned unknown
-- into ₹0 would be the lying-number failure in its most permanent form.
--
-- Re-runnable throughout.

-- ---------------------------------------------------------------------
-- 1. The lifecycle columns
-- ---------------------------------------------------------------------

alter table estimator_estimates
  add column if not exists status text not null default 'draft';
alter table estimator_estimates
  add column if not exists est_no int;
alter table estimator_estimates
  add column if not exists reference text;
alter table estimator_estimates
  add column if not exists submitted_by uuid references profiles (id);
alter table estimator_estimates
  add column if not exists submitted_at timestamptz;
alter table estimator_estimates
  add column if not exists superseded_at timestamptz;

alter table estimator_estimates
  drop constraint if exists estimator_estimates_status_known;
alter table estimator_estimates
  add constraint estimator_estimates_status_known
  check (status in ('draft', 'submitted', 'superseded'));

-- A template is a working document forever; only a villa's estimate
-- submits. (unit_id null <=> is_template is already 0074's CHECK.)
alter table estimator_estimates
  drop constraint if exists estimator_estimates_template_never_submits;
alter table estimator_estimates
  add constraint estimator_estimates_template_never_submits
  check (not is_template or status = 'draft');

alter table estimator_estimates
  drop constraint if exists estimator_estimates_reference_key;
alter table estimator_estimates
  add constraint estimator_estimates_reference_key unique (reference);

alter table estimator_estimates
  drop constraint if exists estimator_estimates_no_key;
alter table estimator_estimates
  add constraint estimator_estimates_no_key unique (project_id, est_no);

-- ONE official estimate per villa. The partial unique index is the
-- enforcement — submit_estimate() supersedes the previous one inside
-- the same transaction, and a race between two submits loses here,
-- loudly, instead of leaving two "official" answers.
create unique index if not exists estimator_estimates_official_key
  on estimator_estimates (unit_id)
  where status = 'submitted';

create index if not exists estimator_estimates_status_idx
  on estimator_estimates (status);

-- ---------------------------------------------------------------------
-- 2. est_counters — the 0019 §4 shape, per project
-- ---------------------------------------------------------------------
-- Numbers are minted ONLY inside submit_estimate(), via the same
-- upsert-with-row-lock as create_indent(). Deleted drafts never held a
-- number (minting happens at submit), so gaps only come from revisions
-- — expected and harmless. No `id` column and therefore NO audit
-- trigger (audit_row() reads new.id and would raise, the 0039 lesson).

create table if not exists est_counters (
  project_id uuid primary key references projects (id),
  last_no int not null default 0
);

alter table est_counters enable row level security;

drop policy if exists "est_counters readable by estimator app" on est_counters;
create policy "est_counters readable by estimator app"
  on est_counters for select to authenticated using (has_app('/estimator'));
drop policy if exists "est_counters writable by estimator app" on est_counters;
create policy "est_counters writable by estimator app"
  on est_counters for insert to authenticated with check (has_app('/estimator'));
drop policy if exists "est_counters updatable by estimator app" on est_counters;
create policy "est_counters updatable by estimator app"
  on est_counters for update to authenticated
  using (has_app('/estimator')) with check (has_app('/estimator'));

-- ---------------------------------------------------------------------
-- 3. The two snapshot tables
-- ---------------------------------------------------------------------

-- What each line COST at submit, one row per estimate line. Money
-- columns are nullable because the truth they froze may be "unknown":
-- uom null = the work had no setup at all; each null cost = that half
-- was unpriced. `qty` alone is always real.
create table if not exists estimator_estimate_line_costs (
  id uuid primary key default gen_random_uuid(),
  estimate_id uuid not null references estimator_estimates (id),
  -- One snapshot row per line, and it dies with the line. CASCADE, not
  -- the house RESTRICT: a draft may carry a stale snapshot from a
  -- submit that failed part-way, and RESTRICT would then refuse to
  -- remove a line from that draft. The freeze trigger still fires on
  -- the cascaded delete, and lines themselves are only ever deletable
  -- while the estimate is a draft — so nothing frozen can go this way.
  line_id uuid not null unique references estimator_estimate_lines (id) on delete cascade,
  work_item_id uuid not null references work_items (id),
  qty numeric not null check (qty > 0),
  uom text,
  labour_rate numeric check (labour_rate >= 0),
  labour_cost numeric check (labour_cost >= 0),
  material_cost numeric check (material_cost >= 0),
  total_cost numeric check (total_cost >= 0),
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists estimator_estimate_line_costs_estimate_idx
  on estimator_estimate_line_costs (estimate_id);

-- What each work NEEDS, expanded to materials — per (work, material),
-- not per material, because "issues for this work exceed the estimate"
-- is unanswerable from an aggregate. material_name and uom are copied
-- in at submit so the snapshot stays legible even if the material is
-- later renamed; rate is the material's rate that day, null if it had
-- none.
create table if not exists estimator_estimate_takeoff (
  id uuid primary key default gen_random_uuid(),
  estimate_id uuid not null references estimator_estimates (id),
  work_item_id uuid not null references work_items (id),
  material_id uuid not null references estimator_materials (id),
  material_name text not null,
  uom text not null,
  quantity numeric not null check (quantity > 0),
  rate numeric check (rate >= 0),
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (estimate_id, work_item_id, material_id)
);

create index if not exists estimator_estimate_takeoff_estimate_idx
  on estimator_estimate_takeoff (estimate_id);
create index if not exists estimator_estimate_takeoff_material_idx
  on estimator_estimate_takeoff (material_id);

-- Audit, updated_at and the four-policy /estimator gate — the 0074 loop.
do $$
declare
  t text;
begin
  for t in select unnest(array[
    'estimator_estimate_line_costs', 'estimator_estimate_takeoff'
  ])
  loop
    execute format('drop trigger if exists audit_%I on %I', t, t);
    execute format(
      'create trigger audit_%I after insert or update or delete on %I
         for each row execute function audit_row()', t, t);

    execute format('drop trigger if exists set_updated_at on %I', t);
    execute format(
      'create trigger set_updated_at before update on %I
         for each row execute function set_updated_at()', t, t);

    execute format('alter table %I enable row level security', t);

    execute format('drop policy if exists "%s readable by estimator app" on %I', t, t);
    execute format(
      'create policy "%s readable by estimator app" on %I
         for select to authenticated using (has_app(''/estimator''))', t, t);

    execute format('drop policy if exists "%s writable by estimator app" on %I', t, t);
    execute format(
      'create policy "%s writable by estimator app" on %I
         for insert to authenticated with check (has_app(''/estimator''))', t, t);

    execute format('drop policy if exists "%s updatable by estimator app" on %I', t, t);
    execute format(
      'create policy "%s updatable by estimator app" on %I
         for update to authenticated
         using (has_app(''/estimator'')) with check (has_app(''/estimator''))', t, t);

    execute format('drop policy if exists "%s deletable by estimator app" on %I', t, t);
    execute format(
      'create policy "%s deletable by estimator app" on %I
         for delete to authenticated using (has_app(''/estimator''))', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 4. The freeze: lines and snapshots writable only while draft
-- ---------------------------------------------------------------------
-- The 0019 indent_lines_draft_only shape, twice. FOR SHARE on the
-- parent so a line write and the submit UPDATE serialise instead of
-- interleaving.

create or replace function estimator_estimate_lines_draft_only()
returns trigger
language plpgsql
as $$
declare
  target_estimate uuid;
  parent_status text;
begin
  if tg_op = 'DELETE' then
    target_estimate := old.estimate_id;
  else
    target_estimate := new.estimate_id;
  end if;

  select status into parent_status
  from estimator_estimates where id = target_estimate
  for share;

  if parent_status is distinct from 'draft' then
    raise exception
      'This estimate is % — its works can only change while it is a draft. Revise it instead.',
      coalesce(parent_status, 'missing');
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end $$;

drop trigger if exists estimator_estimate_lines_draft_only on estimator_estimate_lines;
create trigger estimator_estimate_lines_draft_only
  before insert or update or delete on estimator_estimate_lines
  for each row execute function estimator_estimate_lines_draft_only();

create or replace function estimator_snapshot_frozen()
returns trigger
language plpgsql
as $$
declare
  target_estimate uuid;
  parent_status text;
begin
  if tg_op = 'DELETE' then
    target_estimate := old.estimate_id;
  else
    target_estimate := new.estimate_id;
  end if;

  select status into parent_status
  from estimator_estimates where id = target_estimate
  for share;

  if parent_status is distinct from 'draft' then
    raise exception
      'This estimate is % — its snapshot is frozen.',
      coalesce(parent_status, 'missing');
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end $$;

drop trigger if exists estimator_snapshot_frozen on estimator_estimate_line_costs;
create trigger estimator_snapshot_frozen
  before insert or update or delete on estimator_estimate_line_costs
  for each row execute function estimator_snapshot_frozen();

drop trigger if exists estimator_snapshot_frozen on estimator_estimate_takeoff;
create trigger estimator_snapshot_frozen
  before insert or update or delete on estimator_estimate_takeoff
  for each row execute function estimator_snapshot_frozen();

-- ---------------------------------------------------------------------
-- 5. The header guard — every transition whitelisted
-- ---------------------------------------------------------------------

create or replace function estimator_estimates_guard()
returns trigger
language plpgsql
as $$
begin
  -- What the paper says is permanent once it says it.
  if old.est_no is not null
     and (new.est_no, new.reference) is distinct from (old.est_no, old.reference) then
    raise exception 'An estimate''s number and reference are permanent';
  end if;
  if old.submitted_at is not null
     and (new.submitted_by, new.submitted_at)
         is distinct from (old.submitted_by, old.submitted_at) then
    raise exception 'Who submitted an estimate, and when, is permanent';
  end if;
  if old.status <> 'draft'
     and (new.project_id, new.unit_id, new.is_template)
         is distinct from (old.project_id, old.unit_id, old.is_template) then
    raise exception 'A submitted estimate''s project and villa are permanent';
  end if;

  if new.status = old.status then
    if old.status <> 'draft' then
      raise exception
        'A % estimate can no longer be edited — revise it instead', old.status;
    end if;
    return new;
  end if;

  if old.status = 'draft' and new.status = 'submitted' then
    if new.is_template then
      raise exception 'A template cannot be submitted — copy it onto a villa first';
    end if;
    if new.unit_id is null then
      raise exception 'Only a villa''s estimate can be submitted';
    end if;
    if new.est_no is null or new.reference is null
       or new.submitted_by is null or new.submitted_at is null then
      raise exception 'Submitting must mint a number and record who submitted and when';
    end if;
    return new;
  end if;

  if old.status = 'submitted' and new.status = 'superseded' then
    if new.superseded_at is null then
      raise exception 'Superseding must record when';
    end if;
    if (new.name, new.note) is distinct from (old.name, old.note) then
      raise exception 'Superseding changes the status and nothing else';
    end if;
    return new;
  end if;

  raise exception 'Invalid estimate status change: % -> %', old.status, new.status;
end $$;

drop trigger if exists estimator_estimates_guard on estimator_estimates;
create trigger estimator_estimates_guard
  before update on estimator_estimates
  for each row execute function estimator_estimates_guard();

-- Deleting narrows to drafts. A submitted estimate is superseded by a
-- revision, never erased; a superseded one is history. Recreating the
-- 0074 policy in place — same name, tighter qual — not a second policy.
drop policy if exists "estimator_estimates deletable by estimator app" on estimator_estimates;
create policy "estimator_estimates deletable by estimator app"
  on estimator_estimates for delete to authenticated
  using (has_app('/estimator') and status = 'draft');

-- ---------------------------------------------------------------------
-- 6. submit_estimate() — the only place a number is minted
-- ---------------------------------------------------------------------
-- security invoker: RLS still applies, so this is not a way around the
-- /estimator grant. The app writes the snapshot FIRST (while the
-- estimate is a draft); this function validates the snapshot exists,
-- supersedes the villa's previous official estimate, mints the number
-- and flips the status — one transaction, so a failure anywhere leaves
-- a draft with a stale snapshot and nothing else.

create or replace function submit_estimate(p_estimate_id uuid)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_project uuid;
  v_unit uuid;
  v_is_template boolean;
  v_status text;
  v_code text;
  v_no int;
  v_reference text;
begin
  select project_id, unit_id, is_template, status
    into v_project, v_unit, v_is_template, v_status
  from estimator_estimates
  where id = p_estimate_id
  for update;

  if not found then
    raise exception 'That estimate no longer exists';
  end if;
  if v_status <> 'draft' then
    raise exception 'This estimate has already been submitted';
  end if;
  if v_is_template or v_unit is null then
    raise exception 'A template cannot be submitted — copy it onto a villa first';
  end if;

  if not exists (
    select 1 from estimator_estimate_lines where estimate_id = p_estimate_id
  ) then
    raise exception 'Add at least one work before submitting this estimate';
  end if;

  -- The app computes and writes the snapshot before calling this. Both
  -- halves must be there: line costs always; takeoff rows whenever any
  -- line's work has a recipe. An estimate of recipe-less works has a
  -- legitimate takeoff of nothing, so only line costs are demanded
  -- unconditionally.
  if not exists (
    select 1 from estimator_estimate_line_costs where estimate_id = p_estimate_id
  ) then
    raise exception 'The estimate''s snapshot was not written — try submitting again';
  end if;

  select code into v_code from projects where id = v_project;
  if v_code is null then
    raise exception 'This project has no short code yet — set one in Masters before submitting';
  end if;

  -- The villa's previous official estimate steps aside inside the same
  -- transaction — the partial unique index would refuse the mint below
  -- otherwise.
  update estimator_estimates
  set status = 'superseded', superseded_at = now()
  where unit_id = v_unit and status = 'submitted' and id <> p_estimate_id;

  insert into est_counters (project_id, last_no)
  values (v_project, 1)
  on conflict (project_id) do update set last_no = est_counters.last_no + 1
  returning last_no into v_no;

  -- greatest() because lpad TRUNCATES a string longer than its target
  -- (0019's lesson); the TS mirror in lib/estimator/reference.ts must
  -- match this expression exactly.
  v_reference := 'EST/' || v_code || '/'
    || lpad(v_no::text, greatest(3, length(v_no::text)), '0');

  update estimator_estimates
  set status = 'submitted',
      est_no = v_no,
      reference = v_reference,
      submitted_by = auth.uid(),
      submitted_at = now()
  where id = p_estimate_id;

  return v_reference;
end $$;

revoke execute on function submit_estimate(uuid) from public, anon;
grant execute on function submit_estimate(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 7. Prove it all landed
-- ---------------------------------------------------------------------

do $$
declare
  v int;
  c text;
begin
  for c in select unnest(array[
    'status', 'est_no', 'reference', 'submitted_by', 'submitted_at', 'superseded_at'
  ])
  loop
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'estimator_estimates'
        and column_name = c
    ) then
      raise exception '0077: estimator_estimates.% is missing', c;
    end if;
  end loop;

  foreach c in array array[
    'estimator_estimates_status_known',
    'estimator_estimates_template_never_submits',
    'estimator_estimates_reference_key',
    'estimator_estimates_no_key'
  ]
  loop
    if not exists (select 1 from pg_constraint where conname = c) then
      raise exception '0077: constraint % is missing', c;
    end if;
  end loop;

  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'estimator_estimates_official_key'
  ) then
    raise exception '0077: the one-official-per-villa index is missing';
  end if;

  foreach c in array array[
    'est_counters', 'estimator_estimate_line_costs', 'estimator_estimate_takeoff'
  ]
  loop
    if not exists (
      select 1 from pg_class cl
      join pg_namespace n on n.oid = cl.relnamespace
      where n.nspname = 'public' and cl.relname = c
        and cl.relkind = 'r' and cl.relrowsecurity
    ) then
      raise exception '0077: % is missing or has RLS off', c;
    end if;
  end loop;

  select count(*) into v from pg_policies
  where schemaname = 'public'
    and tablename in ('estimator_estimate_line_costs', 'estimator_estimate_takeoff');
  if v <> 8 then
    raise exception '0077: expected 8 policies on the snapshot tables, found %', v;
  end if;

  select count(*) into v from pg_policies
  where schemaname = 'public' and tablename = 'est_counters';
  if v <> 3 then
    raise exception '0077: expected 3 policies on est_counters, found %', v;
  end if;

  foreach c in array array[
    'estimator_estimate_lines_draft_only',
    'estimator_snapshot_frozen',
    'estimator_estimates_guard',
    'submit_estimate'
  ]
  loop
    if not exists (select 1 from pg_proc where proname = c) then
      raise exception '0077: function % is missing', c;
    end if;
  end loop;

  if exists (
    select 1
    from information_schema.routine_privileges
    where routine_schema = 'public'
      and routine_name = 'submit_estimate'
      and grantee in ('PUBLIC', 'anon')
      and privilege_type = 'EXECUTE'
  ) then
    raise exception '0077: anon can still execute submit_estimate';
  end if;
end $$;
