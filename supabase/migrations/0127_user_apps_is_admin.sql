-- user_apps' admin policies learn the second factor.
--
-- 0003's grant, revoke and admin-read policies check profiles.role
-- directly, so an admin's password alone (no emailed code) or a switched-
-- off admin could grant any tool to anyone. is_admin() carries
-- is_active and session_is_verified(), as every later admin policy does
-- (BUGCATCHER #22). The two SELECT policies become one (CLAUDE.md: never
-- a second SELECT policy on a gated table).

drop policy if exists "admins can grant app access" on user_apps;
drop policy if exists "admins can revoke app access" on user_apps;
drop policy if exists "user_apps readable by admins" on user_apps;
drop policy if exists "user_apps readable by owner" on user_apps;
drop policy if exists "user_apps readable by owner or admin" on user_apps;

create policy "admins can grant app access"
  on user_apps for insert to authenticated
  with check (is_admin());

create policy "admins can revoke app access"
  on user_apps for delete to authenticated
  using (is_admin());

create policy "user_apps readable by owner or admin"
  on user_apps for select to authenticated
  using (user_id = auth.uid() or is_admin());

do $$
declare
  v int;
begin
  if not (select relrowsecurity from pg_class where oid = 'user_apps'::regclass) then
    raise exception '0127: row-level security is off on user_apps';
  end if;

  select count(*) into v from pg_policies where tablename = 'user_apps';
  if v <> 3 then
    raise exception '0127: user_apps has % policies, expected 3', v;
  end if;

  select count(*) into v from pg_policies
   where tablename = 'user_apps' and cmd = 'SELECT';
  if v <> 1 then
    raise exception '0127: user_apps has % SELECT policies, expected 1', v;
  end if;

  if exists (
    select 1 from pg_policies
     where tablename = 'user_apps'
       and (coalesce(qual, '') ilike '%role%' or coalesce(with_check, '') ilike '%role%')
  ) then
    raise exception '0127: a user_apps policy still reads profiles.role directly';
  end if;
end $$;
