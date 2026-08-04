-- 0027 — labour_contracts reads move behind the /bills grant.
--
-- 0025 §1 treated a contract's value like a vendor's GST number — a
-- counterparty fact, open to every signed-in user. The 2026-08-04
-- architecture audit flagged it as the only money column readable
-- without a money grant, and the founder decided it belongs behind
-- /bills with the rest of bill money. Only Bills code reads this table
-- (contracts moved out of Masters in 0026), so no other tool changes.
--
-- Re-runnable throughout (the 0016 convention).

drop policy if exists "labour_contracts readable by authenticated users" on labour_contracts;
drop policy if exists "labour_contracts readable by bills app" on labour_contracts;
create policy "labour_contracts readable by bills app"
  on labour_contracts for select to authenticated using (has_app('/bills'));
