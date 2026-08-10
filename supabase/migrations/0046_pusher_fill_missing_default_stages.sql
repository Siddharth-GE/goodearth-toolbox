-- 0046 — fill the gaps in a part-built schedule
--
-- 0045 deliberately skips any project that already has stages, so a
-- schedule someone has worked on is never overwritten. That left Saarang
-- with the two stages the founder made while testing — Design and
-- Construction — and neither of the other six.
--
-- Those two happen to be two of the canonical eight, so this fills in
-- only what is MISSING BY NAME and leaves every existing row alone:
-- its weeks, its id, and the trails filed under it are all untouched.
-- Only sort_order is normalised, because that is presentation, not data,
-- and a Design stage sitting after Handover reads as a bug.
--
-- Written as a set operation over all projects rather than a one-off fix
-- for Saarang: the same gap appears whenever someone adds a stage to a
-- project before the defaults arrive, and this is then re-runnable.

do $$
declare
  r record;
begin
  for r in select id from projects
  loop
    insert into project_stages (project_id, name, weeks, sort_order)
    select r.id, v.name, v.weeks, v.sort_order
    from (values
      ('Masterplan',         12,  10),
      ('Approvals',          16,  20),
      ('Design',             20,  30),
      ('Technical Drawings', 16,  40),
      ('Construction',       52,  50),
      ('Finishing',          16,  60),
      ('Interiors',          16,  70),
      ('Handover',            8,  80)
    ) as v(name, weeks, sort_order)
    -- unique (project_id, name) is what makes "missing" well defined.
    where not exists (
      select 1 from project_stages s
      where s.project_id = r.id and s.name = v.name
    );
  end loop;
end $$;

-- Put the canonical eight in their canonical order wherever they appear.
-- Anything a person has added beyond them keeps whatever order it had.
update project_stages s
set sort_order = v.sort_order
from (values
  ('Masterplan',         10),
  ('Approvals',          20),
  ('Design',             30),
  ('Technical Drawings', 40),
  ('Construction',       50),
  ('Finishing',          60),
  ('Interiors',          70),
  ('Handover',           80)
) as v(name, sort_order)
where s.name = v.name and s.sort_order is distinct from v.sort_order;
