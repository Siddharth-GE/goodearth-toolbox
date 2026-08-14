-- 0059 — the fact views become read-only
--
-- WRITTEN BY THE 2026-08-13 AUDIT (SEC-01). NOT YET APPLIED — applying it
-- is a production privilege change and needs the founder's go-ahead.
--
-- The hole
-- --------
-- Three of the fourteen views are simple enough that Postgres treats them
-- as auto-updatable, so a write to the view is a write to the table
-- underneath:
--
--     po_facts          -> purchase_orders
--     bill_facts        -> bills
--     approved_budgets  -> budgets
--
-- Every one of these views is owned by `postgres`, which also owns the
-- base tables, and none of those tables is FORCE ROW LEVEL SECURITY. That
-- is deliberate and load-bearing for READS — it is how /indents sees
-- budget quantities without seeing budget costs. It applies to writes just
-- the same, and nobody meant that.
--
-- Meanwhile Supabase's default privileges grant INSERT, UPDATE, DELETE and
-- TRUNCATE on every new relation in `public` to `authenticated`. The
-- earlier migrations say `grant select on po_facts to authenticated`, but
-- a grant ADDS; it does not replace. 0022:42 revokes from `public` and
-- `anon` and never from `authenticated`, so the write privileges the
-- platform handed out are still sitting there.
--
-- Net effect before this migration: any signed-in person, including one
-- with zero app grants, could update or delete production purchase orders,
-- bills and budgets over the REST API, bypassing RLS entirely. The guard
-- triggers do not help — they are all BEFORE UPDATE, and there is no
-- DELETE guard anywhere.
--
-- Why this is safe to apply
-- ------------------------
-- Nothing in the app has ever written through a view. Every write goes to
-- a table or an RPC. Revoking the write privileges changes no behaviour;
-- it removes a capability nobody uses.
--
-- The rule this establishes
-- -------------------------
-- A view is a READ surface. Every new view gets this revoke in the same
-- migration that creates it, and `revoke ... from public` is never enough
-- — Supabase grants `anon` and `authenticated` explicitly, so they must be
-- named. CLAUDE.md carries the rule.
--
-- Safe to run twice: revoking a privilege that isn't held is a no-op.

revoke insert, update, delete, truncate on
  approved_budget_lines,
  approved_budgets,
  bill_facts,
  bill_money_facts,
  budget_report_lines,
  business_plan_target_facts,
  crm_milestone_facts,
  crm_receipt_facts,
  po_billing_totals,
  po_facts,
  po_line_facts,
  pusher_chain_state,
  stock_by_location,
  stock_on_hand
from anon, authenticated;

-- The reads each view exists for, restated so this file is the whole
-- picture rather than half of it. Granting a privilege already held is a
-- no-op, so this is safe on a re-run too.
grant select on
  approved_budget_lines,
  approved_budgets,
  bill_facts,
  bill_money_facts,
  budget_report_lines,
  business_plan_target_facts,
  crm_milestone_facts,
  crm_receipt_facts,
  po_billing_totals,
  po_facts,
  po_line_facts,
  pusher_chain_state,
  stock_by_location,
  stock_on_hand
to authenticated;

-- Assert it took. Fails loudly rather than reporting success on a
-- half-applied change.
do $$
declare
  v_writable int;
begin
  select count(*) into v_writable
  from information_schema.role_table_grants
  where table_schema = 'public'
    and grantee in ('anon', 'authenticated')
    and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
    and table_name in (
      select table_name from information_schema.views where table_schema = 'public'
    );

  if v_writable <> 0 then
    raise exception '0059: % write privileges still held on public views', v_writable;
  end if;
end $$;
