-- 0114 — Teams: the headings in everyone's sidebar
--
-- FOUNDER, 2026-10-13: "lets categorise and on the left they must just
-- sit as a closed set, design, commercial, interiors etc and only when
-- opened will you see all the tool under it, in settings each tool can
-- get a team tag, and a place where you can make all the team tags so
-- that we can rearrange as needed".
--
--   * tool_teams — a heading and its place in the order. Read by every
--     signed-in person (the sidebar is everyone's, and a heading is no
--     secret); written by admins only, from Settings → Teams.
--   * tool_team_apps — the team each tool sits under. ONE team per tool:
--     `app` is the key. No CHECK against the known slugs, unlike
--     user_apps/role_apps — the Settings action checks lib/tools.ts, and a
--     row for a slug the registry no longer has is simply never shown, so
--     a new tool costs no third CHECK. Deleting a team CASCADES its rows
--     here and its tools fall back to "Other": these rows arrange a screen
--     and grant nothing, so nothing is lost.
--   * Seeded ONCE, only into an empty table, with the five headings
--     lib/tools.ts carried in code until now — nothing moves until the
--     founder rearranges, and a re-run never fights their arrangement.
--
-- Teams arrange; grants decide. Nothing here is read by has_app(), a
-- policy or a view.
--
-- Re-runnable throughout.

-- ---------------------------------------------------------------------
-- 1. tool_teams
-- ---------------------------------------------------------------------

create table if not exists tool_teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 40),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references profiles (id),
  updated_at timestamptz,
  updated_by uuid references profiles (id)
);

-- "Design" and "design" would be two indistinguishable headings.
create unique index if not exists tool_teams_name_key on tool_teams (lower(trim(name)));

-- ---------------------------------------------------------------------
-- 2. tool_team_apps — one team per tool
-- ---------------------------------------------------------------------

create table if not exists tool_team_apps (
  app text primary key check (app like '/%'),
  team_id uuid not null references tool_teams (id) on delete cascade,
  -- Surrogate id for audit_row(), the 0018 convention.
  id uuid not null default gen_random_uuid(),
  updated_at timestamptz,
  updated_by uuid references profiles (id)
);
create unique index if not exists tool_team_apps_id_key on tool_team_apps (id);
create index if not exists tool_team_apps_team_id_idx on tool_team_apps (team_id);

-- ---------------------------------------------------------------------
-- 3. RLS — everyone reads, admins write
-- ---------------------------------------------------------------------

alter table tool_teams enable row level security;
alter table tool_team_apps enable row level security;

drop policy if exists "tool_teams readable by authenticated users" on tool_teams;
create policy "tool_teams readable by authenticated users"
  on tool_teams for select to authenticated using (true);
drop policy if exists "tool_teams insertable by admins" on tool_teams;
create policy "tool_teams insertable by admins"
  on tool_teams for insert to authenticated with check (is_admin());
drop policy if exists "tool_teams updatable by admins" on tool_teams;
create policy "tool_teams updatable by admins"
  on tool_teams for update to authenticated using (is_admin()) with check (is_admin());
drop policy if exists "tool_teams deletable by admins" on tool_teams;
create policy "tool_teams deletable by admins"
  on tool_teams for delete to authenticated using (is_admin());

drop policy if exists "tool_team_apps readable by authenticated users" on tool_team_apps;
create policy "tool_team_apps readable by authenticated users"
  on tool_team_apps for select to authenticated using (true);
drop policy if exists "tool_team_apps insertable by admins" on tool_team_apps;
create policy "tool_team_apps insertable by admins"
  on tool_team_apps for insert to authenticated with check (is_admin());
drop policy if exists "tool_team_apps updatable by admins" on tool_team_apps;
create policy "tool_team_apps updatable by admins"
  on tool_team_apps for update to authenticated using (is_admin()) with check (is_admin());
drop policy if exists "tool_team_apps deletable by admins" on tool_team_apps;
create policy "tool_team_apps deletable by admins"
  on tool_team_apps for delete to authenticated using (is_admin());

drop trigger if exists set_updated_at on tool_teams;
create trigger set_updated_at before update on tool_teams
  for each row execute function set_updated_at();
drop trigger if exists set_updated_at on tool_team_apps;
create trigger set_updated_at before update on tool_team_apps
  for each row execute function set_updated_at();

drop trigger if exists audit_tool_teams on tool_teams;
create trigger audit_tool_teams after insert or update or delete on tool_teams
  for each row execute function audit_row();
drop trigger if exists audit_tool_team_apps on tool_team_apps;
create trigger audit_tool_team_apps after insert or update or delete on tool_team_apps
  for each row execute function audit_row();

-- ---------------------------------------------------------------------
-- 4. The starting arrangement — today's headings, once
-- ---------------------------------------------------------------------

do $$
begin
  if exists (select 1 from tool_teams) then
    return;
  end if;

  insert into tool_teams (name, sort_order) values
    ('Management', 1), ('Operations', 2), ('Events', 3), ('People', 4), ('Admin', 5);

  insert into tool_team_apps (app, team_id)
  select seed.app, t.id
    from (values
      ('/relay', 'Management'), ('/design-management', 'Management'),
      ('/dexter', 'Management'), ('/reporter', 'Management'),
      ('/client-relations', 'Management'), ('/financial-management', 'Management'),
      ('/business-planning', 'Management'),
      ('/estimator', 'Operations'), ('/supervisors', 'Operations'),
      ('/selections', 'Operations'), ('/budgets', 'Operations'),
      ('/indents', 'Operations'), ('/purchase-orders', 'Operations'),
      ('/inventory', 'Operations'), ('/bills', 'Operations'),
      ('/marathon', 'Events'),
      ('/directory', 'People'), ('/training', 'People'),
      ('/masters', 'Admin'), ('/settings', 'Admin')
    ) as seed (app, team)
    join tool_teams t on t.name = seed.team
  on conflict (app) do nothing;
end $$;

-- ---------------------------------------------------------------------
-- 5. Prove it
-- ---------------------------------------------------------------------

do $$
declare
  t text;
  v int;
  op text;
begin
  foreach t in array array['tool_teams', 'tool_team_apps'] loop
    if not exists (select 1 from pg_class where relname = t and relrowsecurity) then
      raise exception '0114: % is missing or has RLS off', t;
    end if;
    select count(*) into v from pg_policies
      where schemaname = 'public' and tablename = t and cmd = 'SELECT';
    if v <> 1 then raise exception '0114: % has % SELECT policies, expected 1', t, v; end if;
    foreach op in array array['INSERT', 'UPDATE', 'DELETE'] loop
      select count(*) into v from pg_policies
        where schemaname = 'public' and tablename = t and cmd = op
          and coalesce(qual, '') || coalesce(with_check, '') like '%is_admin()%';
      if v <> 1 then raise exception '0114: % needs one admin-only % policy, has %', t, op, v; end if;
      if exists (select 1 from pg_policies
        where schemaname = 'public' and tablename = t and cmd = op
          and coalesce(qual, '') || coalesce(with_check, '') not like '%is_admin()%') then
        raise exception '0114: % has a % policy that is not admin-only', t, op;
      end if;
    end loop;
    if exists (select 1 from pg_policies
      where schemaname = 'public' and tablename = t and 'anon' = any(roles)) then
      raise exception '0114: % has a policy for anon', t;
    end if;
  end loop;

  if not exists (select 1 from tool_teams) then
    raise exception '0114: no teams — the starting arrangement did not land';
  end if;
end $$;
