-- Phase 2 — Selections: what the design team specifies for every space of
-- a unit. No pricing lives here (that's Budgets) beyond a read-only
-- snapshot of the item's indicative rate at pick time, so an issued
-- revision never silently re-prices when a master price changes later.
--
-- Revisions are the core idea: a revision is a draft until it is issued,
-- and an issued revision is IMMUTABLE. A change means R+1, copied forward,
-- with each line carrying the same stable `line_key` as the row it came
-- from. That key is what lets us diff R0 against R1 and cascade the
-- difference into Budgets/Indents/POs later. It cannot be retrofitted,
-- which is why it exists from day one even though nothing consumes it yet.

-- ---------------------------------------------------------------------
-- Access helper
-- ---------------------------------------------------------------------
-- Mirrors lib/auth/access.ts's hasApp(): admins have every app, everyone
-- else needs an explicit user_apps grant. Complements is_admin() from
-- 0004_masters.sql so policies below read as one line instead of a
-- repeated subquery.
create function has_app(slug text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select is_admin() or exists (
    select 1 from user_apps ua where ua.user_id = auth.uid() and ua.app = slug
  )
$$;

-- ---------------------------------------------------------------------
-- Extend what already exists (additive)
-- ---------------------------------------------------------------------

-- `spaces` was created empty by 0004_masters.sql and never used. It IS the
-- per-unit space instance the Selections spec calls `unit_spaces` — a unit
-- can hold three bedrooms, each its own row with its own label, all
-- reporting as the same space_type. Extended in place rather than
-- duplicated under a new name: a real rename would be a three-step dance
-- across two migrations (CLAUDE.md) for no functional gain on an empty
-- table.
alter table spaces add column description text;
alter table spaces add column created_at timestamptz not null default now();
-- Safe only because the table has zero rows.
alter table spaces alter column label set not null;
alter table spaces add constraint spaces_unit_label_key unique (unit_id, label);
-- Not redundant with the primary key: it's the target of the composite
-- foreign key on selection_lines that makes a cross-unit line impossible.
alter table spaces add constraint spaces_id_unit_key unique (id, unit_id);

-- Space types gain a short code and a lifecycle, so a designer can request
-- a new type at 8pm ('pending') and keep working; an admin approves or
-- merges it later.
alter table space_types add column code text;
alter table space_types add column status text not null default 'active'
  check (status in ('active', 'pending', 'retired'));
alter table space_types add column created_by uuid references profiles (id);
alter table space_types add column created_at timestamptz not null default now();

update space_types set code = case name
  when 'Living'         then 'LIV'
  when 'Dining'         then 'DIN'
  when 'Kitchen'        then 'KIT'
  when 'Master Bedroom' then 'MBR'
  when 'Bedroom'        then 'BED'
  when 'Bath'           then 'BTH'
  when 'Balcony'        then 'BAL'
  when 'Utility'        then 'UTL'
  when 'Foyer'          then 'FOY'
  when 'Study'          then 'STU'
  when 'Outdoor'        then 'OUT'
end
where code is null;

alter table space_types alter column code set not null;
alter table space_types add constraint space_types_code_key unique (code);

-- A designer can add an item the catalogue doesn't have without leaving
-- the editor. It lands in `items` immediately as provisional, so the
-- selection line has a real foreign key from the start — there is no
-- parallel "custom line" concept to reconcile later.
alter table items add column is_provisional boolean not null default false;
-- Set when a provisional item is approved as a duplicate of an existing
-- one. The provisional row is never deleted and never repointed, because
-- issued revisions referencing it are immutable — it survives as an alias
-- and reporting follows this pointer.
alter table items add column merged_into_item_id uuid references items (id);
create index on items (is_provisional) where is_provisional;

-- ---------------------------------------------------------------------
-- Selections
-- ---------------------------------------------------------------------
create table selections (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references units (id),
  revision_no int not null check (revision_no >= 0),
  status text not null default 'draft' check (status in ('draft', 'issued', 'superseded')),
  title text,
  notes text,
  issued_at timestamptz,
  issued_by uuid references profiles (id),
  superseded_by uuid references selections (id),
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (unit_id, revision_no),
  -- Target of selection_lines' composite FK, same purpose as on spaces.
  unique (id, unit_id)
);
create index on selections (unit_id);
create index on selections (status);

-- At most one editable revision per unit, enforced by the database rather
-- than by remembering to check in every code path.
create unique index selections_one_draft_per_unit
  on selections (unit_id) where status = 'draft';

create table selection_lines (
  id uuid primary key default gen_random_uuid(),
  selection_id uuid not null,
  -- Denormalised so the two composite foreign keys below can force the
  -- line's space and its revision to belong to the SAME unit. Without it
  -- that rule needs a trigger someone will eventually bypass.
  unit_id uuid not null,
  -- Stable across revisions: a line copied forward into R+1 keeps the key
  -- it had in R, a genuinely new line gets a fresh one. This is what makes
  -- "what changed between R0 and R1" answerable.
  line_key uuid not null default gen_random_uuid(),
  unit_space_id uuid not null,
  item_id uuid not null references items (id),
  quantity numeric not null check (quantity > 0),
  uom text not null check (
    uom in ('each', 'rft', 'sqft', 'lumpsum', 'bag', 'kg', 'litre', 'cft')
  ),
  -- Copied from items.indicative_price when the line is created. Read-only
  -- to designers and never shown on the client document; it exists so an
  -- issued revision keeps the figure it was specified against.
  indicative_rate_snapshot numeric,
  designer_note text,
  sort_order int not null default 0,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  unique (selection_id, line_key),
  foreign key (selection_id, unit_id) references selections (id, unit_id),
  foreign key (unit_space_id, unit_id) references spaces (id, unit_id)
);
create index on selection_lines (selection_id);
create index on selection_lines (unit_space_id);
create index on selection_lines (line_key);

create table item_requests (
  id uuid primary key default gen_random_uuid(),
  provisional_item_id uuid not null references items (id),
  requested_name text not null,
  category_id uuid references item_categories (id),
  brand_id uuid references brands (id),
  spec_note text,
  requested_by uuid references profiles (id),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'merged', 'rejected')),
  merged_into_item_id uuid references items (id),
  resolved_by uuid references profiles (id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index on item_requests (status);
create index on item_requests (provisional_item_id);

-- ---------------------------------------------------------------------
-- Immutability
-- ---------------------------------------------------------------------
-- Enforced in the database, not just the UI: the rule has to hold whatever
-- writes the row. This is one of the few places a trigger is the right
-- tool — it is a constraint, not business logic scattered across handlers.

create function selection_lines_draft_only()
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

  select status into parent_status from selections where id = target_selection;

  if parent_status is distinct from 'draft' then
    raise exception 'Selection % is % — issued revisions are immutable, create a new revision instead',
      target_selection, coalesce(parent_status, 'missing');
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end $$;

create trigger selection_lines_draft_only
  before insert or update or delete on selection_lines
  for each row execute function selection_lines_draft_only();

create function selections_guard()
returns trigger
language plpgsql
as $$
begin
  -- Once issued, only the status and the supersede pointer may move.
  if old.status <> 'draft' then
    if (new.unit_id, new.revision_no, new.title, new.notes)
       is distinct from (old.unit_id, old.revision_no, old.title, old.notes) then
      raise exception 'Selection % is % and cannot be edited', old.id, old.status;
    end if;
  end if;

  if new.status = old.status then
    return new;
  end if;
  if old.status = 'draft' and new.status = 'issued' then
    return new;
  end if;
  if old.status = 'issued' and new.status = 'superseded' then
    return new;
  end if;

  raise exception 'Invalid selection status change: % -> %', old.status, new.status;
end $$;

create trigger selections_guard
  before update on selections
  for each row execute function selections_guard();

-- ---------------------------------------------------------------------
-- Audit log (append-only)
-- ---------------------------------------------------------------------
create table audit_log (
  id bigint generated always as identity primary key,
  table_name text not null,
  row_id uuid not null,
  action text not null,
  actor uuid,
  old_data jsonb,
  new_data jsonb,
  at timestamptz not null default now()
);
create index on audit_log (table_name, row_id);
create index on audit_log (at desc);

create function audit_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid;
begin
  if tg_op = 'DELETE' then
    target := old.id;
  else
    target := new.id;
  end if;

  insert into audit_log (table_name, row_id, action, actor, old_data, new_data)
  values (
    tg_table_name,
    target,
    tg_op,
    auth.uid(),
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end $$;

create trigger audit_selections
  after insert or update or delete on selections
  for each row execute function audit_row();

create trigger audit_selection_lines
  after insert or update or delete on selection_lines
  for each row execute function audit_row();

create trigger audit_spaces
  after insert or update or delete on spaces
  for each row execute function audit_row();

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
-- Reads stay open to any authenticated staff member: Budgets and every
-- later tool reads design data under its OWN grant, exactly as they read
-- masters. Writes require the /selections grant.
alter table selections enable row level security;
alter table selection_lines enable row level security;
alter table item_requests enable row level security;
alter table audit_log enable row level security;

create policy "selections readable by authenticated users"
  on selections for select to authenticated using (true);
create policy "selections writable by selections app"
  on selections for insert to authenticated with check (has_app('/selections'));
create policy "selections updatable by selections app"
  on selections for update to authenticated
  using (has_app('/selections')) with check (has_app('/selections'));
-- A draft created by mistake can be thrown away; an issued revision never
-- can. The app deletes that draft's lines first, so the immutability
-- trigger above still sees a 'draft' parent and allows it.
create policy "draft selections deletable by selections app"
  on selections for delete to authenticated
  using (has_app('/selections') and status = 'draft');

create policy "selection_lines readable by authenticated users"
  on selection_lines for select to authenticated using (true);
create policy "selection_lines writable by selections app"
  on selection_lines for insert to authenticated with check (has_app('/selections'));
create policy "selection_lines updatable by selections app"
  on selection_lines for update to authenticated
  using (has_app('/selections')) with check (has_app('/selections'));
-- Lines in a DRAFT are genuinely deleted — nothing downstream can
-- reference them yet, and the trigger above already blocks deletes once a
-- revision is issued. The audit log keeps the history either way.
create policy "selection_lines deletable by selections app"
  on selection_lines for delete to authenticated using (has_app('/selections'));

create policy "item_requests readable by authenticated users"
  on item_requests for select to authenticated using (true);
create policy "item_requests raisable by selections app"
  on item_requests for insert to authenticated with check (has_app('/selections'));
-- Resolving a request is a Masters decision, not a design one.
create policy "item_requests resolvable by masters app"
  on item_requests for update to authenticated
  using (has_app('/masters')) with check (has_app('/masters'));

-- Read-only to the app; rows arrive only via the security-definer trigger.
create policy "audit_log readable by admins"
  on audit_log for select to authenticated using (is_admin());

-- Additional policies on tables 0004 restricted to admins. Policies are
-- permissive, so these widen rather than replace the admin ones.
create policy "spaces writable by selections app"
  on spaces for insert to authenticated with check (has_app('/selections'));
create policy "spaces updatable by selections app"
  on spaces for update to authenticated
  using (has_app('/selections')) with check (has_app('/selections'));
-- A space with lines against it must not vanish; the FK from
-- selection_lines already prevents that, so an unused space can go.
create policy "spaces deletable by selections app"
  on spaces for delete to authenticated using (has_app('/selections'));

-- Designers may propose a space type, but only as 'pending'.
create policy "space_types proposable by selections app"
  on space_types for insert to authenticated
  with check (has_app('/selections') and status = 'pending');

-- Designers may create items, but only provisional ones — a real
-- catalogue entry stays an admin action.
create policy "items proposable by selections app"
  on items for insert to authenticated
  with check (has_app('/selections') and is_provisional);
