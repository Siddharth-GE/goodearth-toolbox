-- Second-pass audit — integrity guards.
--
-- Every rule here already existed in application code or in convention.
-- This migration moves them into the database, where they hold whatever
-- writes the row — a raw PostgREST call, a future tool, a bug. Nothing
-- below changes what the app legitimately does today; it closes the ways
-- the same thing could be done wrongly.
--
-- Re-runnable throughout (the 0016 convention): create or replace for
-- functions, drop-if-exists before create for triggers and constraints.
--
-- PREFLIGHT — run these first; each must return zero rows before the
-- matching section below can apply. If any returns rows, fix the data
-- first (each query says how).
--
--   -- Section 4 (unique unit/plot names): duplicates must be renamed.
--   select project_id, name, count(*) from plots
--     group by project_id, name having count(*) > 1;
--   select project_id, name, count(*) from units
--     group by project_id, name having count(*) > 1;
--
--   -- Section 5 (grant slugs): any row here is a typo'd grant doing
--   -- nothing; delete it or fix the slug.
--   select * from user_apps where app not in
--     ('/selections', '/budgets', '/masters', '/marathon', '/indents',
--      '/purchase-orders', '/inventory', '/bills', '/directory', '/training');
--
--   -- Section 6 (request resolution): any row here is inconsistent;
--   -- set resolved_at/resolved_by, or clear them, to match its status.
--   select * from item_requests where
--     (status = 'pending') <> (resolved_at is null)
--     or (status = 'merged' and merged_into_item_id is null);
--
--   -- Section 7 (blank margin on a priced line): backfilled to 0 below,
--   -- this just shows what the backfill will touch.
--   select * from budget_lines where unit_cost is not null and margin_pct is null;

-- ---------------------------------------------------------------------
-- 1. Close the race in both immutability triggers
-- ---------------------------------------------------------------------
-- Both triggers read the parent's status with a bare SELECT, which under
-- READ COMMITTED sees the last committed value — so a line write that
-- started just before an issue/approve committed could slip in after it.
-- FOR SHARE makes the read block on an in-flight parent UPDATE (a plain
-- status UPDATE takes FOR NO KEY UPDATE, which FOR SHARE conflicts with —
-- FOR KEY SHARE would NOT) and re-read after it commits, so a line write
-- and a status change serialize instead of interleaving.

create or replace function selection_lines_draft_only()
returns trigger
language plpgsql
as $$
declare
  target_selection uuid;
  parent_status text;
begin
  if tg_op = 'DELETE' then
    target_selection := old.selection_id;
  else
    target_selection := new.selection_id;
  end if;

  select status into parent_status
  from selections where id = target_selection
  for share;

  if parent_status is distinct from 'draft' then
    raise exception 'Selection % is % — issued revisions are immutable, create a new revision instead',
      target_selection, coalesce(parent_status, 'missing');
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end $$;

create or replace function budget_lines_pricing_only()
returns trigger
language plpgsql
as $$
declare
  target_budget uuid;
  parent_status text;
begin
  if tg_op = 'DELETE' then
    target_budget := old.budget_id;
  else
    target_budget := new.budget_id;
  end if;

  select status into parent_status
  from budgets where id = target_budget
  for share;

  if parent_status is distinct from 'pricing' then
    raise exception 'Budget % is % — re-open it before changing prices',
      target_budget, coalesce(parent_status, 'missing');
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 2. budgets_guard: whitelist the status transitions
-- ---------------------------------------------------------------------
-- Until now RLS gave any /budgets holder a blanket UPDATE on budgets, and
-- the guard only stopped version decreases — so a plain PATCH could
-- re-open an approved budget without bumping the version, leaving two
-- different quotations both stamped v1 (the exact ambiguity 0012 was
-- written to end), or approve a budget with unpriced lines.
--
-- Now: pricing -> approved requires every line of the revision priced
-- (checked here, where it can't be forgotten — the row lock the UPDATE
-- already holds serializes this against concurrent line writes, which
-- take FOR SHARE on this row per section 1); approved -> pricing must
-- look exactly like reopen_budget() (version +1, approval fields
-- cleared); anything else is refused.

create or replace function budgets_guard()
returns trigger
language plpgsql
as $$
begin
  -- The revision a budget prices is fixed for life.
  if (new.selection_id, new.unit_id) is distinct from (old.selection_id, old.unit_id) then
    raise exception 'A budget cannot be moved to a different revision';
  end if;

  -- A version, once printed on a document, refers to one set of figures
  -- forever.
  if new.version < old.version then
    raise exception 'A budget version cannot go backwards (% to %)', old.version, new.version;
  end if;

  if new.status = old.status then
    return new;
  end if;

  if old.status = 'pricing' and new.status = 'approved' then
    -- Every line of the revision must be priced. An untouched line has no
    -- budget row at all, so "no unpriced rows" alone is not enough — the
    -- row COUNT must match the revision's line count too.
    if (select count(*) from budget_lines where budget_id = new.id)
       <> (select count(*) from selection_lines where selection_id = new.selection_id) then
      raise exception 'Every line needs a price before this budget can be approved';
    end if;
    if exists (select 1 from budget_lines where budget_id = new.id and unit_cost is null) then
      raise exception 'Every line needs a cost before this budget can be approved';
    end if;
    if not exists (select 1 from budget_lines where budget_id = new.id) then
      raise exception 'There is nothing to approve — this budget has no lines';
    end if;
    return new;
  end if;

  if old.status = 'approved' and new.status = 'pricing' then
    -- Only the reopen_budget() shape: the version increments and the
    -- approval fields clear, atomically. Anything else is a raw update
    -- pretending to be a re-open.
    if new.version <> old.version + 1
       or new.approved_by is not null
       or new.approved_at is not null then
      raise exception 'Re-open a budget with reopen_budget(), not a direct update';
    end if;
    return new;
  end if;

  raise exception 'Invalid budget status change: % -> %', old.status, new.status;
end $$;

-- ---------------------------------------------------------------------
-- 3. line_key is immutable
-- ---------------------------------------------------------------------
-- line_key is the only identifier that survives a revision; every
-- downstream tool keys on it. Until now nothing but convention stopped an
-- UPDATE from rewriting it — which would silently detach the line from
-- its pricing history and make carry-forward treat it as new.

create or replace function selection_lines_lock_key()
returns trigger
language plpgsql
as $$
begin
  if new.line_key is distinct from old.line_key then
    raise exception 'line_key is permanent — it is what links this line to its pricing across revisions';
  end if;
  return new;
end $$;

drop trigger if exists selection_lines_lock_key on selection_lines;
create trigger selection_lines_lock_key
  before update on selection_lines
  for each row execute function selection_lines_lock_key();

-- ---------------------------------------------------------------------
-- 4. Names the app treats as identifiers are unique
-- ---------------------------------------------------------------------
-- The client quote's reference is QT/<unit name>/R<n>-V<v>. Two units
-- with the same name in one project would produce two different
-- quotations carrying the identical reference — the exact ambiguity the
-- version column exists to prevent. Same rule for plots.

create unique index if not exists plots_project_name_key on plots (project_id, name);
create unique index if not exists units_project_name_key on units (project_id, name);

-- ---------------------------------------------------------------------
-- 5. A grant must name a real tool
-- ---------------------------------------------------------------------
-- user_apps.app was free text; a typo'd slug ('/budget', 'budgets')
-- inserted cleanly and granted nothing, silently. This list is every
-- grantable tool in lib/tools.ts — WHEN A NEW TOOL SHIPS, ITS MIGRATION
-- MUST EXTEND THIS CHECK (drop + re-add with the new slug; step recorded
-- in CLAUDE.md's "Adding a new tool" checklist). /settings is absent on
-- purpose: it is admin-only and not grantable.

alter table user_apps drop constraint if exists user_apps_app_known;
alter table user_apps add constraint user_apps_app_known check (app in (
  '/selections', '/budgets', '/masters', '/marathon',
  '/indents', '/purchase-orders', '/inventory', '/bills',
  '/directory', '/training'
));

-- ---------------------------------------------------------------------
-- 6. Request resolution is internally consistent
-- ---------------------------------------------------------------------
-- A request could be 'merged' with nothing to merge into, or resolved
-- with no record of when. Downstream reporting (and the Masters screen)
-- assumes these never happen; now they can't.

alter table item_requests drop constraint if exists item_requests_resolved_iff_not_pending;
alter table item_requests add constraint item_requests_resolved_iff_not_pending
  check ((status = 'pending') = (resolved_at is null));

alter table item_requests drop constraint if exists item_requests_merged_has_target;
alter table item_requests add constraint item_requests_merged_has_target
  check (status <> 'merged' or merged_into_item_id is not null);

-- ---------------------------------------------------------------------
-- 7. A priced line always has a margin
-- ---------------------------------------------------------------------
-- client_rate is generated from unit_cost and margin_pct, so a priced
-- line with a NULL margin has a NULL client rate — it printed an empty
-- Rate on the client quote while its at-cost value still sat inside the
-- total, making the column not add up to its own sum. Backfill first
-- (idempotent), then default new lines to 0, then forbid the state.
-- "No margin" now always means 0% — charged exactly cost, and visible.

update budget_lines set margin_pct = 0
where unit_cost is not null and margin_pct is null;

alter table budget_lines alter column margin_pct set default 0;

alter table budget_lines drop constraint if exists budget_lines_priced_has_margin;
alter table budget_lines add constraint budget_lines_priced_has_margin
  check (unit_cost is null or margin_pct is not null);

-- ---------------------------------------------------------------------
-- 8. Deleting a draft is atomic
-- ---------------------------------------------------------------------
-- The app deleted a draft's lines, then the draft — two requests, so a
-- failure between them (e.g. someone issuing the draft concurrently)
-- stranded a draft with every line gone and no way to recover them. One
-- function, one transaction. security invoker: RLS still applies, this
-- is not a way around the /selections grant.

create or replace function delete_draft_selection(p_selection_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  -- Lock the row so a concurrent issue and this delete serialize.
  perform 1 from selections
  where id = p_selection_id and status = 'draft'
  for update;

  if not found then
    raise exception 'Only a draft revision can be deleted';
  end if;

  delete from selection_lines where selection_id = p_selection_id;
  delete from selections where id = p_selection_id;
end $$;

revoke execute on function delete_draft_selection(uuid) from public;
grant execute on function delete_draft_selection(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 9. Requesting an item is atomic
-- ---------------------------------------------------------------------
-- The app inserted the provisional item, then the request. When the
-- second insert failed, the item survived alone: pickable in the
-- catalogue, invisible to Masters' queue — and a retry created another.
-- The designer has no DELETE right on items (correctly), so the app
-- cannot clean up after itself; only a transaction can. security invoker:
-- both inserts still pass through the same RLS policies as before.

create or replace function create_item_request(
  p_name text,
  p_category_id uuid,
  p_brand_id uuid,
  p_spec_note text,
  p_uom text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_item_id uuid;
begin
  insert into items (name, kind, category_id, brand_id, default_uom, description, is_provisional)
  values (p_name, 'catalogue', p_category_id, p_brand_id, p_uom, p_spec_note, true)
  returning id into v_item_id;

  insert into item_requests (
    provisional_item_id, requested_name, category_id, brand_id, spec_note, requested_by
  )
  values (v_item_id, p_name, p_category_id, p_brand_id, p_spec_note, auth.uid());

  return v_item_id;
end $$;

revoke execute on function create_item_request(text, uuid, uuid, text, text) from public;
grant execute on function create_item_request(text, uuid, uuid, text, text) to authenticated;
