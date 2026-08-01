-- Phase 2b — design views: the renders and elevations a designer uploads
-- for a space.
--
-- These turn the Selections document from a list into something a client
-- can actually look at, space by space, and the priced client quote
-- (Budgets, later) shows the same views above its own numbers.
--
-- The files live in a PRIVATE Supabase Storage bucket, unlike the public
-- `catalogue` bucket. Catalogue images are vendor product photos; these
-- are a specific client's design work and must not be reachable by
-- anyone who happens to have the URL. They're served through a route
-- handler that checks the caller first — see
-- app/(dashboard)/selections/views/[viewId]/route.ts.

create table space_views (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references spaces (id) on delete cascade,
  -- Object key within the design-views bucket, not a URL: the bucket is
  -- private, so there is no durable public address to store.
  storage_path text not null,
  caption text,
  sort_order int not null default 0,
  uploaded_by uuid references profiles (id),
  created_at timestamptz not null default now()
);
create index on space_views (space_id);

alter table space_views enable row level security;

-- Read is open to authenticated staff, matching every other table the
-- downstream tools need: Budgets renders these into the client quote
-- under its own /budgets grant, and should not need /selections to do it.
create policy "space_views readable by authenticated users"
  on space_views for select to authenticated using (true);

create policy "space_views writable by selections app"
  on space_views for insert to authenticated with check (has_app('/selections'));
create policy "space_views updatable by selections app"
  on space_views for update to authenticated
  using (has_app('/selections')) with check (has_app('/selections'));
create policy "space_views deletable by selections app"
  on space_views for delete to authenticated using (has_app('/selections'));

-- Deliberately NOT audited. audit_row() from 0006 stores whole rows as
-- jsonb for selections, selection_lines and spaces because those are the
-- record of what was agreed. A view is an attachment: which render was
-- uploaded and when is answerable from the row itself, and copying its
-- metadata on every caption edit adds noise rather than accountability.
