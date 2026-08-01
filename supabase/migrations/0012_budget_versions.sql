-- Budget versions.
--
-- A budget already inherits the DESIGN's revision number (R0, R1, …) from
-- the selection it prices. That answers "what was specified" but not "what
-- did we quote" — and those are different questions, because approval is
-- reversible (migration 0011). Approve a budget, send the quote, re-open
-- it to correct a rate, approve again, and the second quotation carried
-- exactly the same reference as the first: two documents, two totals, one
-- number. A client asking "which quote did we agree?" had no answer.
--
-- So: the R-number names what the designer specified, and the version
-- names what we quoted against it. QT/PLOT6/R2-v2 is unambiguous.
--
-- Version 1 is the budget as first priced. Re-opening an approved budget
-- starts version 2 — the increment happens on RE-OPEN, not on approval,
-- so the number on screen while pricing is the number that will appear on
-- the document that results. Every (version, approved_at, approved_by) it
-- has ever held is recoverable from audit_log, which records the whole
-- row on every update.

alter table budgets add column version int not null default 1 check (version >= 1);

-- ---------------------------------------------------------------------
-- Re-opening, atomically
-- ---------------------------------------------------------------------
-- A function rather than a plain UPDATE because the version has to be
-- incremented from its own current value. PostgREST can't express
-- `version = version + 1`, so the app would have to read it and write it
-- back — and two people re-opening at once would both read v1 and both
-- write v2, quietly losing a version.
--
-- security invoker: RLS still applies, so this is not a way around the
-- /budgets grant. It only makes the step atomic.
create function reopen_budget(p_budget_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update budgets
  set status = 'pricing',
      version = version + 1,
      approved_by = null,
      approved_at = null,
      updated_at = now()
  where id = p_budget_id and status = 'approved';

  if not found then
    raise exception 'Only an approved budget can be re-opened';
  end if;
end $$;

revoke execute on function reopen_budget(uuid) from public;
grant execute on function reopen_budget(uuid) to authenticated;

-- A version must never go backwards: the whole point is that a number,
-- once printed on a document sent to a client, refers to one set of
-- figures forever.
create or replace function budgets_guard()
returns trigger
language plpgsql
as $$
begin
  -- The revision a budget prices is fixed for life.
  if (new.selection_id, new.unit_id) is distinct from (old.selection_id, old.unit_id) then
    raise exception 'A budget cannot be moved to a different revision';
  end if;

  if new.version < old.version then
    raise exception 'A budget version cannot go backwards (% to %)', old.version, new.version;
  end if;

  return new;
end $$;
