-- People can be invited and deactivated, and the last admin is protected.
--
-- Until now an account existed the moment someone created it in the
-- Supabase dashboard, and there was no way to switch one off: a person
-- who left kept working credentials, and their grants had to be
-- unticked one at a time. Deactivation is a flag, never a deletion —
-- their name still resolves on every document they touched, and
-- reactivating is one click.
--
-- Three protections, all enforced here rather than in the app:
--   1. is_admin() and has_app() answer false for a deactivated person,
--      so every RLS policy in the schema (~80 references) closes at once.
--   2. profiles_guard() extends its role rule to is_active, and refuses
--      to remove the last active admin — from a browser. Studio and the
--      service role stay the break-glass path, exactly as 0014 reasoned.
--   3. The login action signs a deactivated person straight back out.
--
-- NOT here, deliberately: the approver-list checks inside indents_guard
-- and bills_guard still don't test is_active, so a deactivated approver
-- with a live JWT could in principle approve by raw PATCH until it
-- expires (~1h). Both guards are rewritten in full by 0033 and 0034,
-- and the conjunct lands there rather than rewriting them twice.
--
-- Re-runnable: `if not exists` / `create or replace` throughout.

-- ---------------------------------------------------------------------
-- 1. The flag
-- ---------------------------------------------------------------------
-- Defaults true, so every existing account keeps working untouched.
alter table profiles add column if not exists is_active boolean not null default true;

-- ---------------------------------------------------------------------
-- 2. The two helpers every policy rides on
-- ---------------------------------------------------------------------
-- Narrowing only: an active user's answer is unchanged, a deactivated
-- one now fails closed. Both keep security definer / stable / pinned
-- search_path — the 0013 §3 lesson.
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
  )
$$;

create or replace function has_app(slug text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles p where p.id = auth.uid() and p.is_active
  ) and (
    is_admin() or exists (
      select 1 from user_apps ua where ua.user_id = auth.uid() and ua.app = slug
    )
  )
$$;

-- Used by the guards from 0033 on, and by profiles_guard below.
create or replace function profile_is_active(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from profiles p where p.id = uid and p.is_active)
$$;

-- ---------------------------------------------------------------------
-- 3. The guard: who may deactivate, and who may never be deactivated
-- ---------------------------------------------------------------------
-- Extends 0013/0014's role rule to is_active, and adds the rule that
-- makes the in-app admin switch safe to hand over: the company can
-- never be left with no active admin. Checked only when a signed-in
-- user is making the change, so Studio keeps its recovery path.
create or replace function profiles_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  active_admins int;
begin
  if new.role is distinct from old.role
     and auth.uid() is not null
     and not is_admin() then
    raise exception 'Only an admin can change a role';
  end if;

  if new.is_active is distinct from old.is_active
     and auth.uid() is not null
     and not is_admin() then
    raise exception 'Only an admin can activate or deactivate an account';
  end if;

  -- Losing the last admin locks everyone out of Settings permanently,
  -- so both routes to it are refused: demotion and deactivation.
  if auth.uid() is not null
     and old.role = 'admin' and old.is_active
     and (new.role is distinct from 'admin' or not new.is_active) then
    select count(*) into active_admins
    from profiles p
    where p.role = 'admin' and p.is_active and p.id <> old.id;

    if active_admins = 0 then
      raise exception 'This is the last active admin — appoint another admin first';
    end if;
  end if;

  return new;
end $$;

drop trigger if exists profiles_guard on profiles;
create trigger profiles_guard
  before update on profiles
  for each row execute function profiles_guard();

-- ---------------------------------------------------------------------
-- 4. admin_list_users() carries the flag
-- ---------------------------------------------------------------------
-- Return-type change, so drop and recreate rather than replace.
drop function if exists admin_list_users();

create function admin_list_users()
returns table (
  id uuid,
  email text,
  full_name text,
  role text,
  team text,
  is_active boolean
)
language sql
security definer
set search_path = public
as $$
  select p.id, u.email::text, p.full_name, p.role, p.team, p.is_active
  from profiles p
  join auth.users u on u.id = p.id
  where is_admin()
  order by p.full_name nulls last, u.email
$$;

revoke all on function admin_list_users() from public, anon;
grant execute on function admin_list_users() to authenticated;
