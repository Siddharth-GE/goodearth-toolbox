-- 0028 — an indent line may only anchor to the CURRENT design revision.
--
-- The bug this closes: every revision of a unit's selection gets its own
-- budget, and an approved budget stays approved forever (it is the
-- historical record). The pull screen offered all of them, and the
-- "already asked" check was scoped to one budget_id — so the same
-- line_key could be pulled once from R1's budget and again from R2's,
-- and the material bought twice. The screens now filter to the latest
-- issued revision; this trigger is the boundary that holds when the
-- screen is stale, the URL is pasted, or a revision is issued mid-pull
-- ("triggers are the boundary, buttons are a courtesy").
--
-- security definer, owned by postgres: the site engineer raising the
-- indent holds /indents, NOT /budgets, so under their own RLS the
-- budgets row is invisible. Same narrow shape as 0023 §9 — the function
-- reads one status column and returns nothing.
--
-- Insert-only: an indent line's anchor is set once at pull time and
-- never re-pointed (0019). Lines already anchored to a revision that is
-- superseded LATER are history, not errors — they stay.
--
-- Re-runnable throughout (the 0016 convention).

create or replace function indent_lines_budget_current()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  revision_status text;
begin
  if new.budget_id is null then
    return new;
  end if;

  select s.status into revision_status
  from budgets b
  join selections s on s.id = b.selection_id
  where b.id = new.budget_id;

  if revision_status is distinct from 'issued' then
    raise exception 'This budget belongs to a superseded design revision — pull from the latest issued revision instead';
  end if;

  return new;
end $$;

drop trigger if exists indent_lines_budget_current on indent_lines;
create trigger indent_lines_budget_current
  before insert on indent_lines
  for each row execute function indent_lines_budget_current();
