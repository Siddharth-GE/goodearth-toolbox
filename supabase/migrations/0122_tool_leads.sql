-- 0122 — Team leads: who sees everyone's work in a tool whose work is assigned
--
-- FOUNDER, 2026-10-17: "in crm, and maybe other apps, there needs to be a
-- assignment based visibility, so that only those who are assigned a task
-- or own a deal get to see the work except for admins ... can we do that
-- for apps we decide that need that feature?" Asked who else sees
-- everything: "admin and team lead".
--
-- THIS FILE IS THE SHARED HALF, built once. It says only who sees
-- everything in a tool; what "assigned to you" means is each tool's own,
-- written by that tool's migration when it is switched on (0123 for
-- Client Relations). lib/tools.ts marks those tools `scoped`.
--
--   * tool_leads — (person, tool) pairs, ticked by an admin in Settings
--     beside the person's grant. No CHECK on the slug, for 0114's reason:
--     the Settings action checks lib/tools.ts, and a row for a tool that is
--     not scoped is read by no policy, so it does nothing.
--   * is_lead(slug) — an admin, or someone who holds the grant AND has a
--     lead row. Built from has_app() and is_admin(), never redefining
--     either, so it carries session_is_verified() and is_active forward
--     (SECURITY.md). A lead row without the grant does nothing.
--
-- A person reads their own rows (a screen asks "am I a lead here?"
-- through is_lead()); admins read and write everyone's. No update policy:
-- a row is ticked or it is not.
--
-- Re-runnable throughout.

-- ---------------------------------------------------------------------
-- 1. tool_leads
-- ---------------------------------------------------------------------
-- No created_by: a second foreign key to profiles would make an embed of
-- tool_leads through profiles ambiguous (BUGCATCHER #2). audit_row()
-- records who ticked it.

create table if not exists tool_leads (
  user_id uuid not null references profiles (id) on delete cascade,
  app text not null check (app like '/%'),
  -- Surrogate id for audit_row(), the 0018 convention.
  id uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  primary key (user_id, app)
);
create unique index if not exists tool_leads_id_key on tool_leads (id);

alter table tool_leads enable row level security;

drop policy if exists "tool_leads readable by their person and admins" on tool_leads;
create policy "tool_leads readable by their person and admins"
  on tool_leads for select to authenticated
  using (user_id = auth.uid() or is_admin());

drop policy if exists "tool_leads insertable by admins" on tool_leads;
create policy "tool_leads insertable by admins"
  on tool_leads for insert to authenticated with check (is_admin());

drop policy if exists "tool_leads deletable by admins" on tool_leads;
create policy "tool_leads deletable by admins"
  on tool_leads for delete to authenticated using (is_admin());

drop trigger if exists audit_tool_leads on tool_leads;
create trigger audit_tool_leads after insert or update or delete on tool_leads
  for each row execute function audit_row();

-- ---------------------------------------------------------------------
-- 2. is_lead(slug)
-- ---------------------------------------------------------------------
-- SECURITY DEFINER like has_app(), so a policy on another table can ask it
-- without tool_leads' own policy in the way. Its boundary is its body: it
-- answers only about the caller, and only true through is_admin() or
-- has_app().

create or replace function is_lead(slug text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select is_admin() or (
    has_app(slug)
    and exists (
      select 1 from tool_leads l where l.user_id = auth.uid() and l.app = slug
    )
  )
$$;

revoke execute on function is_lead(text) from public, anon;
grant execute on function is_lead(text) to authenticated;

-- ---------------------------------------------------------------------
-- 3. Prove it
-- ---------------------------------------------------------------------

do $$
declare
  v int;
  op text;
  v_src text;
begin
  if not exists (select 1 from pg_class where relname = 'tool_leads' and relrowsecurity) then
    raise exception '0122: tool_leads is missing or has RLS off';
  end if;
  select count(*) into v from pg_policies
    where schemaname = 'public' and tablename = 'tool_leads' and cmd = 'SELECT';
  if v <> 1 then raise exception '0122: tool_leads has % SELECT policies, expected 1', v; end if;
  foreach op in array array['INSERT', 'DELETE'] loop
    if not exists (select 1 from pg_policies
      where schemaname = 'public' and tablename = 'tool_leads' and cmd = op
        and coalesce(qual, '') || coalesce(with_check, '') like '%is_admin()%') then
      raise exception '0122: tool_leads needs an admin-only % policy', op;
    end if;
    if exists (select 1 from pg_policies
      where schemaname = 'public' and tablename = 'tool_leads' and cmd = op
        and coalesce(qual, '') || coalesce(with_check, '') not like '%is_admin()%') then
      raise exception '0122: tool_leads has a % policy that is not admin-only', op;
    end if;
  end loop;
  if exists (select 1 from pg_policies
    where schemaname = 'public' and tablename = 'tool_leads' and cmd in ('UPDATE', 'ALL')) then
    raise exception '0122: tool_leads must have no update policy';
  end if;
  if exists (select 1 from pg_policies
    where schemaname = 'public' and tablename = 'tool_leads' and 'anon' = any(roles)) then
    raise exception '0122: tool_leads has a policy for anon';
  end if;

  select prosrc into v_src from pg_proc
    where proname = 'is_lead' and pronamespace = 'public'::regnamespace;
  if v_src not like '%is_admin()%' or v_src not like '%has_app(slug)%' then
    raise exception '0122: is_lead() must answer through is_admin() and has_app()';
  end if;
  if has_function_privilege('anon', 'is_lead(text)', 'execute')
     or not has_function_privilege('authenticated', 'is_lead(text)', 'execute') then
    raise exception '0122: is_lead() privileges are wrong';
  end if;
end $$;
