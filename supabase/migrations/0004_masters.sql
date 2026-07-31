-- Phase 1 — Masters: the shared foundation every later tool
-- (Selections, Budgets, Indents, PO, Inventory, Bills) reads from.
-- Reads have no requireApp gate (see lib/masters/*.ts) — only writes
-- require the /masters grant, enforced both in code and here via RLS.

create function is_admin()
returns boolean
language sql
stable
as $$
  select exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
$$;
-- Factors out the admin-check subquery that 0003_user_apps.sql wrote
-- inline 4 times — here it'd otherwise repeat ~22 times (11 tables x 2
-- write policies). Same check, same security model, just not copy-pasted.

create table item_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  kind text not null check (kind in ('catalogue', 'material')),
  created_at timestamptz not null default now()
);

create table brands (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table space_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order int not null default 0
);

create table projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  location text,
  project_type text not null check (
    project_type in ('apartment_villa_community', 'eco_village', 'mixed_residential_commercial')
  ),
  status text not null default 'planning' check (status in ('planning', 'active', 'completed')),
  created_at timestamptz not null default now()
);

create table plots (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id),
  name text not null,
  area numeric,
  status text not null default 'available' check (status in ('available', 'reserved', 'sold')),
  created_at timestamptz not null default now()
);
create index on plots (project_id);

create table clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  mobile text,
  email text,
  notes text,
  created_at timestamptz not null default now()
);

create table units (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id),
  plot_id uuid references plots (id) on delete set null,
  name text not null,
  unit_type text not null check (unit_type in ('apartment', 'villa', 'duplex_row_house')),
  client_id uuid references clients (id) on delete set null,
  status text not null default 'available' check (status in ('available', 'reserved', 'sold')),
  created_at timestamptz not null default now()
);
create index on units (project_id);
create index on units (plot_id);
create index on units (client_id);

create table vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_name text,
  mobile text,
  gst_no text,
  address text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  project_id uuid references projects (id) on delete set null,
  location text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index on stores (project_id);

create table items (
  id uuid primary key default gen_random_uuid(),
  code text unique,
  name text not null,
  description text,
  kind text not null check (kind in ('catalogue', 'material')),
  category_id uuid not null references item_categories (id),
  brand_id uuid references brands (id) on delete set null,
  placement text check (placement in ('fixed', 'loose', 'soft_furnishing')),
  default_uom text not null check (
    default_uom in ('each', 'rft', 'sqft', 'lumpsum', 'bag', 'kg', 'litre', 'cft')
  ),
  indicative_price numeric,
  image_url text,
  thumb_url text,
  source_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index on items (category_id);
create index on items (brand_id);
create index on items (kind);

create table spaces (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references units (id) on delete cascade,
  space_type_id uuid not null references space_types (id),
  label text,
  sort_order int not null default 0
);
create index on spaces (unit_id);
create index on spaces (space_type_id);

-- RLS: every table readable by any authenticated staff member (masters
-- data is read by every downstream tool regardless of who's granted
-- /masters — see lib/masters/*.ts). Insert/update restricted to admins.
-- No delete policy anywhere — masters are deactivated (is_active /
-- status), never hard-deleted from the app.
do $$
declare
  t text;
begin
  for t in select unnest(array[
    'item_categories', 'brands', 'space_types', 'projects', 'plots',
    'clients', 'units', 'vendors', 'stores', 'items', 'spaces'
  ])
  loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy "%1$s readable by authenticated users" on %1$s for select to authenticated using (true)', t
    );
    execute format(
      'create policy "%1$s insertable by admins" on %1$s for insert to authenticated with check (is_admin())', t
    );
    execute format(
      'create policy "%1$s updatable by admins" on %1$s for update to authenticated using (is_admin()) with check (is_admin())', t
    );
  end loop;
end $$;

-- Seed data ---------------------------------------------------------------
insert into space_types (name, sort_order) values
  ('Living', 1), ('Dining', 2), ('Kitchen', 3), ('Master Bedroom', 4),
  ('Bedroom', 5), ('Bath', 6), ('Balcony', 7), ('Utility', 8),
  ('Foyer', 9), ('Study', 10), ('Outdoor', 11);

insert into item_categories (name, kind) values
  ('Sofas', 'catalogue'),
  ('Dining Tables', 'catalogue'),
  ('Lighting', 'catalogue'),
  ('Cement & Concrete', 'material'),
  ('Tiles & Flooring', 'material');

insert into brands (name) values
  ('Goodearth Collection'), ('Kajaria'), ('Asian Paints');

insert into items (name, kind, category_id, brand_id, placement, default_uom, indicative_price, code) values
  ('Coral 3-Seater Sofa', 'catalogue',
    (select id from item_categories where name = 'Sofas'),
    (select id from brands where name = 'Goodearth Collection'),
    'loose', 'each', 68000, 'GE-SOF-001'),
  ('Teakwood Dining Table — 6 Seater', 'catalogue',
    (select id from item_categories where name = 'Dining Tables'),
    (select id from brands where name = 'Goodearth Collection'),
    'loose', 'each', 95000, 'GE-DIN-001'),
  ('Brass Pendant Light', 'catalogue',
    (select id from item_categories where name = 'Lighting'),
    (select id from brands where name = 'Goodearth Collection'),
    'fixed', 'each', 12500, 'GE-LGT-001'),
  ('OPC 53 Grade Cement', 'material',
    (select id from item_categories where name = 'Cement & Concrete'),
    null, null, 'bag', 420, null),
  ('Vitrified Tile 600x600 Matte', 'material',
    (select id from item_categories where name = 'Tiles & Flooring'),
    (select id from brands where name = 'Kajaria'),
    'fixed', 'sqft', 85, null);

-- stores: table + RLS only, zero seed rows — founder adds real ones via the UI.
