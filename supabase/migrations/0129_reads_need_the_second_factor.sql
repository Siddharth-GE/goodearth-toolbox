-- 0129 — Every read asks for the second factor, and anon can call nothing.
-- (Refactor Phase 4, M3; founder 2026-10-18: "do what you think is best".)
--
-- 1. The read policies that said `using (true)` let a session that had only
--    passed the password read every profile, client, indent and trail.
--    They now ask session_is_verified(), as has_app() and is_admin() do.
--    profiles also admits a person's own row: the sign-in flow reads it to
--    refuse a switched-off account before the code is done.
-- 2. anon (the public key, no sign-in) loses EXECUTE on every function in
--    public (but pg_trgm's own, which read no data and are not ours to
--    revoke), and SELECT on the four Birdwing views; a function keeps
--    exactly the authenticated access it had.
-- 3. Objects created from now on give anon nothing by default.

-- 1 ---------------------------------------------------------------------

do $$
declare
  p record;
begin
  for p in
    select tablename, policyname from pg_policies
     where schemaname = 'public' and cmd = 'SELECT' and qual = 'true'
       and roles = '{authenticated}'
  loop
    if p.tablename = 'profiles' then
      execute format(
        'alter policy %I on public.%I using (session_is_verified() or id = auth.uid())',
        p.policyname, p.tablename);
    else
      execute format('alter policy %I on public.%I using (session_is_verified())',
        p.policyname, p.tablename);
    end if;
  end loop;
end $$;

-- 2 ---------------------------------------------------------------------

do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig,
           has_function_privilege('authenticated', p.oid, 'execute') as for_staff
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    if f.for_staff then
      execute format('grant execute on function %s to authenticated', f.sig);
    end if;
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;

do $$
declare
  v record;
begin
  for v in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'v' and has_table_privilege('anon', c.oid, 'select')
  loop
    execute format('revoke all on public.%I from anon', v.relname);
  end loop;
end $$;

-- 3 ---------------------------------------------------------------------

alter default privileges for role postgres in schema public revoke execute on functions from public, anon;
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;

-- What it claimed --------------------------------------------------------

do $$
declare
  n int;
begin
  select count(*) into n from pg_policies
   where schemaname = 'public' and cmd = 'SELECT' and qual = 'true';
  if n <> 0 then
    raise exception '0129: % read policies still say using (true)', n;
  end if;

  select count(*) into n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')
     and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e');
  if n <> 0 then
    raise exception '0129: anon can still execute % functions', n;
  end if;

  select count(*) into n from pg_class c join pg_namespace s on s.oid = c.relnamespace
   where s.nspname = 'public' and c.relkind = 'v' and has_table_privilege('anon', c.oid, 'select');
  if n <> 0 then
    raise exception '0129: anon can still read % views', n;
  end if;

  foreach n in array array[
    (select count(*)::int from pg_proc where proname in ('has_app', 'is_admin', 'is_lead', 'session_is_verified')
      and not has_function_privilege('authenticated', oid, 'execute'))
  ] loop
    if n <> 0 then
      raise exception '0129: authenticated lost execute on a policy helper';
    end if;
  end loop;
end $$;
