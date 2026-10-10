-- 0110 — The Estimator reads requests for issue, for their off-estimate reason
--
-- FOUNDER, 2026-10-08 (plan.md, B10): a supervisor asking for material
-- the official estimate does not list for that work says why (0104 added
-- issue_requests.off_estimate_reason), and the Estimator's Site check
-- shows that reason beside the "outside the estimate" row the estimator
-- approves. Site check is an /estimator screen; issue_requests was
-- readable only by /supervisors and /inventory (0084).
--
-- WIDEN THE ONE SELECT POLICY, never add a second (SECURITY.md — two
-- permissive policies OR together and the second is invisible). The
-- table carries no money: a plot, a work, an item, a quantity, notes and
-- the reason. Writes are untouched — the estimator reads, nothing more;
-- issue_requests_guard() still decides every change.
--
-- STATUS.md's contract table gains the read: Estimator → issue_requests.
--
-- Re-runnable.

drop policy if exists "issue_requests readable by supervisors and inventory" on issue_requests;
drop policy if exists "issue_requests readable by supervisors, inventory and estimator" on issue_requests;
create policy "issue_requests readable by supervisors, inventory and estimator" on issue_requests
  for select to authenticated
  using (has_app('/supervisors') or has_app('/inventory') or has_app('/estimator'));

do $$
declare
  v_select int;
  v_qual text;
begin
  select count(*) into v_select
  from pg_policies
  where schemaname = 'public' and tablename = 'issue_requests' and cmd = 'SELECT';
  if v_select <> 1 then
    raise exception '0110: issue_requests must have exactly one SELECT policy, found %', v_select;
  end if;

  select qual into v_qual
  from pg_policies
  where schemaname = 'public' and tablename = 'issue_requests' and cmd = 'SELECT';
  if v_qual not like '%/supervisors%' or v_qual not like '%/inventory%'
     or v_qual not like '%/estimator%' then
    raise exception '0110: the SELECT policy must admit /supervisors, /inventory and /estimator: %', v_qual;
  end if;

  if (select count(*) from pg_policies
      where schemaname = 'public' and tablename = 'issue_requests' and cmd <> 'SELECT') <> 3 then
    raise exception '0110: issue_requests write policies changed — they must not';
  end if;

  if not (select relrowsecurity from pg_class where oid = 'public.issue_requests'::regclass) then
    raise exception '0110: RLS must stay on for issue_requests';
  end if;
end $$;
