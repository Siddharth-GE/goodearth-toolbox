-- Indexes, and an updated_at that can be trusted.
--
-- Found by auditing the schema against how the code actually queries it.
-- Nothing here changes behaviour; it changes how much work Postgres does
-- to produce the same answers, and makes one column honest.
--
-- Re-runnable: every statement uses `if not exists` / `if exists`.

-- ---------------------------------------------------------------------
-- 1. The catalogue search, which is the hottest query in the app
-- ---------------------------------------------------------------------
-- app/api/catalogue/route.ts runs on every keystroke of three different
-- screens. It filters is_active, sorts by (name, id), and matches
-- name/code with ILIKE '%…%'. Against 2,633 rows the existing indexes
-- (category_id, brand_id, kind) help with none of that, so every
-- keystroke was a sequential scan plus a full sort.

-- Covers the filter and the sort together, in the order the query asks
-- for them. Partial, because the query only ever wants active rows.
create index if not exists items_active_name_idx
  on items (name, id) where is_active;

-- ILIKE '%…%' cannot use a btree index — the leading wildcard defeats it.
-- pg_trgm indexes trigrams instead, which is exactly the shape of a
-- "contains" search, and turns the scan into an index lookup.
create extension if not exists pg_trgm;
create index if not exists items_name_trgm_idx on items using gin (name gin_trgm_ops);
create index if not exists items_code_trgm_idx on items using gin (code gin_trgm_ops);
-- Searching "Jaquar" resolves matching brands first, also with ILIKE.
create index if not exists brands_name_trgm_idx on brands using gin (name gin_trgm_ops);

-- ---------------------------------------------------------------------
-- 2. Foreign keys nothing indexed
-- ---------------------------------------------------------------------
-- Postgres does NOT index a foreign key automatically. Every one of these
-- is either joined or filtered on by real code, and each is also what
-- makes a delete of the parent row check its children efficiently.

-- The largest transactional table, filtered by item when Masters resolves
-- an item request.
create index if not exists selection_lines_item_id_idx on selection_lines (item_id);
create index if not exists selection_lines_unit_id_idx on selection_lines (unit_id);

create index if not exists selections_superseded_by_idx on selections (superseded_by);
create index if not exists items_merged_into_idx on items (merged_into_item_id)
  where merged_into_item_id is not null;

create index if not exists budget_lines_selection_id_idx on budget_lines (selection_id);
create index if not exists budget_lines_vendor_idx on budget_lines (expected_vendor_id)
  where expected_vendor_id is not null;

create index if not exists item_requests_provisional_idx on item_requests (provisional_item_id);
create index if not exists space_views_uploaded_by_idx on space_views (uploaded_by);

-- ---------------------------------------------------------------------
-- 3. Composite indexes matching the actual filter-and-sort pairs
-- ---------------------------------------------------------------------
-- The budgets inbox: issued revisions, newest first.
create index if not exists selections_status_issued_idx
  on selections (status, issued_at desc);

-- Marathon's agent entry list, and the per-run counts on the home screen.
create index if not exists marathon_entries_agent_created_idx
  on marathon_entries (agent_id, created_at desc);
create index if not exists marathon_entries_run_idx on marathon_entries (run_id);

-- ---------------------------------------------------------------------
-- 4. Drop four indexes that were never doing anything
-- ---------------------------------------------------------------------
-- Each is a prefix of a unique constraint that already indexes the same
-- leading column, so it could never be chosen — it only cost write time
-- and disk. Dropping an index is instant and reversible.
drop index if exists spaces_unit_id_idx;
drop index if exists selections_unit_id_idx;
drop index if exists selection_lines_selection_id_idx;
drop index if exists budget_lines_budget_id_idx;

-- ---------------------------------------------------------------------
-- 5. updated_at, maintained by the database
-- ---------------------------------------------------------------------
-- Five tables carry updated_at; three of them were kept current by hand,
-- in some code paths and not others. marathon_config.updated_at had never
-- been written by anything. selections.updated_at wasn't touched when a
-- note was saved. Carried-forward budget lines were inserted without one.
--
-- A column that is right most of the time is worse than no column: the
-- first person to trust it is the one who gets hurt. Now it's the
-- database's job, so it cannot be forgotten.
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end $$;

do $$
declare
  t text;
begin
  for t in select unnest(array[
    'selections', 'budgets', 'budget_lines', 'item_margins', 'marathon_config'
  ])
  loop
    execute format('drop trigger if exists set_updated_at on %I', t);
    execute format(
      'create trigger set_updated_at before update on %I for each row execute function set_updated_at()', t
    );
  end loop;
end $$;
