-- 0100 — Dexter: a deck's answers
--
-- FOUNDER, 2026-10-02 (plan.md at the repo root): some decks carry
-- questions, and what the client types must survive closing the tab. The
-- viewer is sandboxed (no localStorage, no cookies — SECURITY.md,
-- _Dexter's public door_), so the toolbox keeps the answers: one row per
-- deck, written only by the public route through the service-role client
-- after the share token has matched, read and cleared by anyone with the
-- grant.
--
--   * ONE row per deck (founder: one link is one client). "New link" and
--     "Replace file" keep it; deleting the deck takes it along — a deck's
--     own data, not the line chain, so CASCADE is right here.
--   * `fields` is a flat jsonb object, name → string | boolean | list of
--     strings, validated field by field in lib/dexter/answers.ts before
--     it is written; the CHECKs below are the backstop.
--   * NOTHING FOR anon, and NO INSERT/UPDATE POLICY AT ALL — the only
--     writer is the route, and it does not use a policy. SELECT and
--     DELETE need has_app('/dexter').
--   * NO audit_row trigger, on purpose: autosave writes a row per pause
--     in typing with no actor to record; updated_at is the record.
--
-- Re-runnable throughout.

create table if not exists dexter_answers (
  deck_id uuid primary key references dexter_decks (id) on delete cascade,
  fields jsonb not null default '{}'::jsonb
    check (jsonb_typeof(fields) = 'object' and pg_column_size(fields) <= 131072),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_updated_at on dexter_answers;
create trigger set_updated_at before update on dexter_answers
  for each row execute function set_updated_at();

alter table dexter_answers enable row level security;

drop policy if exists "dexter_answers readable by dexter app" on dexter_answers;
create policy "dexter_answers readable by dexter app" on dexter_answers
  for select to authenticated using (has_app('/dexter'));

drop policy if exists "dexter_answers deletable by dexter app" on dexter_answers;
create policy "dexter_answers deletable by dexter app" on dexter_answers
  for delete to authenticated using (has_app('/dexter'));

-- ---------------------------------------------------------------------
-- Prove it all landed
-- ---------------------------------------------------------------------

do $$
declare
  v int;
begin
  if not exists (select 1 from pg_class where relname = 'dexter_answers' and relrowsecurity) then
    raise exception '0100: dexter_answers is missing or has RLS off';
  end if;

  select count(*) into v from pg_policies
    where schemaname = 'public' and tablename = 'dexter_answers';
  if v <> 2 then
    raise exception '0100: dexter_answers has % policies, expected 2', v;
  end if;

  select count(*) into v from pg_policies
    where schemaname = 'public' and tablename = 'dexter_answers' and cmd = 'SELECT';
  if v <> 1 then
    raise exception '0100: expected exactly 1 SELECT policy, found %', v;
  end if;

  -- The line this migration is built around: nobody signed in writes it.
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'dexter_answers'
      and cmd in ('INSERT', 'UPDATE', 'ALL')
  ) then
    raise exception '0100: dexter_answers must have no INSERT/UPDATE policy';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'dexter_answers' and 'anon' = any(roles)
  ) then
    raise exception '0100: dexter_answers has a policy for anon';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'set_updated_at' and tgrelid = 'dexter_answers'::regclass
  ) then
    raise exception '0100: set_updated_at trigger missing';
  end if;
end $$;
