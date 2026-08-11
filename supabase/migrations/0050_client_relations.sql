-- 0050 — Client Relations: the plot register stops being a spreadsheet.
--
-- Founder, 2026-08-11: "it's time to build the next app which is crm,
-- build a simple table like this which users with that app can edit, with
-- an addition collections and due tab as well ... it can be a list of
-- clients that can be clicked and you get additional details of design
-- status of their home site status etc (these things will need to come
-- from relay) then collections are entered ... a new client can be a
-- prospect or a client and once they are a client they can be added to
-- the master."
--
-- The sheet being replaced is "Area and BUA - Saarang, GoodEarth - Overall
-- Sheet / To do list": 43 rows, one per plot, carrying client name, CRM
-- owner, sale deed status, construction agreement status, bottleneck,
-- payment stage, invoice stage and two columns of prose. Its header row
-- is hand-typed arithmetic — "Sale Count: 38", "Sale deed: 29", "Const
-- Agmt: 23", "Plots for registration 5 9 27 30 33 36 37 38 40" — which is
-- the specific thing this migration exists to make computable.
--
-- FOUR FOUNDER DECISIONS, taken before any of this was written:
--
--   1. ONE LIST. A prospect and a client are the same record at different
--      stages, not two tables. "Added to the master" is the moment they
--      are given a plot. Hence §1: `clients` grows a lifecycle rather
--      than CRM growing a parallel `crm_prospects`.
--   2. A MILESTONE SCHEDULE, not a single agreement value — so a due date
--      exists and "overdue" is answerable. Hence §5.
--   3. FIXED VOCABULARIES for the sales and legal columns, so they can be
--      counted and filtered rather than read.
--   4. DESIGN AND SITE STATUS COME FROM RELAY ONLY, never typed here.
--      Hence: there is no design_stage column anywhere below, and there
--      must never be one. The two design-ish columns that DO survive
--      (`design_support`, and 'design' as a bottleneck value) are notes
--      about who is blocked, not a status of the design itself.
--
-- Decisions 3 and 4 overlapped on the sheet's "Design Verification"
-- column. 4 is the later and more specific instruction, so it won.
-- WHAT THAT COSTS, measured against production on the day this was
-- written: 4 of 43 villas have any Relay trail filed (6 trails total),
-- and 3 units have an issued selection. So the Design & site panel is
-- empty for 39 of 43 plots on day one. That is honest rather than
-- broken — the screen says so and links to Relay — but nobody should be
-- surprised by it, and the fix is filing trails in Relay, not adding a
-- column here.
--
-- Re-runnable throughout.

-- ---------------------------------------------------------------------
-- 1. `clients` grows a lifecycle
-- ---------------------------------------------------------------------
-- Additive columns on a SHARED master (CLAUDE.md: "Masters, `profiles`
-- and `items` are shared, not another tool's"), which is why this is an
-- alter rather than a new table.
--
-- `stage` defaults to 'client' because all 35 existing rows are real
-- clients on real plots — a default of 'prospect' would silently demote
-- every one of them.

alter table clients add column if not exists stage text not null default 'client';
alter table clients drop constraint if exists clients_stage_check;
alter table clients add constraint clients_stage_check
  check (stage in ('prospect', 'client', 'lost'));

alter table clients add column if not exists crm_owner_id uuid references profiles (id);
alter table clients add column if not exists source text;
alter table clients add column if not exists first_contact_on date;
alter table clients add column if not exists converted_on date;

-- A prospect marked lost must say why, the same way Bills makes a
-- rejection carry a note: a status nobody can explain is a status nobody
-- trusts six months later.
alter table clients add column if not exists lost_reason text;
alter table clients drop constraint if exists clients_lost_reason_check;
alter table clients add constraint clients_lost_reason_check
  check (stage <> 'lost' or length(trim(coalesce(lost_reason, ''))) > 0);

create index if not exists clients_stage_idx on clients (stage);
create index if not exists clients_crm_owner_idx on clients (crm_owner_id)
  where crm_owner_id is not null;

-- ---------------------------------------------------------------------
-- 2. Client Relations may write `clients`
-- ---------------------------------------------------------------------
-- Today `clients` is readable by every authenticated user and
-- insert/update `has_app('/masters')` — set that way by 0013, not by
-- 0004's original is_admin() policies. A /client-relations holder is
-- therefore refused by the database on every client write, which would
-- make the tool read-only for the three people who live in it.
--
-- These are ADDITIONAL policies, not replacements. Permissive policies
-- for the same command OR together, so Masters keeps exactly the access
-- it has.
--
-- WHY THIS IS NOT THE "never a second policy" MISTAKE: that rule
-- (CLAUDE.md, "Money stays confined") is about a second SELECT policy on
-- a money-GATED table, where the policy is the boundary and a second one
-- silently widens it. `clients` carries no money and its SELECT has been
-- open to all staff since 0004. These are INSERT and UPDATE. Nobody
-- should "fix" them.

drop policy if exists "clients insertable by client relations app" on clients;
create policy "clients insertable by client relations app"
  on clients for insert to authenticated
  with check (has_app('/client-relations'));

drop policy if exists "clients updatable by client relations app" on clients;
create policy "clients updatable by client relations app"
  on clients for update to authenticated
  using (has_app('/client-relations'))
  with check (has_app('/client-relations'));

-- ---------------------------------------------------------------------
-- 3. crm_assign_unit — the one cross-tool WRITE
-- ---------------------------------------------------------------------
-- Giving a prospect their plot writes `units.client_id`, and `units` is
-- Masters'. CLAUDE.md forbids a tool writing another tool's table, with
-- two documented exceptions; this is the third, and it takes the shape
-- 0045 established: a `security definer` function declared by the
-- CALLING tool's migration, so the coupling points the right way.
--
-- Why a function and not another policy, when §2 chose a policy: an
-- UPDATE policy on `units` cannot be narrowed to one column. It would
-- read "may edit any unit's project, type, code and status", which is far
-- more than assigning a buyer. The function can be narrowed, and is —
-- it touches client_id and status and nothing else.
--
-- SECURITY DEFINER BYPASSES RLS ENTIRELY. The has_app check in the body
-- is not a nicety; it IS the permission boundary. Remove it and any
-- signed-in user can reassign every villa in the company.

create or replace function crm_assign_unit(
  p_unit_id uuid,
  p_client_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not has_app('/client-relations') then
    raise exception 'You need the Client Relations app to assign a plot';
  end if;

  if p_status not in ('available', 'reserved', 'sold') then
    raise exception 'Unknown unit status: %', p_status;
  end if;

  -- p_client_id null un-assigns, which is how a cancelled booking is
  -- undone. The status still has to be stated, so nobody ends up with an
  -- unassigned plot still marked sold.
  if p_client_id is not null and not exists (
    select 1 from clients where id = p_client_id and is_active
  ) then
    raise exception 'That client no longer exists';
  end if;

  update units
     set client_id = p_client_id,
         status = p_status,
         updated_by = auth.uid()
   where id = p_unit_id;

  if not found then
    raise exception 'That plot no longer exists';
  end if;
end $$;

revoke all on function crm_assign_unit(uuid, uuid, text) from public, anon;
grant execute on function crm_assign_unit(uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 4. client_engagements — one row per unit, one row of the sheet
-- ---------------------------------------------------------------------
-- The grain is the UNIT, not the client, because every tracked column on
-- the sheet is a fact about one plot's sale. A client with two villas
-- (Saarang has one — "Satheesh and Aruna", plots 17 and 39) gets two
-- engagements. The list screen is still client-first; the row is not.
--
-- There is deliberately NO client_id column. The client is
-- units.client_id, and a second copy is a second thing to keep in step —
-- which, on the one table whose whole purpose is knowing who owns what,
-- is not a risk worth taking for one saved join.
--
-- `project_id` IS copied, because a unit never changes project and the
-- list filters on it on every load. That is the same trade Bills makes.
--
-- THE TWO-COLUMN SPLIT, worth explaining because the sheet does not make
-- it: "Signed, Bank Original" is two independent facts — whether it is
-- signed, and who is holding the original. As one enum, the founder's own
-- header count ("Sale deed: 29") is a three-way OR today and a four-way
-- OR the day a fourth custodian appears. Split, it is one equality.

create table if not exists client_engagements (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null unique references units (id),
  project_id uuid not null references projects (id),
  crm_owner_id uuid references profiles (id),

  -- Sale deed
  sale_deed_status text not null default 'not_signed'
    check (sale_deed_status in ('not_signed', 'signed')),
  sale_deed_original_with text
    check (sale_deed_original_with in ('chess_cafe', 'client', 'bank')),
  sale_deed_ack text
    check (sale_deed_ack in ('with_bank', 'received')),
  sale_deed_signed_on date,
  constraint client_engagements_deed_original_check
    check (sale_deed_original_with is null or sale_deed_status = 'signed'),

  -- Construction agreement, deliberately the same vocabulary so one
  -- lookup table in lib/client-relations/stages.ts serves both.
  ca_status text not null default 'not_signed'
    check (ca_status in ('not_signed', 'signed')),
  ca_original_with text
    check (ca_original_with in ('chess_cafe', 'client', 'bank')),
  ca_ack text
    check (ca_ack in ('with_bank', 'received')),
  ca_signed_on date,
  constraint client_engagements_ca_original_check
    check (ca_original_with is null or ca_status = 'signed'),

  -- Registration. The sheet aggregates this in its header ("Plots for
  -- registration 5 9 27 30 33 36 37 38 40"), so it is a ladder, not prose.
  registration_stage text not null default 'not_due'
    check (registration_stage in ('not_due', 'due', 'scheduled', 'registered')),
  registration_note text,
  registration_on date,

  -- Five fixed values, no attributes of their own, only ever read and
  -- written with the row — an array, not a child table. The containment
  -- check permits a NULL element on its own, hence the second constraint.
  bottlenecks text[] not null default '{}',
  constraint client_engagements_bottlenecks_known
    check (bottlenecks <@ array['design','client','payments','management','interiors']::text[]),
  constraint client_engagements_bottlenecks_not_null
    check (array_position(bottlenecks, null) is null),

  design_support text,
  details text,

  -- A date, not a boolean. Null is "not done"; a boolean beside a date is
  -- two columns that can disagree, and the badge reads fine off the date.
  check_in_on date,

  -- Headline values. The milestone schedule in §5 is where money is
  -- actually tracked; these two are what the plot was sold for.
  plot_value numeric check (plot_value >= 0),
  construction_value numeric check (construction_value >= 0),

  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists client_engagements_project_idx
  on client_engagements (project_id);
create index if not exists client_engagements_owner_idx
  on client_engagements (crm_owner_id) where crm_owner_id is not null;
create index if not exists client_engagements_registration_idx
  on client_engagements (registration_stage);
-- GIN so "every plot blocked on payments" is a server-side containment
-- filter rather than a fetch-everything-and-filter-in-Node.
create index if not exists client_engagements_bottleneck_idx
  on client_engagements using gin (bottlenecks);

-- ---------------------------------------------------------------------
-- 5. The payment schedule
-- ---------------------------------------------------------------------
-- Nine stages, seeded whole at engagement creation. Seeding is what makes
-- the milestone model SIMPLER than storing a dropdown, not more complex:
-- the Collections tab becomes a fixed nine-row grid you fill in — exactly
-- the shape of the sheet — with no "add a row" step anywhere.
--
-- And it makes the sheet's "Current Stage of Invoice Raising" DERIVED:
-- the last stage with invoiced_on set. A stored ladder position and the
-- rows behind it can drift apart; a derived one cannot.
--
-- The eight construction stages are the sheet's own vocabulary, in its
-- own order. 'plot' is first and is not one of them — it is the sheet's
-- separate "Due date for Plot amount to be received" column, which is a
-- payment milestone in everything but name.

create table if not exists client_payment_milestones (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references client_engagements (id) on delete cascade,
  stage text not null check (stage in (
    'plot', 'booking', 'foundation', 'ground_floor_slab', 'first_floor_slab',
    'internal_plastering', 'floor_laying', 'painting_polishing', 'completed')),
  sort_order int not null default 0,
  due_amount numeric check (due_amount >= 0),
  due_on date,
  invoice_no text,
  invoiced_on date,
  note text,
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (engagement_id, stage),
  -- The composite-FK anchor a receipt hangs off. See §6.
  unique (id, engagement_id),
  constraint client_payment_milestones_invoice_check
    check (invoice_no is null or invoiced_on is not null)
);

create index if not exists client_milestones_engagement_idx
  on client_payment_milestones (engagement_id, sort_order);
create index if not exists client_milestones_due_idx
  on client_payment_milestones (due_on) where due_on is not null;

-- ---------------------------------------------------------------------
-- 6. client_receipts — the first money coming IN, anywhere in this app
-- ---------------------------------------------------------------------
-- Everything monetary that existed before this file is payables: bills,
-- purchase orders, po_billing_totals. Nothing tracked a rupee arriving.
--
-- No approval workflow, deliberately. Bills has one because approving a
-- wrong bill pays money OUT. A receipt records money that has already
-- arrived; the founder asked for entry, not sign-off.
--
-- THE COMPOSITE FK is the line-chain idiom (CLAUDE.md: "Anchor on stable
-- ids or the composite FK — never a bare line_key"). Anchoring on
-- (milestone_id, engagement_id) rather than milestone_id alone makes it
-- impossible to allocate a receipt to a milestone on a different villa.
-- milestone_id stays nullable — MATCH SIMPLE skips the check when it is
-- null — because a payment often arrives before anyone has decided which
-- milestone it settles, and refusing to record it until then is how money
-- ends up back in a spreadsheet.

create table if not exists client_receipts (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references client_engagements (id),
  milestone_id uuid,
  amount numeric not null check (amount > 0),
  received_on date not null default current_date,
  mode text not null default 'bank'
    check (mode in ('bank', 'cheque', 'upi', 'cash', 'other')),
  reference text,
  note text,
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_receipts_milestone_fkey
    foreign key (milestone_id, engagement_id)
      references client_payment_milestones (id, engagement_id)
);

create index if not exists client_receipts_engagement_idx
  on client_receipts (engagement_id, received_on desc);
create index if not exists client_receipts_milestone_idx
  on client_receipts (milestone_id) where milestone_id is not null;

-- Note the asymmetry, which is on purpose. engagement -> milestones is
-- ON DELETE CASCADE: an untouched nine-row schedule is not a record of
-- anything. engagement <- receipts is RESTRICT (the default), so an
-- engagement that has taken money REFUSES to be deleted. That is
-- CLAUDE.md's "deletion is refused, not cascaded" applied where it
-- matters and relaxed where it does not.

-- ---------------------------------------------------------------------
-- 7. Creating an engagement, and the schedule that comes with it
-- ---------------------------------------------------------------------
-- SECURITY DEFINER because of who calls it. The trigger in §8 fires when
-- MASTERS creates a unit, and that person holds /masters, not
-- /client-relations — without definer rights they would create a villa
-- and silently get no CRM record. That is 0045's exact argument, and the
-- same invisible failure.
--
-- Guarded by `on conflict do nothing` on the unique unit_id rather than a
-- has_app check, because unlike crm_assign_unit this function creates
-- only CRM's own empty rows. It leaks nothing and changes nothing that
-- existed before it ran.

create or replace function create_client_engagement(
  p_unit_id uuid,
  p_owner_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_engagement_id uuid;
  v_project_id uuid;
begin
  select project_id into v_project_id from units where id = p_unit_id;
  if v_project_id is null then
    raise exception 'That plot no longer exists';
  end if;

  insert into client_engagements (unit_id, project_id, crm_owner_id, created_by, updated_by)
  values (p_unit_id, v_project_id, p_owner_id, auth.uid(), auth.uid())
  on conflict (unit_id) do nothing
  returning id into v_engagement_id;

  -- Already had one: hand back the existing id so the caller can carry on.
  if v_engagement_id is null then
    select id into v_engagement_id from client_engagements where unit_id = p_unit_id;
    return v_engagement_id;
  end if;

  insert into client_payment_milestones (engagement_id, stage, sort_order, created_by, updated_by)
  select v_engagement_id, s.stage, s.sort_order, auth.uid(), auth.uid()
  from (values
    ('plot',                10),
    ('booking',             20),
    ('foundation',          30),
    ('ground_floor_slab',   40),
    ('first_floor_slab',    50),
    ('internal_plastering', 60),
    ('floor_laying',        70),
    ('painting_polishing',  80),
    ('completed',           90)
  ) as s(stage, sort_order)
  on conflict (engagement_id, stage) do nothing;

  return v_engagement_id;
end $$;

revoke all on function create_client_engagement(uuid, uuid) from public, anon;
grant execute on function create_client_engagement(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 8. Every unit has an engagement, forever
-- ---------------------------------------------------------------------
-- A CROSS-TOOL TRIGGER, and the second one in this schema. CLAUDE.md:
-- "A cross-tool trigger not listed here is what nobody finds until it
-- misfires" — so it is declared here, in the migration of the tool being
-- written TO, and named in CLAUDE.md's exceptions paragraph.
--
-- The alternative was a left join from `units` on every read, with
-- filtering done in Node because PostgREST cannot filter an embedded
-- table without turning the join inner. This trigger buys server-side
-- filters and a real `count: "exact"` on the one list people live in.

create or replace function units_seed_engagement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform create_client_engagement(new.id, null);
  return new;
end $$;

drop trigger if exists units_seed_engagement on units;
create trigger units_seed_engagement
  after insert on units
  for each row execute function units_seed_engagement();

-- Backfill the 43 that already exist. Re-runnable: create_client_engagement
-- no-ops on a unit that already has one.
do $$
declare
  r record;
begin
  for r in select id from units order by id loop
    perform create_client_engagement(r.id, null);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 9. Audit, updated_at
-- ---------------------------------------------------------------------
-- All three tables carry `id`, so audit_row() applies cleanly.

do $$
declare
  t text;
begin
  for t in select unnest(array[
    'client_engagements', 'client_payment_milestones', 'client_receipts'
  ])
  loop
    execute format('drop trigger if exists audit_%1$s on %1$I', t);
    execute format(
      'create trigger audit_%1$s after insert or update or delete on %1$I '
      'for each row execute function audit_row()', t);
    execute format('drop trigger if exists set_updated_at on %1$I', t);
    execute format(
      'create trigger set_updated_at before update on %1$I '
      'for each row execute function set_updated_at()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 10. RLS — the whole tool is gated, SELECT included
-- ---------------------------------------------------------------------
-- 0048 is the precedent and it applies to all three tables, for two
-- reasons. The obvious one is money: milestones and receipts are nothing
-- but. The stronger one is `details` — the sheet's long free-text column,
-- which in practice holds notes about a particular family's bank, their
-- circumstances, and why they are stalling. Most tables here are readable
-- by any signed-in member of staff. These three are not, and the CRM
-- grant is the right boundary for them.
--
-- Gating SELECT also means there is NO fact view and no second SELECT
-- policy to get wrong: nothing outside Client Relations reads Client
-- Relations. If Overview or the future Dashboard ever wants a count, that
-- is a money-free view with a hand-written column list and a
-- security_barrier — never a rupee, never a second policy on these.

do $$
declare
  t text;
begin
  for t in select unnest(array[
    'client_engagements', 'client_payment_milestones', 'client_receipts'
  ])
  loop
    execute format('alter table %I enable row level security', t);

    execute format('drop policy if exists "%1$s readable by client relations app" on %1$I', t);
    execute format(
      'create policy "%1$s readable by client relations app" on %1$I '
      'for select to authenticated using (has_app(''/client-relations''))', t);

    execute format('drop policy if exists "%1$s insertable by client relations app" on %1$I', t);
    execute format(
      'create policy "%1$s insertable by client relations app" on %1$I '
      'for insert to authenticated with check (has_app(''/client-relations''))', t);

    execute format('drop policy if exists "%1$s updatable by client relations app" on %1$I', t);
    execute format(
      'create policy "%1$s updatable by client relations app" on %1$I '
      'for update to authenticated using (has_app(''/client-relations'')) '
      'with check (has_app(''/client-relations''))', t);
  end loop;
end $$;

-- Deletes, one table at a time because they differ.
--
-- Receipts and milestones: deletable within the grant. A mistyped receipt
-- has to be removable, and audit_row() keeps the before-image either way.
-- Engagements: NO delete policy. There is one per villa, the villa itself
-- cannot be deleted, and an engagement holding a payment history is the
-- last thing that should vanish because someone clicked wrong.

drop policy if exists "client_receipts deletable by client relations app" on client_receipts;
create policy "client_receipts deletable by client relations app"
  on client_receipts for delete to authenticated
  using (has_app('/client-relations'));

drop policy if exists "client_payment_milestones deletable by client relations app"
  on client_payment_milestones;
create policy "client_payment_milestones deletable by client relations app"
  on client_payment_milestones for delete to authenticated
  using (has_app('/client-relations'));

-- ---------------------------------------------------------------------
-- 11. No CHECK constraint change needed
-- ---------------------------------------------------------------------
-- '/client-relations' has been a known grant slug since 0030 and is in
-- both user_apps_app_known and role_apps_app_known as re-added by 0047
-- (lines 35 and 46). Settings could already grant this tool; it just had
-- nothing behind it. Noted so the next person does not go looking for the
-- CHECK that "must" be missing — the same note 0048 §3 leaves.
