-- 0067 — a record of which migrations this database has actually had
--
-- Why this exists
-- ---------------
-- Sixty-six migrations have been applied to one database, by hand, from
-- one machine, and nothing anywhere records that they were. It worked
-- because there was one database and one person, and the answer to "has
-- 0059 been applied?" was "yes, I remember doing it".
--
-- From 17 Aug 2026 there are two databases: a fresh one carrying the real
-- work, and today's, which keeps every experiment and becomes staging.
-- Two databases and a memory is not a system. They drift apart silently,
-- and a staging database that is quietly a migration behind is worse than
-- no staging database at all — it produces confident green results about
-- a schema production does not have.
--
-- So: one small table, written by scripts/apply-migrations.ts, which
-- refuses to apply anything already listed here. Re-running the whole
-- folder against either database becomes a no-op instead of a gamble.
--
-- The checksum is the point
-- -------------------------
-- Filenames alone would only answer "did something with this name run?".
-- The checksum answers "did THIS file run?" — so an applied migration
-- that was edited afterwards (which the rulebook forbids, and which is
-- exactly the kind of rule that gets broken at 1am) is detectable rather
-- than invisible.
--
-- Who may read it
-- ---------------
-- Nobody. RLS is on and there are deliberately no policies, so every
-- signed-in role sees an empty table. The management API connects as the
-- owner, which RLS does not constrain, and that is the only writer there
-- has ever been. This is bookkeeping about the database, not data in it;
-- no screen reads it and none should.
--
-- Safe to run twice: `if not exists`, idempotent revokes.

create table if not exists applied_migrations (
  -- The migration's filename, exactly as it sits in supabase/migrations —
  -- e.g. '0059_views_are_read_only.sql'. Primary key, so a second attempt
  -- to record the same file is refused by the database rather than by the
  -- script remembering to check.
  filename text primary key,
  -- SHA-256 of the file's bytes at the moment it was applied.
  checksum text not null,
  applied_at timestamptz not null default now()
);

alter table applied_migrations enable row level security;

-- No policies, on purpose. See the header: this table has exactly one
-- writer (the management API, as owner) and no readers in the app.

-- The 0059 rule: Supabase's default privileges are wider than the
-- policies above, and `revoke ... from public` does not touch anon or
-- authenticated, so name them.
revoke all on applied_migrations from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Assert what this migration claimed to do
-- ---------------------------------------------------------------------
do $$
declare
  v_policies int;
begin
  if not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'applied_migrations'
      and c.relrowsecurity
  ) then
    raise exception '0067: RLS is not enabled on applied_migrations';
  end if;

  -- Zero is the claim. A policy appearing here later would mean somebody
  -- decided a screen should read this, which is a decision worth making
  -- deliberately rather than by accident.
  select count(*) into v_policies
  from pg_policies
  where schemaname = 'public' and tablename = 'applied_migrations';
  if v_policies <> 0 then
    raise exception '0067: applied_migrations must have no policies, found %', v_policies;
  end if;

  if exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'applied_migrations'
      and grantee in ('public', 'anon', 'authenticated')
  ) then
    raise exception '0067: applied_migrations still grants privileges to a signed-in role';
  end if;
end $$;
