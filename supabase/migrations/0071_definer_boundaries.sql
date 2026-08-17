-- 0071 — the definer functions get their permission boundaries back
--
-- WRITTEN BY THE AUDIT. Closes AUDIT.md SEC-02 (high), SEC-03 (medium) and
-- SEC-04 (low). All three are the same mistake in three sizes: a
-- SECURITY DEFINER function that bypasses RLS by design, reachable by
-- someone who should not reach it.
--
-- Additive and re-runnable: every statement is `create or replace` or a
-- revoke, and revoking a privilege that is not held is a no-op. It ends
-- asserting what it claimed.
--
-- ---------------------------------------------------------------------
-- THE TRAP THIS FILE WALKED INTO FIRST, written down so nobody repeats it
-- ---------------------------------------------------------------------
-- The audit's suggested fix for SEC-02 was "add `if not
-- has_app('/client-relations') then raise`, the trigger path runs as the
-- definer so it breaks nothing". That is WRONG, and it would have broken
-- adding a plot in Masters for everyone.
--
-- SECURITY DEFINER changes the Postgres ROLE the body runs as. It does
-- NOT change auth.uid(), which comes from the request's JWT and stays the
-- signed-in person for the whole call, however deep the nesting. has_app()
-- is built on auth.uid(). So a bare has_app('/client-relations') check
-- inside create_client_engagement is evaluated against the person who
-- inserted the unit — a /masters holder — and raises. That is exactly the
-- invisible failure 0050 made this function SECURITY DEFINER to avoid.
--
-- BUGCATCHER.md carries this; a green build and a green test suite say
-- nothing about it, because neither has a database.

-- ---------------------------------------------------------------------
-- 1. SEC-02 — create_client_engagement had no permission check at all
-- ---------------------------------------------------------------------
-- The hole: SECURITY DEFINER, EXECUTE granted to `authenticated` by
-- 0050:426, and a body that checked nothing. Any signed-in person — a
-- store-keeper holding only /inventory — could call it over the REST API
-- and write a client engagement plus a nine-rung payment schedule against
-- any plot id, into a tool they hold no grant for. Its two siblings,
-- crm_assign_unit and crm_release_unit, both check has_app in their
-- bodies. This one did not.
--
-- TWO GUARDS, because this sits on the database holding real client money
-- and either one alone has a way of going quiet.
--
-- GUARD 1 — nobody can call it. No TypeScript calls this function; its
-- only caller is the units_seed_engagement trigger below, which is itself
-- SECURITY DEFINER and therefore runs as the owner, who keeps EXECUTE.
-- So closing it to anon and authenticated removes a capability nothing
-- uses. If Client Relations ever needs to call it directly, re-granting
-- to authenticated is a deliberate one-line migration and guard 2 is
-- already there waiting.
--
-- GUARD 2 — a body check that survives guard 1 being undone by accident.
-- `drop function` restores Supabase's default privileges, exactly as
-- `drop view` does (0042's warning, re-learnt in 0064). A later migration
-- that drops and recreates this function would silently hand EXECUTE back
-- to anon and authenticated, and with only guard 1 the hole would be open
-- again with nothing saying so.
--
-- pg_trigger_depth() is how the body tells the two callers apart: it is
-- greater than zero inside anything reached from a trigger, and zero for
-- a direct REST call. So the trigger passes, a /client-relations holder
-- passes, and nobody else does. See the trap note above for why the
-- has_app test cannot stand alone.

create or replace function create_client_engagement(
  p_unit_id uuid,
  p_owner_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_engagement_id uuid;
  v_project_id uuid;
begin
  -- SECURITY DEFINER BYPASSES RLS, so this check plus the EXECUTE grant
  -- are the whole permission boundary. Trigger calls (Masters creating a
  -- unit) carry a depth above zero and are allowed through; a direct call
  -- needs the grant for the tool being written to.
  if pg_trigger_depth() = 0 and not has_app('/client-relations') then
    raise exception 'You need the Client Relations app to create an engagement';
  end if;

  select project_id into v_project_id from units where id = p_unit_id;
  if v_project_id is null then
    raise exception 'That plot no longer exists';
  end if;

  insert into client_engagements (unit_id, project_id, crm_owner_id, created_by, updated_by)
  values (p_unit_id, v_project_id, p_owner_id, auth.uid(), auth.uid())
  on conflict (unit_id) do nothing
  returning id into v_engagement_id;

  -- Already had one: hand back the existing id so the caller can carry on.
  if v_engagement_id is null then
    select id into v_engagement_id from client_engagements where unit_id = p_unit_id;
    return v_engagement_id;
  end if;

  insert into client_payment_milestones (engagement_id, stage, sort_order, created_by, updated_by)
  select v_engagement_id, s.stage, s.sort_order, auth.uid(), auth.uid()
  from (values
    ('plot',                10),
    ('booking',             20),
    ('foundation',          30),
    ('ground_floor_slab',   40),
    ('first_floor_slab',    50),
    ('internal_plastering', 60),
    ('floor_laying',        70),
    ('painting_polishing',  80),
    ('completed',           90)
  ) as s(stage, sort_order)
  on conflict (engagement_id, stage) do nothing;

  return v_engagement_id;
end $$;

revoke all on function create_client_engagement(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. SEC-03 — three definer functions the PUBLIC anon key could still call
-- ---------------------------------------------------------------------
-- `revoke execute ... from public` does not remove anon. Supabase's
-- default privileges grant EXECUTE to anon and authenticated by name, so
-- a revoke aimed at PUBLIC leaves both sitting there. 0023:331 and
-- 0045:147 both do exactly that and read as though they locked the
-- function down. The anon key is public by design — it ships in the
-- browser bundle — so an anonymous caller was reaching a function that
-- bypasses RLS.
--
-- stock_qty_on_hand   reads stock on hand. authenticated KEEPS it: the
--                     over-issue and over-receipt guards in 0023 call it
--                     as the invoker.
-- profile_is_active   answers a boolean about a uuid. Harmless in itself;
--                     revoked anyway, because "harmless" is a judgement
--                     that has to be re-made every time the body changes.
--                     authenticated keeps it (0033 calls it under
--                     auth.uid()).
-- seed_default_project_stages  WRITES eight rows. Closed to authenticated
--                     as well as anon, on the SEC-02 argument: no
--                     TypeScript calls it, and its only caller — the
--                     projects_seed_schedule trigger from 0045 — is
--                     SECURITY DEFINER and so runs as the owner.

revoke all on function stock_qty_on_hand(uuid, uuid) from public, anon;
revoke all on function profile_is_active(uuid) from public, anon;
revoke all on function seed_default_project_stages(uuid) from public, anon, authenticated;

-- Restated so this file is the whole picture rather than half of it.
-- Granting a privilege already held is a no-op.
grant execute on function stock_qty_on_hand(uuid, uuid) to authenticated;
grant execute on function profile_is_active(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 3. SEC-04 — the approval helpers answered about anybody
-- ---------------------------------------------------------------------
-- All three take a uuid and answer for that person: whether they may
-- approve, and in bill_approval_cap's case the rupee ceiling on their
-- approvals. `profiles` is readable by every authenticated user, so the
-- ids are trivially enumerable — one number per colleague, readable by
-- anyone signed in.
--
-- Verified before narrowing: every caller passes the CALLER'S OWN id.
-- lib/bills/queries.ts and lib/indents/queries.ts pass user.id, and
-- 0034's bills_guard, labour_contracts_guard and indents_guard all pass
-- auth.uid(). So self-or-admin breaks nothing.
--
-- `is not distinct from` rather than `=` so that a null uid and a null
-- auth.uid() — a service-role write, where no guard reaches these
-- anyway — behave as they did before rather than tripping the check.

create or replace function can_approve_indents(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- Ask about yourself, or be an admin. `false` is the right answer to a
  -- question the caller had no business asking (SEC-04).
  select (uid is not distinct from auth.uid() or is_admin())
     and exists (select 1 from profiles p where p.id = uid and p.is_active)
     and (
       exists (select 1 from indent_approvers a where a.user_id = uid)
       or exists (
         select 1 from profiles p join roles r on r.id = p.role_id
         where p.id = uid and r.can_approve_indents
       )
     )
$$;

create or replace function can_approve_bills(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (uid is not distinct from auth.uid() or is_admin())
     and exists (select 1 from profiles p where p.id = uid and p.is_active)
     and (
       exists (select 1 from bill_approvers a where a.user_id = uid)
       or exists (
         select 1 from profiles p join roles r on r.id = p.role_id
         where p.id = uid and r.can_approve_bills
       )
     )
$$;

-- The ceiling that applies to uid: null means unlimited. Returns null
-- when ANY source says unlimited, else the largest number offered.
create or replace function bill_approval_cap(uid uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_personal_row boolean := false;
  v_personal numeric;
  v_role_row boolean := false;
  v_role numeric;
begin
  -- RAISES rather than returning null, unlike its two siblings above.
  -- In this function null MEANS UNLIMITED, so a refusal that answered
  -- null would be read by the caller as "no ceiling at all" — the
  -- failure would be a permission check that widens a permission.
  if uid is distinct from auth.uid() and not is_admin() then
    raise exception 'You can only ask about your own approval limit';
  end if;

  select true, a.approval_limit into v_personal_row, v_personal
  from bill_approvers a where a.user_id = uid;

  select true, r.bill_approval_limit into v_role_row, v_role
  from profiles p join roles r on r.id = p.role_id
  where p.id = uid and r.can_approve_bills;

  -- Unlimited from either source wins outright.
  if (v_personal_row and v_personal is null) or (v_role_row and v_role is null) then
    return null;
  end if;
  return greatest(coalesce(v_personal, 0), coalesce(v_role, 0));
end $$;

-- The 0035 grants, restated. These three stay callable by authenticated —
-- narrowing WHO they answer about is the fix, not closing them.
revoke all on function can_approve_indents(uuid) from public, anon;
revoke all on function can_approve_bills(uuid) from public, anon;
revoke all on function bill_approval_cap(uuid) from public, anon;
grant execute on function can_approve_indents(uuid) to authenticated;
grant execute on function can_approve_bills(uuid) to authenticated;
grant execute on function bill_approval_cap(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Assert it took
-- ---------------------------------------------------------------------
-- Fails loudly rather than reporting success on a half-applied change.
-- has_function_privilege is used instead of reading proacl directly
-- because it accounts for a privilege held through PUBLIC, which is the
-- exact thing 0023 and 0045 missed.

do $assert$
declare
  v_oid oid;
  v_src text;
  v_role text;
  v_name text;
begin
  -- 4a. The two functions no client role may call.
  foreach v_role in array array['anon', 'authenticated']
  loop
    select oid into v_oid from pg_proc
    where proname = 'create_client_engagement' and pronamespace = 'public'::regnamespace;
    if has_function_privilege(v_role, v_oid, 'EXECUTE') then
      raise exception '0071: % can still execute create_client_engagement', v_role;
    end if;

    select oid into v_oid from pg_proc
    where proname = 'seed_default_project_stages' and pronamespace = 'public'::regnamespace;
    if has_function_privilege(v_role, v_oid, 'EXECUTE') then
      raise exception '0071: % can still execute seed_default_project_stages', v_role;
    end if;
  end loop;

  -- 4b. The two anon must not reach, and authenticated must keep.
  select oid into v_oid from pg_proc
  where proname = 'stock_qty_on_hand' and pronamespace = 'public'::regnamespace;
  if has_function_privilege('anon', v_oid, 'EXECUTE') then
    raise exception '0071: anon can still execute stock_qty_on_hand';
  end if;
  if not has_function_privilege('authenticated', v_oid, 'EXECUTE') then
    raise exception '0071: authenticated lost stock_qty_on_hand — 0023''s guards need it';
  end if;

  select oid into v_oid from pg_proc
  where proname = 'profile_is_active' and pronamespace = 'public'::regnamespace;
  if has_function_privilege('anon', v_oid, 'EXECUTE') then
    raise exception '0071: anon can still execute profile_is_active';
  end if;
  if not has_function_privilege('authenticated', v_oid, 'EXECUTE') then
    raise exception '0071: authenticated lost profile_is_active — 0033''s policies need it';
  end if;

  -- 4c. Guard 2 is in the body, and the trigger exemption with it.
  select prosrc into v_src from pg_proc
  where proname = 'create_client_engagement' and pronamespace = 'public'::regnamespace;
  if v_src not like '%has_app(''/client-relations'')%' then
    raise exception '0071: create_client_engagement lost its has_app check';
  end if;
  if v_src not like '%pg_trigger_depth()%' then
    raise exception '0071: create_client_engagement lost the trigger exemption — Masters cannot create a unit';
  end if;

  -- 4d. The trigger that depends on the exemption still exists.
  if not exists (
    select 1 from pg_trigger where tgname = 'units_seed_engagement' and not tgisinternal
  ) then
    raise exception '0071: the units_seed_engagement trigger is gone';
  end if;

  -- 4e. The three approval helpers answer about the caller only.
  foreach v_name in array array['can_approve_indents', 'can_approve_bills', 'bill_approval_cap']
  loop
    select prosrc into v_src from pg_proc
    where proname = v_name and pronamespace = 'public'::regnamespace;
    if v_src not like '%auth.uid()%' then
      raise exception '0071: %() no longer narrows to the caller', v_name;
    end if;
  end loop;
end $assert$;
