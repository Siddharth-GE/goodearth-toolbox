-- 0139 — Every row-level policy asks its checks once per query, not once per row.
--
-- has_app(), is_admin(), is_lead(), session_is_verified() and auth.uid() are STABLE, and the first four are security definers,
-- which Postgres never inlines: written bare in a policy, each runs again for every row read. Since 0129 put
-- session_is_verified() on every read, a 714-row works list spent 135 ms in it. Wrapped as (select f(...)), each becomes an
-- initPlan run once per query; the answer is the same, because no call here takes anything from the row — only constants.
-- Calls that take a column (a helper given the row's id) are left as they are. Views are untouched.

do $$
declare
  p record;
  wrap constant text := '(SELECT \&)';
  v_qual text;
  v_check text;
begin
  for p in
    select tablename, policyname, qual, with_check
      from pg_policies
     where schemaname = 'public'
       and coalesce(qual, '') || coalesce(with_check, '')
           ~ '(has_app|is_lead)\(''[^'']*''::text\)|session_is_verified\(\)|is_admin\(\)|auth\.uid\(\)'
  loop
    v_qual := p.qual;
    v_check := p.with_check;
    v_qual := regexp_replace(v_qual, '(has_app|is_lead)\(''[^'']*''::text\)', wrap, 'g');
    v_qual := regexp_replace(v_qual, 'session_is_verified\(\)|is_admin\(\)|auth\.uid\(\)', wrap, 'g');
    v_check := regexp_replace(v_check, '(has_app|is_lead)\(''[^'']*''::text\)', wrap, 'g');
    v_check := regexp_replace(v_check, 'session_is_verified\(\)|is_admin\(\)|auth\.uid\(\)', wrap, 'g');
    execute format('alter policy %I on public.%I', p.policyname, p.tablename)
      || case when v_qual is not null then format(' using (%s)', v_qual) else '' end
      || case when v_check is not null then format(' with check (%s)', v_check) else '' end;
  end loop;
end $$;

-- Every call is now wrapped: none stands bare.
do $$
declare
  n int;
begin
  select count(*) into n
    from pg_policies
   where schemaname = 'public'
     and coalesce(qual, '') || ' ' || coalesce(with_check, '')
         ~ '(?<!SELECT )((has_app|is_lead)\(''[^'']*''::text\)|session_is_verified\(\)|is_admin\(\)|auth\.uid\(\))';
  if n > 0 then
    raise exception '0139: % policies still call a check once per row', n;
  end if;
end $$;
