-- Phase 4 — Budgets: what an issued selection revision actually costs, and
-- what the client is charged for it.
--
-- Two rules shape everything below.
--
-- 1. PRICING IS KEYED ON line_key, NOT ON A SELECTION LINE'S ROW ID.
--    A line copied into R+1 by create_next_revision() is a NEW row with the
--    SAME line_key (see 0007). Keying on the row id would hand the budget
--    team all 200 lines again every time a designer changes one. line_key
--    is the only thing that survives a revision, so it is what a budget
--    line is anchored to. This cannot be retrofitted later.
--
-- 2. COST AND MARGIN ARE SECRET, AND RLS IS WHAT KEEPS THEM SECRET.
--    Every table so far is readable by any authenticated staff member.
--    These three are not: reads require the /budgets grant. The client
--    quote and the internal budget sheet are the same data filtered, so a
--    careless join from a future Purchase Orders or Indents screen must
--    return zero rows rather than leak the markup. A template mistake
--    cannot show a number the query was never allowed to fetch.

-- Nothing needs adding to the existing tables: selection_lines already
-- carries unique (selection_id, line_key) from 0006, which is precisely
-- the composite key budget_lines points at below.

-- ---------------------------------------------------------------------
-- Per-product margin
-- ---------------------------------------------------------------------
-- The default markup for a product, set once and reused on every budget.
-- A budget line copies it at pricing time and may then be overridden there
-- without rewriting this default — so changing a product's margin never
-- silently re-prices an approved budget.
create table item_margins (
  -- A surrogate key rather than item_id as the primary key, because
  -- audit_row() from 0006 records new.id — a table without an `id` column
  -- raises at runtime the first time anyone saves. The uniqueness that
  -- matters is on item_id, below.
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null unique references items (id) on delete cascade,
  margin_pct numeric not null check (margin_pct >= 0),
  updated_by uuid references profiles (id),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Budgets
-- ---------------------------------------------------------------------
-- One per issued revision. Budgets creates its own row when the team
-- presses "Start pricing" — Selections does not know Budgets exists, so
-- the coupling stays one-way and Selections never needs touching when a
-- later tool consumes it.
create table budgets (
  id uuid primary key default gen_random_uuid(),
  selection_id uuid not null unique references selections (id),
  -- Denormalised for the same reason selection_lines carries it: reports
  -- and screens filter by unit constantly and should not need a join.
  unit_id uuid not null references units (id),
  status text not null default 'pricing' check (status in ('pricing', 'approved')),
  notes text,
  approved_by uuid references profiles (id),
  approved_at timestamptz,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Target of budget_lines' composite FK.
  unique (id, selection_id)
);
create index on budgets (unit_id);
create index on budgets (status);

create table budget_lines (
  id uuid primary key default gen_random_uuid(),
  budget_id uuid not null,
  -- Denormalised so the two composite foreign keys at the bottom can force
  -- the priced line and the budget to belong to the SAME revision.
  selection_id uuid not null,
  -- The anchor. Deliberately NOT a selection_lines row id: see rule 1
  -- above. The row it refers to is reachable through the composite FK on
  -- (selection_id, line_key), so there is no second pointer that could
  -- disagree with this one.
  line_key uuid not null,

  -- The budget team's own quantity. Starts from the designer's, and a
  -- profile specified as "some running feet" gets its measured length
  -- here. The designer's figure stays on selection_lines, so the screen
  -- and any variance report can show both.
  quantity numeric not null check (quantity > 0),

  expected_vendor_id uuid references vendors (id),
  unit_cost numeric check (unit_cost >= 0),
  margin_pct numeric check (margin_pct >= 0),

  -- Computed by the database, never by the app, so the internal sheet and
  -- the client quote cannot drift apart. Full precision — rounding here
  -- would bake presentation into the data, and rounding each line before
  -- summing makes a 200-line quote disagree with its own total.
  client_rate numeric generated always as (unit_cost * (1 + margin_pct / 100)) stored,

  -- Derived rather than stored-and-maintained: "priced" means exactly
  -- "has a cost", and a generated column cannot drift out of step with
  -- the thing it describes. A genuinely free line is unit_cost = 0, which
  -- is not null, and so counts as priced.
  budget_status text generated always as (
    case when unit_cost is null then 'pending' else 'priced' end
  ) stored,

  -- Set by carry-forward when the designer changed a quantity on the new
  -- revision: the old measurement is stale, but the line is not blocking.
  needs_review boolean not null default false,

  notes text,
  priced_by uuid references profiles (id),
  priced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- One price per line per budget.
  unique (budget_id, line_key),
  foreign key (budget_id, selection_id) references budgets (id, selection_id),
  -- Guarantees the line_key really exists in that revision.
  foreign key (selection_id, line_key) references selection_lines (selection_id, line_key)
);
create index on budget_lines (budget_id);
create index on budget_lines (line_key);
create index on budget_lines (expected_vendor_id);

-- Totals are never stored. Space, unit and project totals are queries over
-- these rows, so a total can never be stale with respect to its lines.

-- ---------------------------------------------------------------------
-- Immutability of an approved budget
-- ---------------------------------------------------------------------
-- Same principle as an issued selection revision, for the same reason: a
-- quote has gone to a client against these numbers. Unlike issuing,
-- approval IS reversible — an approved budget can be moved back to
-- 'pricing', which unlocks its lines again. That escape hatch is
-- deliberate (a genuine pricing error should be fixable) and every
-- re-opening lands in the audit log.
create function budget_lines_pricing_only()
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

  select status into parent_status from budgets where id = target_budget;

  if parent_status is distinct from 'pricing' then
    raise exception 'Budget % is % — re-open it before changing prices',
      target_budget, coalesce(parent_status, 'missing');
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end $$;

create trigger budget_lines_pricing_only
  before insert or update or delete on budget_lines
  for each row execute function budget_lines_pricing_only();

create function budgets_guard()
returns trigger
language plpgsql
as $$
begin
  -- The revision a budget prices is fixed for life.
  if (new.selection_id, new.unit_id) is distinct from (old.selection_id, old.unit_id) then
    raise exception 'A budget cannot be moved to a different revision';
  end if;
  return new;
end $$;

create trigger budgets_guard
  before update on budgets
  for each row execute function budgets_guard();

-- ---------------------------------------------------------------------
-- Audit
-- ---------------------------------------------------------------------
-- audit_row() from 0006. Money is exactly the kind of change that needs
-- "who set this, and to what, and when" answerable a year later.
create trigger audit_budgets
  after insert or update or delete on budgets
  for each row execute function audit_row();

create trigger audit_budget_lines
  after insert or update or delete on budget_lines
  for each row execute function audit_row();

create trigger audit_item_margins
  after insert or update or delete on item_margins
  for each row execute function audit_row();

-- ---------------------------------------------------------------------
-- RLS — the margin boundary
-- ---------------------------------------------------------------------
alter table item_margins enable row level security;
alter table budgets enable row level security;
alter table budget_lines enable row level security;

-- Note the difference from every other table in this schema: SELECT is
-- gated too, not just writes. This is rule 2 at the top of the file.
create policy "item_margins readable by budgets app"
  on item_margins for select to authenticated using (has_app('/budgets'));
create policy "item_margins writable by budgets app"
  on item_margins for insert to authenticated with check (has_app('/budgets'));
create policy "item_margins updatable by budgets app"
  on item_margins for update to authenticated
  using (has_app('/budgets')) with check (has_app('/budgets'));
create policy "item_margins deletable by budgets app"
  on item_margins for delete to authenticated using (has_app('/budgets'));

create policy "budgets readable by budgets app"
  on budgets for select to authenticated using (has_app('/budgets'));
create policy "budgets writable by budgets app"
  on budgets for insert to authenticated with check (has_app('/budgets'));
create policy "budgets updatable by budgets app"
  on budgets for update to authenticated
  using (has_app('/budgets')) with check (has_app('/budgets'));
-- A budget started against the wrong revision can be thrown away while it
-- is still being priced; an approved one never can.
create policy "pricing budgets deletable by budgets app"
  on budgets for delete to authenticated
  using (has_app('/budgets') and status = 'pricing');

create policy "budget_lines readable by budgets app"
  on budget_lines for select to authenticated using (has_app('/budgets'));
create policy "budget_lines writable by budgets app"
  on budget_lines for insert to authenticated with check (has_app('/budgets'));
create policy "budget_lines updatable by budgets app"
  on budget_lines for update to authenticated
  using (has_app('/budgets')) with check (has_app('/budgets'));
create policy "budget_lines deletable by budgets app"
  on budget_lines for delete to authenticated using (has_app('/budgets'));
