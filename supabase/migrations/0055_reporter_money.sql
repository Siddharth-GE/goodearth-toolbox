-- 0055 — Reporter sees the money. THIS MIGRATION SHIPS ALONE.
--
-- Stage 6 of app/(dashboard)/reporter/PLAN.md, and the widest permission
-- change this app has made. After it, **granting `/reporter` grants
-- sight of every vendor rate, every bill amount, and the margin on every
-- quoted line in the company.** One grant, to anyone Settings can tick.
--
-- That is the founder's decision, taken at planning on 2026-08-11
-- (decisions 3 and 4 in the plan: "full line-level money, including
-- client rates and margin %", and "/reporter is grantable to anyone"),
-- and re-affirmed on 2026-08-12 before this file was written. It is
-- recorded here in those words so that nobody reading this later
-- mistakes it for drift.
--
-- IN PARTICULAR this **deliberately reverses 0011's "margin boundary"**.
-- 0011:203 gated item_margins and budget money behind /budgets on the
-- reasoning that markup is not for general circulation. The founder has
-- since decided that a leadership report showing margin is worth more
-- than that boundary. Do not "fix" this back.
--
-- HOW, and why not the other way:
--
--   * Every change below WIDENS AN EXISTING QUAL. It never adds a second
--     policy. Permissive policies OR together, so a second policy has
--     the same effect while being invisible to anyone reading
--     pg_policies for "who can see rates" — 0025:470 already names
--     widening as the sanctioned move for a third consumer.
--   * Each policy is RENAMED to say both consumers. A surface half
--     labelled with only its original consumer is one nobody trusts at
--     a glance (0047's reasoning).
--   * `po_billing_totals` is NOT touched. With purchase_order_lines
--     readable, ordered totals derive in lib/reporter/derive.ts and
--     billed totals come from the bills dataset. One fewer surface.
--
-- WHAT THIS COSTS, stated plainly: widening a TABLE policy is wider than
-- a view. A /reporter holder can now read EVERY column of these tables —
-- `terms`, `note`, `deletion_note`, `payment_ref`, `rejection_note`.
-- Acceptable given what has just been made visible on purpose, but it
-- means: **the dataset registry is a display decision, not a boundary.
-- The grant is the boundary.**
--
-- Re-runnable throughout: every policy is dropped by its old AND its new
-- name before being created.

-- ---------------------------------------------------------------------
-- 1. Purchase orders — rates
-- ---------------------------------------------------------------------

drop policy if exists "purchase_orders readable by purchase orders app" on purchase_orders;
drop policy if exists "purchase_orders readable by purchase orders or reporter" on purchase_orders;
create policy "purchase_orders readable by purchase orders or reporter"
  on purchase_orders for select to authenticated
  using (has_app('/purchase-orders') or has_app('/reporter'));

drop policy if exists "purchase_order_lines readable by purchase orders app" on purchase_order_lines;
drop policy if exists "purchase_order_lines readable by purchase orders or reporter" on purchase_order_lines;
create policy "purchase_order_lines readable by purchase orders or reporter"
  on purchase_order_lines for select to authenticated
  using (has_app('/purchase-orders') or has_app('/reporter'));

-- ---------------------------------------------------------------------
-- 2. Bills — invoiced and paid amounts
-- ---------------------------------------------------------------------

drop policy if exists "bills readable by bills app" on bills;
drop policy if exists "bills readable by bills or reporter" on bills;
create policy "bills readable by bills or reporter"
  on bills for select to authenticated
  using (has_app('/bills') or has_app('/reporter'));

drop policy if exists "labour_contracts readable by bills app" on labour_contracts;
drop policy if exists "labour_contracts readable by bills or reporter" on labour_contracts;
create policy "labour_contracts readable by bills or reporter"
  on labour_contracts for select to authenticated
  using (has_app('/bills') or has_app('/reporter'));

-- ---------------------------------------------------------------------
-- 3. Budgets — cost, client rate, and the margin between them
-- ---------------------------------------------------------------------
-- The reversal of 0011:203. See the header.

drop policy if exists "budgets readable by budgets app" on budgets;
drop policy if exists "budgets readable by budgets or reporter" on budgets;
create policy "budgets readable by budgets or reporter"
  on budgets for select to authenticated
  using (has_app('/budgets') or has_app('/reporter'));

drop policy if exists "budget_lines readable by budgets app" on budget_lines;
drop policy if exists "budget_lines readable by budgets or reporter" on budget_lines;
create policy "budget_lines readable by budgets or reporter"
  on budget_lines for select to authenticated
  using (has_app('/budgets') or has_app('/reporter'));

drop policy if exists "item_margins readable by budgets app" on item_margins;
drop policy if exists "item_margins readable by budgets or reporter" on item_margins;
create policy "item_margins readable by budgets or reporter"
  on item_margins for select to authenticated
  using (has_app('/budgets') or has_app('/reporter'));

-- ---------------------------------------------------------------------
-- 4. budget_report_lines — a flat reporting shape over the two tables
-- ---------------------------------------------------------------------
-- A budget line's project is four joins away (budget_lines → budgets →
-- units → projects) and its item name is reached through the composite
-- (selection_id, line_key) FK into selection_lines. Expressed as a
-- PostgREST embed chain that is four chances to hit the ambiguous-embed
-- trap, which no local gate catches. Expressed as a view it is columns.
--
-- **`security_invoker = true` — and that is a DELIBERATE DEPARTURE from
-- every other view in this schema.** po_facts, po_line_facts,
-- approved_budgets and the CRM fact views all run as their owner and so
-- bypass RLS on purpose: their whole job is showing money-free facts to
-- people who may NOT read the money tables, which is why CLAUDE.md says
-- their WHERE clause and column list ARE the boundary.
--
-- This view is the opposite case. It carries rupees and margin, and §3
-- above has just made those readable to exactly the right people. So it
-- must inherit that rule rather than route around it: with
-- security_invoker the view reads as the CALLER, every policy on
-- budget_lines, budgets, units, selection_lines and items still applies,
-- and this file adds NO new RLS-bypassing surface to police. Adding a
-- column here can therefore never widen access — unlike in a fact view,
-- where it silently could.
--
-- security_barrier as well, on the 0019 precedent: it stops the planner
-- pushing a caller's leaky function below the view's own conditions.

drop view if exists budget_report_lines;

create view budget_report_lines
with (security_barrier, security_invoker = true) as
select bl.id,
       bl.budget_id,
       bl.selection_id,
       bl.line_key,
       bl.quantity,
       bl.unit_cost,
       bl.margin_pct,
       bl.client_rate,
       -- Two different statuses, named apart on purpose: a line can be
       -- held while the budget it sits in is approved.
       bl.budget_status as line_status,
       bl.needs_review,
       bl.priced_at,
       bl.created_at,
       bl.expected_vendor_id,
       v.name  as vendor_name,
       b.status as budget_status,
       b.version,
       b.approved_at,
       b.unit_id,
       u.name  as unit_name,
       u.project_id,
       p.name  as project_name,
       sl.item_id,
       sl.uom,
       i.name  as item_name,
       i.code  as item_code
  from budget_lines bl
  join budgets b
    on b.id = bl.budget_id and b.selection_id = bl.selection_id
  left join units u    on u.id = b.unit_id
  left join projects p on p.id = u.project_id
  left join selection_lines sl
    on sl.selection_id = bl.selection_id and sl.line_key = bl.line_key
  left join items i    on i.id = sl.item_id
  left join vendors v  on v.id = bl.expected_vendor_id;

revoke all on budget_report_lines from public, anon;
grant select on budget_report_lines to authenticated;

-- ---------------------------------------------------------------------
-- 5. Proof, not trust
-- ---------------------------------------------------------------------
-- The 0047-style assertion: if any of the seven policies above did not
-- end up widened, fail loudly here rather than leave a half-moved
-- boundary that reads as done. Counted rather than eyeballed because a
-- typo in a table name above would otherwise pass silently.

do $$
declare
  widened int;
begin
  select count(*) into widened
    from pg_policies
   where cmd = 'SELECT'
     and tablename in ('purchase_orders','purchase_order_lines','bills',
                       'labour_contracts','budgets','budget_lines','item_margins')
     and qual like '%/reporter%';
  if widened <> 7 then
    raise exception 'expected 7 widened SELECT policies, found %', widened;
  end if;

  -- And no table gained a SECOND select policy on the way — the failure
  -- mode 0025:470 warns about, invisible to anyone reading a single row
  -- of pg_policies.
  if exists (
    select 1 from pg_policies
     where cmd = 'SELECT'
       and tablename in ('purchase_orders','purchase_order_lines','bills',
                         'labour_contracts','budgets','budget_lines','item_margins')
     group by tablename having count(*) > 1
  ) then
    raise exception 'a table above has more than one SELECT policy';
  end if;
end $$;
