-- Correction to 0013: the role guard locked out the only way roles are
-- actually set.
--
-- 0013 stopped a staff user promoting themselves, which was the point.
-- But it checked is_admin() unconditionally, and is_admin() asks "is the
-- SIGNED-IN user an admin" — so on any path with no signed-in user it
-- answers false. That includes the Supabase Studio SQL editor, which is
-- the only place roles have ever been set (Settings manages app grants,
-- not roles). The guard blocked the legitimate path and left no way to
-- appoint an admin at all.
--
-- The distinction that actually matters is not "are you an admin" but
-- "did this request come from a browser":
--
--   auth.uid() is not null  → a signed-in user, holding the anon key that
--                             ships in every browser. Must be an admin.
--   auth.uid() is null      → direct SQL in Studio, or the service-role
--                             key. Both are already trusted with far more
--                             than this: the service-role key bypasses
--                             RLS entirely and lives only in server env
--                             vars. Guarding against it here would add no
--                             security and would remove the one working
--                             way to appoint the first admin.
--
-- Re-runnable, like 0013.

create or replace function profiles_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role
     and auth.uid() is not null
     and not is_admin() then
    raise exception 'Only an admin can change a role';
  end if;
  return new;
end $$;
