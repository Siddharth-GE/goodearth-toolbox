-- Phase 2 (M4) — resolving item requests.
--
-- Approving a provisional item clears its is_provisional flag, and
-- merging it as a duplicate sets merged_into_item_id. Both are UPDATEs on
-- `items`, which 0004_masters.sql restricted to admins.
--
-- That restriction is also a latent inconsistency worth fixing while
-- we're here: lib/masters/*-actions.ts gates every write on
-- requireApp(user, "/masters"), so a non-admin granted /masters passes the
-- application check and is then silently refused by RLS. Policies are
-- permissive, so this widens the admin rule rather than replacing it.

create policy "items updatable by masters app"
  on items for update to authenticated
  using (has_app('/masters')) with check (has_app('/masters'));

-- Same reasoning for the rest of the master tables a /masters holder is
-- expected to be able to edit.
create policy "item_categories updatable by masters app"
  on item_categories for update to authenticated
  using (has_app('/masters')) with check (has_app('/masters'));

create policy "brands updatable by masters app"
  on brands for update to authenticated
  using (has_app('/masters')) with check (has_app('/masters'));

-- A resolved request may also need the item renamed into the catalogue's
-- own naming, so /masters can insert real (non-provisional) items too.
create policy "items insertable by masters app"
  on items for insert to authenticated with check (has_app('/masters'));
