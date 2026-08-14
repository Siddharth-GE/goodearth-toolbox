-- 0062 — foundations for sign-in hardening: 2FA, password reset, Google
--
-- Two tables, both server-only. Neither is reachable by any signed-in
-- role at all — RLS is on with zero policies (deny-all, the marathon_*
-- pattern from 0002/0015), and every default privilege the platform
-- handed out is revoked below, per the 0059 rule.
--
-- 1. login_attempts
-- -----------------
-- DB-backed lockout for the password, OTP and reset steps of the new
-- sign-in flow. Same reasoning as 0015: Vercel runs serverless functions
-- with no shared memory between invocations, so an in-process counter
-- would reset on every cold start and protect nothing. One row per
-- (email, step) being guessed at; rows appear on the first failure and
-- are deleted on success, so the table stays empty in normal use.
--
-- 2. auth_verified_sessions
-- -------------------------
-- The keystone of email-OTP 2FA. Supabase Auth has no native email MFA
-- factor, and the anon key is public by design — so anyone holding a
-- stolen password could mint a session straight from GoTrue's REST API
-- and read gated tables over PostgREST, never meeting an app-layer OTP
-- screen. This table records the session_id of every session that
-- completed the full sign-in (password + emailed code, a trusted device,
-- or Google OAuth). A follow-up migration (0063) makes has_app() and
-- is_admin() require the caller's JWT session_id to appear here, closing
-- the direct-API bypass for every gated policy at once — the same lever
-- 0032 used for deactivation.
--
-- Rows are written ONLY by the server through the service-role client,
-- after the OTP or OAuth step succeeds. There is deliberately no RLS
-- write path and no self-service marking function: a definer function
-- callable by `authenticated` would let the very session being screened
-- mark itself verified. has_app()/is_admin() are security definer owned
-- by postgres, so they read this table without needing any policy.
--
-- Rows older than 30 days are deleted opportunistically by the app on
-- each successful verification, which doubles as a maximum session age.
--
-- Safe to run twice: everything is `if not exists` / idempotent revokes.

create table if not exists login_attempts (
  -- Lowercased email being guessed at.
  target text not null,
  -- Which step of the flow failed: 'password', 'otp' or 'reset'.
  kind text not null check (kind in ('password', 'otp', 'reset')),
  failed_count int not null default 0,
  window_started_at timestamptz not null default now(),
  locked_until timestamptz,
  primary key (target, kind)
);

create table if not exists auth_verified_sessions (
  -- The session_id claim GoTrue stamps into every access token. Stable
  -- across token refreshes for the life of the session.
  session_id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- How the session earned its place: 'otp' (password + emailed code),
  -- 'trusted' (password on a remembered device), 'oauth' (Google).
  method text not null check (method in ('otp', 'trusted', 'oauth')),
  created_at timestamptz not null default now()
);

-- For the opportunistic age-based cleanup, and the FK's cascade path.
create index if not exists auth_verified_sessions_created_at_idx
  on auth_verified_sessions (created_at);
create index if not exists auth_verified_sessions_user_id_idx
  on auth_verified_sessions (user_id);

-- Deny-all: RLS on, no policies. The only ways in are the service-role
-- client (bypasses RLS) and the postgres-owned definer functions.
alter table login_attempts enable row level security;
alter table auth_verified_sessions enable row level security;

-- The 0059 rule, applied at birth: Supabase's default privileges grant
-- INSERT/UPDATE/DELETE/TRUNCATE (and SELECT) on every new relation to
-- anon and authenticated, and `revoke ... from public` does not touch
-- either — they must be named. RLS already denies these roles, but a
-- privilege nobody holds cannot be resurrected by a careless policy.
revoke all on login_attempts from public, anon, authenticated;
revoke all on auth_verified_sessions from public, anon, authenticated;

-- Assert it took. Fails loudly rather than reporting success on a
-- half-applied change.
do $$
declare
  v_rls_off int;
  v_grants int;
begin
  select count(*) into v_rls_off
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in ('login_attempts', 'auth_verified_sessions')
    and not c.relrowsecurity;
  if v_rls_off <> 0 then
    raise exception '0062: RLS is off on % of the two auth tables', v_rls_off;
  end if;

  select count(*) into v_grants
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name in ('login_attempts', 'auth_verified_sessions')
    and grantee in ('public', 'anon', 'authenticated');
  if v_grants <> 0 then
    raise exception '0062: % privileges still granted on the auth tables', v_grants;
  end if;

  if (select count(*) from pg_policies
      where schemaname = 'public'
        and tablename in ('login_attempts', 'auth_verified_sessions')) <> 0 then
    raise exception '0062: the auth tables must have zero policies (deny-all)';
  end if;
end $$;
