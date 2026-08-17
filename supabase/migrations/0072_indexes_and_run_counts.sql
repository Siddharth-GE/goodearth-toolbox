-- 0072 — the audit's two performance findings
--
-- Both preventative rather than urgent: at today's row counts Postgres
-- sequential-scans these tables regardless and nothing here is measurable
-- yet. That is exactly why it is worth doing now — an index added before
-- the data grows costs nothing, and one added after a screen has become
-- slow is a fire drill.
--
-- Additive and re-runnable throughout: `if not exists` on every index,
-- `create or replace` on the function. Ends asserting what it claimed.
--
-- Note on CREATE INDEX CONCURRENTLY: not used, and must not be. Every
-- migration here is applied inside a single transaction by
-- scripts/apply-migrations.ts, and CONCURRENTLY cannot run in one. These
-- tables are small enough that a brief lock is nothing.

-- ---------------------------------------------------------------------
-- 1. The foreign keys that are actually filtered or joined
-- ---------------------------------------------------------------------
-- 111 single-column foreign keys in this schema have no index. 95 of them
-- are `created_by` / `updated_by`, and those are LEFT ALONE ON PURPOSE:
-- nothing ever filters by them. They are resolved in bulk against
-- `profiles`' primary key when a screen needs to print a name, which uses
-- the index on the OTHER side. An index on each would cost a write on
-- every insert and update in the toolbox and be read by nothing.
--
-- The fourteen below are the ones a query really does filter or join on —
-- "show me this plot's indents", "this store's stock adjustments", the
-- Relay trail-set join. Each is the leading column of the foreign key, so
-- it also spares Postgres a sequential scan of the child table when a
-- parent row is deleted and a RESTRICT constraint has to be checked.
--
-- Two are deliberately absent: `app_errors.actor` and
-- `item_requests.merged_into_item_id`. Both exist to be read off a row you
-- already have, never to filter by.

create index if not exists indents_plot_id_idx on indents (plot_id);
create index if not exists indents_stage_idx on indents (stage);
create index if not exists goods_receipts_plot_id_idx on goods_receipts (plot_id);
create index if not exists goods_receipts_unit_id_idx on goods_receipts (unit_id);
create index if not exists stock_issues_plot_id_idx on stock_issues (plot_id);
create index if not exists stock_adjustments_item_id_idx on stock_adjustments (item_id);
create index if not exists labour_contracts_plot_id_idx on labour_contracts (plot_id);
create index if not exists labour_contracts_unit_id_idx on labour_contracts (unit_id);
create index if not exists business_plans_project_id_idx on business_plans (project_id);
create index if not exists purchase_orders_deliver_store_id_idx on purchase_orders (deliver_store_id);
create index if not exists item_requests_category_id_idx on item_requests (category_id);
create index if not exists item_requests_brand_id_idx on item_requests (brand_id);
create index if not exists construction_budget_lines_stage_idx on construction_budget_lines (stage);
create index if not exists pusher_trail_set_items_activity_id_idx on pusher_trail_set_items (activity_id);

-- ---------------------------------------------------------------------
-- 2. Marathon's per-run entry counts, in one query instead of N
-- ---------------------------------------------------------------------
-- getMarathonHome issued one exact count per run inside a .map. That was
-- already the careful version — the one before it fetched every entry row
-- and called .length, which on race day would have frozen the per-run
-- breakdown at PostgREST's 1,000-row ceiling while the total beside it
-- kept climbing, so two numbers on the same screen would have
-- contradicted each other.
--
-- What it could not be in PostgREST is a GROUP BY, so it needed a
-- function. This is that function: one round trip, every run, counted by
-- Postgres. A run with no entries still appears, at zero, because the
-- kiosk lists the runs and a missing row would read as a missing run.
--
-- NOT `security definer`, deliberately. Marathon is the one tool with no
-- Supabase Auth session at all — it has its own PIN kiosk — so it reads
-- with the service-role key, which bypasses row-level security already.
-- Definer rights would add nothing and would create a boundary needing a
-- guard that `has_app()` could not express here, because there is no
-- signed-in person to ask about. Execute is revoked from the two client
-- roles instead, which is the whole boundary and is enough.

create or replace function marathon_run_counts()
returns table (run_id uuid, run_name text, entry_count bigint)
language sql
stable
set search_path = public
as $$
  select r.id, r.name, count(e.id)
  from marathon_runs r
  left join marathon_entries e on e.run_id = r.id
  group by r.id, r.name, r.sort_order
  order by r.sort_order
$$;

revoke all on function marathon_run_counts() from public, anon, authenticated;
grant execute on function marathon_run_counts() to service_role;

-- ---------------------------------------------------------------------
-- 3. Assert it took
-- ---------------------------------------------------------------------
do $assert$
declare
  v_expected text[] := array[
    'indents_plot_id_idx',
    'indents_stage_idx',
    'goods_receipts_plot_id_idx',
    'goods_receipts_unit_id_idx',
    'stock_issues_plot_id_idx',
    'stock_adjustments_item_id_idx',
    'labour_contracts_plot_id_idx',
    'labour_contracts_unit_id_idx',
    'business_plans_project_id_idx',
    'purchase_orders_deliver_store_id_idx',
    'item_requests_category_id_idx',
    'item_requests_brand_id_idx',
    'construction_budget_lines_stage_idx',
    'pusher_trail_set_items_activity_id_idx'
  ];
  v_name text;
  v_oid oid;
begin
  foreach v_name in array v_expected
  loop
    if to_regclass('public.' || v_name) is null then
      raise exception '0072: index % was not created', v_name;
    end if;
  end loop;

  select oid into v_oid from pg_proc
  where proname = 'marathon_run_counts' and pronamespace = 'public'::regnamespace;
  if v_oid is null then
    raise exception '0072: marathon_run_counts() does not exist';
  end if;

  -- The kiosk reads with the service-role key; no client role may call it.
  if has_function_privilege('anon', v_oid, 'EXECUTE') then
    raise exception '0072: anon can execute marathon_run_counts()';
  end if;
  if has_function_privilege('authenticated', v_oid, 'EXECUTE') then
    raise exception '0072: authenticated can execute marathon_run_counts()';
  end if;
  if not has_function_privilege('service_role', v_oid, 'EXECUTE') then
    raise exception '0072: service_role cannot execute marathon_run_counts() — the kiosk needs it';
  end if;
end $assert$;
