-- Per-user app grants: a staff user's access = exactly the rows here.
-- Admins implicitly have every app (checked in code, not this table).
-- profiles.team is kept as-is (additive-only rule) but is no longer
-- read for access control — see lib/tools.ts.

create table user_apps (
  user_id uuid not null references profiles (id) on delete cascade,
  app text not null,
  granted_at timestamptz not null default now(),
  primary key (user_id, app)
);

alter table user_apps enable row level security;

create policy "user_apps readable by owner"
  on user_apps for select
  to authenticated
  using (auth.uid() = user_id);

create policy "user_apps readable by admins"
  on user_apps for select
  to authenticated
  using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create policy "admins can grant app access"
  on user_apps for insert
  to authenticated
  with check (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create policy "admins can revoke app access"
  on user_apps for delete
  to authenticated
  using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- Admin-only read of auth.users' email, joined with profiles, for the
-- Settings screen. There's no RLS path to auth.users at all for anon/
-- authenticated roles, so this security-definer function (rather than
-- the service-role client) is the narrow, DB-enforced way to expose
-- just id/email/full_name/role/team to admins, via the normal
-- RLS-scoped server client.
create function admin_list_users()
returns table (id uuid, email text, full_name text, role text, team text)
language sql
security definer
set search_path = public
as $$
  select p.id, u.email, p.full_name, p.role, p.team
  from profiles p
  join auth.users u on u.id = p.id
  where exists (select 1 from profiles me where me.id = auth.uid() and me.role = 'admin')
$$;

revoke execute on function admin_list_users() from public;
grant execute on function admin_list_users() to authenticated;
