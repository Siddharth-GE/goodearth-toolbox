-- 0063 — a session that skipped the code step reaches nothing gated
--
-- ** WRITTEN WITH THE 2FA BUILD; APPLY AT LAUNCH, AFTER the two-step   **
-- ** login is deployed and a real sign-in has been seen to work.       **
-- ** Applying it forces every existing session through the new flow    **
-- ** once — tell the staff before, not after.                          **
--
-- Why the app layer alone is not enough
-- -------------------------------------
-- The anon key is public by design, so anyone holding a stolen password
-- can mint a session straight from the auth API and query PostgREST
-- directly, never meeting the app's code screen. Supabase Auth has no
-- native email MFA factor, so there is no aal2 claim to lean on. What
-- the server CAN do is record which sessions completed the full sign-in
-- — password + emailed code, a remembered device, or Google — in
-- auth_verified_sessions (0062), written only via the service role.
--
-- This migration makes is_admin() and has_app() require that row. Same
-- lever 0032 pulled for deactivation: ~80 policies across every tool
-- learn the rule at once, with zero policy edits. A session minted
-- around the app holds a real JWT and still reads nothing gated and
-- writes nothing anywhere.
--
-- What deliberately still works without the row
-- ---------------------------------------------
-- Plain `to authenticated ... using (true)` reads — masters lists,
-- profiles, roles — the same accepted gap deactivation has (0032), for
-- the same reason: those tables' policies never call has_app(). The
-- boundary that matters (every tool, every write, every rupee) is
-- has_app()/is_admin(), and that is what closes.
--
-- Who is exempt, and why that is safe
-- -----------------------------------
--   * No JWT at all (Studio, the management API, owner contexts):
--     unchanged — auth.uid() is already null there and both functions
--     already answer false for user questions; profiles_guard keeps its
--     Studio break-glass.
--   * A JWT without a session_id claim (service role): unchanged. The
--     service role bypasses RLS anyway; it never asks these functions.
--   * definer functions and triggers running under a user's request
--     inherit the user's claims — a verified user passes, a smuggled
--     session fails. Which is the point.
--
-- Safe to run twice: create or replace throughout, assertions at the end.

-- The one question, asked once: does the current request's session
-- appear in auth_verified_sessions? SECURITY DEFINER because the table
-- is deny-all (0062) — this function is the only read path.
-- The text comparison (not a uuid cast) is deliberate: a JWT is
-- attacker-supplied input, and a junk session_id must answer false, not
-- abort the query with a cast error. The table stays small (one row per
-- live session, swept at 30 days), so the untyped compare costs nothing.
create or replace function session_is_verified()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when auth.jwt() is null then true
    when coalesce(auth.jwt()->>'session_id', '') = '' then true
    else exists (
      select 1 from auth_verified_sessions v
      where v.session_id::text = auth.jwt()->>'session_id'
    )
  end
$$;

revoke execute on function session_is_verified() from public, anon;
grant execute on function session_is_verified() to authenticated;

-- is_admin: the 0032 definition, and the session must be verified.
create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles p
    where p.id = auth.uid() and p.role = 'admin' and p.is_active
  ) and session_is_verified()
$$;

-- has_app: the 0034 definition (personal grants ∪ role bundle), and the
-- session must be verified.
create or replace function has_app(slug text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles p where p.id = auth.uid() and p.is_active
  ) and session_is_verified() and (
    is_admin()
    or exists (
      select 1 from user_apps ua where ua.user_id = auth.uid() and ua.app = slug
    )
    or exists (
      select 1
      from profiles p
      join role_apps ra on ra.role_id = p.role_id
      where p.id = auth.uid() and ra.app = slug
    )
  )
$$;

-- Assert it took: all three bodies mention the verified check, and the
-- helper is not executable anonymously.
do $$
declare
  v_src text;
begin
  select prosrc into v_src from pg_proc
  where proname = 'is_admin' and pronamespace = 'public'::regnamespace;
  if v_src not like '%session_is_verified()%' then
    raise exception '0063: is_admin() does not check session_is_verified()';
  end if;

  select prosrc into v_src from pg_proc
  where proname = 'has_app' and pronamespace = 'public'::regnamespace;
  if v_src not like '%session_is_verified()%' then
    raise exception '0063: has_app() does not check session_is_verified()';
  end if;

  if exists (
    select 1 from pg_proc p
    where p.proname = 'session_is_verified'
      and p.pronamespace = 'public'::regnamespace
      and (
        has_function_privilege('anon', p.oid, 'execute')
        or not has_function_privilege('authenticated', p.oid, 'execute')
      )
  ) then
    raise exception '0063: session_is_verified() privileges are wrong';
  end if;
end $$;
