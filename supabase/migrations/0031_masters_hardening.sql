-- Masters hardening — the data layer catches up with the rest of the app.
--
-- Four gaps, found planning the Settings & Masters upgrade:
--   1. gst_rates writes were still is_admin() (created in 0021, after
--      0013 widened every other master to has_app('/masters')) — the
--      last remnant of the 0008 mismatch. A non-admin with /masters
--      passed requireTool and was then silently refused by the database.
--   2. clients, item_categories and brands had no off-switch — once
--      created, forever offered by every picker.
--   3. No masters table carried updated_at/updated_by, so Attribution
--      ("edited by X, when") could not render on masters.
--   4. Audit coverage stopped at items/vendors/item_requests (0020) —
--      "who renamed this project" was unanswerable.
--
-- Re-runnable throughout (the 0016 convention): `if not exists` /
-- `drop ... if exists` on everything.

-- ---------------------------------------------------------------------
-- 1. gst_rates writes follow the /masters grant, like every other master
-- ---------------------------------------------------------------------
drop policy if exists "gst_rates writable by admins" on gst_rates;
create policy "gst_rates insertable by masters app"
  on gst_rates for insert to authenticated with check (has_app('/masters'));
drop policy if exists "gst_rates updatable by admins" on gst_rates;
create policy "gst_rates updatable by masters app"
  on gst_rates for update to authenticated
  using (has_app('/masters')) with check (has_app('/masters'));

-- Its primary key is the rate itself (numeric). audit_row() records
-- new.id, so the audited-table convention applies: a surrogate id that
-- exists only for the audit trail (the 0018 user_apps pattern).
alter table gst_rates add column if not exists id uuid not null default gen_random_uuid();
create unique index if not exists gst_rates_id_key on gst_rates (id);

-- ---------------------------------------------------------------------
-- 2. An off-switch for the three masters that had none
-- ---------------------------------------------------------------------
-- Deactivation, never deletion (the locked no-soft-delete stance covers
-- rows, not flags): pickers stop offering an inactive row; history keeps
-- pointing at it unchanged — the same snapshot principle gst_rates and
-- vendors already follow.
alter table clients add column if not exists is_active boolean not null default true;
alter table item_categories add column if not exists is_active boolean not null default true;
alter table brands add column if not exists is_active boolean not null default true;

-- ---------------------------------------------------------------------
-- 3. updated_at / updated_by on every master
-- ---------------------------------------------------------------------
-- updated_at is the database's job (set_updated_at, 0016 — a column
-- kept by hand in some code paths is worse than no column). updated_by
-- is stamped by the actions, the same split every transactional table
-- uses.
do $$
declare
  t text;
begin
  for t in select unnest(array[
    'projects', 'plots', 'units', 'clients', 'vendors', 'stores',
    'items', 'item_categories', 'brands', 'gst_rates'
  ])
  loop
    execute format('alter table %I add column if not exists updated_at timestamptz', t);
    execute format('alter table %I add column if not exists updated_by uuid references profiles (id)', t);
    execute format('drop trigger if exists set_updated_at on %I', t);
    execute format(
      'create trigger set_updated_at before update on %I for each row execute function set_updated_at()', t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 4. Audit triggers on the masters 0020 left out
-- ---------------------------------------------------------------------
-- items, vendors and item_requests are already covered (0020). All the
-- tables below carry a uuid id (gst_rates as of §1), so the shared
-- audit_row() (0006) applies cleanly. spaces/space_types stay out —
-- design-side, no screen yet.
do $$
declare
  t text;
begin
  for t in select unnest(array[
    'projects', 'plots', 'units', 'clients', 'stores',
    'item_categories', 'brands', 'gst_rates'
  ])
  loop
    execute format('drop trigger if exists audit_%I on %I', t, t);
    execute format(
      'create trigger audit_%I after insert or update or delete on %I for each row execute function audit_row()', t, t
    );
  end loop;
end $$;
