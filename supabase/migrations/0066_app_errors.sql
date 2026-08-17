-- 0066 — a record of what the error screen actually was
--
-- Why this exists
-- ---------------
-- On the evening of 16 Aug 2026 the Operations tools threw repeated
-- "Something went wrong" screens across Selections, Budgets and Indents,
-- and were fine by morning. Working out what happened took a forensic
-- dig through production, and it still only produced one confirmed
-- failure — because the app records nothing about its own errors. The
-- error boundary shows a digest, Next logs the stack to Vercel, and
-- Supabase keeps roughly an hour of edge logs. By the time anyone looks,
-- the evidence is gone.
--
-- So: one small table. When app/(dashboard)/error.tsx renders, it writes
-- the digest, the path and the message here. Next morning the question
-- "what broke last night?" has an answer that is still there.
--
-- What this is NOT
-- ----------------
-- Not analytics, not a metrics pipeline, not a second logging system.
-- One table, insert-only from the app, readable by admins. Nothing reads
-- it in a hot path.
--
-- Privacy and trust
-- -----------------
-- `message` is Next's own error text, which for a server error in
-- production is the redacted "An error occurred in the Server Components
-- render" — no rupees, no client prose. It is nonetheless admin-read
-- only, because a message from a client-side throw could carry more.
--
-- Anyone signed in may INSERT (an error screen is exactly when the user
-- may have no grants left), but nobody may read, update or delete except
-- an admin, so the table cannot be mined or quietly emptied by whoever
-- caused the error.
--
-- Safe to run twice: `if not exists`, `drop policy if exists`, and
-- idempotent revokes.

create table if not exists app_errors (
  id bigint generated always as identity primary key,
  -- Next's error digest — the value printed on the error screen as
  -- "Reference:", and the same value in the Vercel function log. This is
  -- what ties what the user saw to the server-side stack.
  digest text,
  -- The route the user was on when it threw.
  path text,
  -- Next's error message, redacted by Next itself for server errors.
  message text,
  -- Who hit it; null when the throw happened before the session resolved.
  actor uuid references auth.users (id) on delete set null,
  at timestamptz not null default now()
);

create index if not exists app_errors_at_idx on app_errors (at desc);

alter table app_errors enable row level security;

-- Insert: any signed-in user. A page that just threw is precisely the
-- case where the user's grants may be unavailable, so gating this on
-- has_app() would drop the record exactly when it is most wanted.
-- `actor` is fixed to the caller so a row cannot be filed against
-- somebody else.
drop policy if exists "app_errors insertable by signed-in users" on app_errors;
create policy "app_errors insertable by signed-in users"
  on app_errors for insert to authenticated
  with check (actor is null or actor = auth.uid());

-- Read: admins only. is_admin() carries session_is_verified() (0063).
drop policy if exists "app_errors readable by admins" on app_errors;
create policy "app_errors readable by admins"
  on app_errors for select to authenticated
  using (is_admin());

-- No update and no delete policy at all: the record is append-only to
-- every signed-in role, including admins.

-- The 0059 rule: the platform's default privileges are wider than the
-- policies above, and `revoke ... from public` does not touch anon or
-- authenticated, so name them.
revoke all on app_errors from public, anon;
revoke update, delete, truncate on app_errors from authenticated;
grant insert, select on app_errors to authenticated;

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
    where n.nspname = 'public' and c.relname = 'app_errors' and c.relrowsecurity
  ) then
    raise exception '0066: RLS is not enabled on app_errors';
  end if;

  select count(*) into v_policies
  from pg_policies where schemaname = 'public' and tablename = 'app_errors';
  if v_policies <> 2 then
    raise exception '0066: expected exactly 2 policies on app_errors, found %', v_policies;
  end if;

  -- Nothing may write over or remove a filed error.
  if exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'app_errors'
      and grantee in ('public', 'anon')
  ) then
    raise exception '0066: app_errors still grants privileges to public or anon';
  end if;

  if exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'app_errors'
      and grantee = 'authenticated'
      and privilege_type in ('UPDATE', 'DELETE', 'TRUNCATE')
  ) then
    raise exception '0066: app_errors must be append-only for authenticated';
  end if;
end $$;
