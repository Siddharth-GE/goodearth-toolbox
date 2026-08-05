-- Close the three new helpers to anon.
--
-- 0034 added can_approve_indents(uuid), can_approve_bills(uuid) and
-- bill_approval_cap(uuid). Postgres grants EXECUTE on a new function to
-- PUBLIC by default, so anon — the key that ships in every browser —
-- could ask "is this person a bill approver, and up to how much" for any
-- user id it could name. The approver tables themselves are readable by
-- `authenticated` only, so this was a small new leak rather than an
-- existing one restated.
--
-- Deliberately NOT touching has_app() or is_admin(): they take no user
-- id and read auth.uid(), so anon already gets false from them, and they
-- are load-bearing for ~80 policies — narrowing them is a bigger change
-- than this migration is for.
--
-- No behaviour change for the app: every caller is a signed-in user or
-- a trigger, and a trigger runs as the definer regardless of these
-- grants. Re-runnable.

revoke all on function can_approve_indents(uuid) from public, anon;
revoke all on function can_approve_bills(uuid) from public, anon;
revoke all on function bill_approval_cap(uuid) from public, anon;

grant execute on function can_approve_indents(uuid) to authenticated;
grant execute on function can_approve_bills(uuid) to authenticated;
grant execute on function bill_approval_cap(uuid) to authenticated;
