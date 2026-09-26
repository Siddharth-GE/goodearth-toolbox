-- 0097 — A work can be on an estimate before it is measured
--
-- The Estimator rework (root plan.md, step 4; founder, 2026-09-26: "go
-- ahead and execute your plan"). Until now adding a work demanded a
-- quantity above zero, so a work that was going to be measured had to be
-- given a throwaway number first and measured over it. The measurement
-- sheet (0096) is where a quantity really comes from; this lets a villa
-- list its works first and measure them after.
--
-- estimator_estimate_lines.qty stops being NOT NULL. Null means "to
-- measure": listed, not yet quantified. The 0074 CHECK (qty > 0) stays
-- exactly as it is — a CHECK passes a null, so any number entered must
-- still be above zero. Nothing downstream ever sees a null: the 0077
-- snapshot's line_costs.qty stays NOT NULL, and making an estimate
-- official refuses while any work is still to measure (0098, and the
-- app before it), so every frozen quantity — and every row the site
-- tools read through estimate_takeoff_facts — is a real number.
--
-- A relaxation only, the 0086 precedent. Re-runnable.

alter table estimator_estimate_lines alter column qty drop not null;

comment on column estimator_estimate_lines.qty is
  'How much of the work this estimate needs, in the work''s unit. Null = listed but not yet measured (0097); an estimate cannot be made official while any line is null.';

-- ---------------------------------------------------------------------
-- Prove it landed
-- ---------------------------------------------------------------------

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'estimator_estimate_lines'
      and column_name = 'qty'
      and is_nullable = 'NO'
  ) then
    raise exception '0097: estimator_estimate_lines.qty is still NOT NULL';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'estimator_estimate_line_costs'
      and column_name = 'qty'
      and is_nullable = 'NO'
  ) then
    raise exception '0097: the frozen line_costs.qty must stay NOT NULL';
  end if;
end $$;
