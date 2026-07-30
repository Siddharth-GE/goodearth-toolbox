-- Profiles: one row per staff user, extends auth.users with role/team
-- used to drive sidebar visibility and access control across tools.

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  role text not null default 'staff' check (role in ('admin', 'staff')),
  team text,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

-- Internal tool, ~200 users: any signed-in staff member can see the
-- directory (needed for sidebar/team checks); only admins edit roles.
create policy "profiles are readable by authenticated users"
  on profiles for select
  to authenticated
  using (true);

create policy "users can update their own name"
  on profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Auto-create a profile row when a new auth user is created.
create function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
