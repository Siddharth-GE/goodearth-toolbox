-- Phase 2 (M4) — resolving item requests.
--
-- Approving a provisional item clears its is_provisional flag; merging it
-- as a duplicate sets merged_into_item_id and deactivates it; rejecting it
-- deactivates it. All three are UPDATEs on `items`, which
-- 0004_masters.sql restricted to admins — so without this, a non-admin
-- granted /masters would pass lib/masters/item-requests-actions.ts's
-- requireApp check and then be silently refused by the database.
--
-- Policies are permissive, so this widens the existing admin rule rather
-- than replacing it.
--
-- Deliberately ONE policy. The same admins-only mismatch exists on
-- projects, plots, units, clients, vendors, stores, item_categories and
-- brands: every lib/masters write gates on requireApp("/masters"), while
-- RLS still allows admins alone. That is worth fixing, but it is a
-- decision about who can edit master data, not a side effect of shipping
-- item requests — so it gets its own migration, made on purpose.

create policy "items updatable by masters app"
  on items for update to authenticated
  using (has_app('/masters')) with check (has_app('/masters'));
