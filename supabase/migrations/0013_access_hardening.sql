-- Access-control hardening.
--
-- Two problems, both found by auditing the whole schema against the code
-- once Selections and Budgets started depending on each other.
--
-- 1. ANY STAFF USER COULD MAKE THEMSELVES AN ADMIN.
--    0001_profiles.sql lets a user update their own profile row so they
--    can edit their name — but `role` is on that row, and the anon key is
--    in every browser. One PATCH against /rest/v1/profiles and a junior
--    staff member had every app grant, including /budgets, which is the
--    one boundary the schema treats as a secret (0011). The policy's own
--    comment claimed "only admins edit roles"; nothing enforced it.
--
-- 2. GRANTING SOMEONE /masters DID NOT ACTUALLY LET THEM WRITE.
--    Every masters action gates on requireApp(user, "/masters"), but
--    0004_masters.sql restricted writes to is_admin(). A non-admin holding
--    the grant passed the code check and was then silently refused by
--    Postgres, surfacing as "Could not create project. Try again." Nobody
--    hit it because the only user so far is an admin. 0008 already fixed
--    this for items UPDATE alone and documented the wider mismatch.
--
-- Both are policy changes, not data changes, so this migration touches no
-- rows. Every statement is written to be re-runnable — the first attempt
-- failed partway through, on a policy name 0008 had already used, and a
-- migration that can't be run twice is a migration you can't recover from.

-- ---------------------------------------------------------------------
-- 1. Roles are an admin decision
-- ---------------------------------------------------------------------
-- Postgres RLS can't restrict an UPDATE to particular *columns*, so the
-- rule lives in a trigger: keep your own row editable, but changing what
-- `role` says is something only an admin can do.
create or replace function profiles_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role and not is_admin() then
    raise exception 'Only an admin can change a role';
  end if;
  return new;
end $$;

drop trigger if exists profiles_guard on profiles;
create trigger profiles_guard
  before update on profiles
  for each row execute function profiles_guard();

-- The counterpart: an admin needs to be able to edit somebody else's row
-- at all. The 0001 policy is scoped to auth.uid() = id, so before this
-- there was no path for an admin to promote anyone — the escalation hole
-- was, ironically, the only way roles ever changed.
drop policy if exists "profiles updatable by admins" on profiles;
create policy "profiles updatable by admins"
  on profiles for update to authenticated
  using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------
-- 2. Masters writes follow the /masters grant, like every other tool
-- ---------------------------------------------------------------------
-- has_app() already returns true for admins (see 0006), so these policies
-- are a strict superset of the is_admin() ones they replace — no admin
-- loses anything.
--
-- Note `items`: 0008 already created "items updatable by masters app" for
-- exactly this reason, before the fix was applied schema-wide. The drop
-- below absorbs it rather than colliding with it, which is what broke the
-- first run of this migration.
--
-- New policies are created BEFORE the old ones are dropped, deliberately:
-- if this script fails halfway, the tables are left with too many
-- policies rather than too few, and nobody is locked out of their data.
do $$
declare
  t text;
begin
  for t in select unnest(array[
    'item_categories', 'brands', 'space_types', 'projects', 'plots',
    'clients', 'units', 'vendors', 'stores', 'items', 'spaces'
  ])
  loop
    execute format('drop policy if exists "%1$s insertable by masters app" on %1$s', t);
    execute format(
      'create policy "%1$s insertable by masters app" on %1$s for insert to authenticated with check (has_app(''/masters''))', t
    );

    execute format('drop policy if exists "%1$s updatable by masters app" on %1$s', t);
    execute format(
      'create policy "%1$s updatable by masters app" on %1$s for update to authenticated using (has_app(''/masters'')) with check (has_app(''/masters''))', t
    );
  end loop;

  for t in select unnest(array[
    'item_categories', 'brands', 'space_types', 'projects', 'plots',
    'clients', 'units', 'vendors', 'stores', 'items', 'spaces'
  ])
  loop
    execute format('drop policy if exists "%1$s insertable by admins" on %1$s', t);
    execute format('drop policy if exists "%1$s updatable by admins" on %1$s', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 3. is_admin() gets the same hardening every other helper already has
-- ---------------------------------------------------------------------
-- It is called from inside ~24 RLS policies and now from a trigger, so it
-- must not be resolvable against a caller-controlled search_path. Every
-- other function in this schema (has_app, audit_row, handle_new_user,
-- issue_selection, …) already pins it; this one was written first and was
-- missed.
create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
$$;
