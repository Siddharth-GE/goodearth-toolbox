-- Marathon: runner registration for Peravoor Marathon 2026.
-- No Supabase Auth session exists for this tool (field agents and admin
-- use their own PIN-based kiosk login, verified by the app server). RLS
-- is enabled with NO policies below, so anon/authenticated can't read or
-- write any of this through the public API — only the app's server-side
-- service-role client can, from lib/supabase/admin.ts.

create table marathon_config (
  id boolean primary key default true,
  event_name text not null default 'Peravoor Marathon 2026',
  admin_pin_hash text not null,
  admin_pin_salt text not null,
  updated_at timestamptz not null default now(),
  constraint marathon_config_singleton check (id)
);

create table marathon_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table marathon_agents (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  pin_hash text not null,
  pin_salt text not null,
  created_at timestamptz not null default now()
);

create table marathon_runs (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  distance_km numeric(4, 1),
  sort_order int not null default 0
);

create table marathon_categories (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references marathon_runs (id) on delete cascade,
  name text not null,
  gender text check (gender in ('male', 'female')),
  min_age int,
  max_age int,
  bib_prefix text not null unique,
  color text not null,
  next_sequence int not null default 1,
  unique (run_id, name)
);

create table marathon_entries (
  id uuid primary key default gen_random_uuid(),
  bib text not null unique,
  run_id uuid not null references marathon_runs (id),
  category_id uuid not null references marathon_categories (id),
  group_id uuid not null references marathon_groups (id),
  agent_id uuid not null references marathon_agents (id),
  name text not null,
  mobile text not null check (mobile ~ '^[0-9]{10}$'),
  age int not null check (age between 3 and 99),
  gender text not null check (gender in ('male', 'female')),
  tee_size text not null check (tee_size in ('XS', 'S', 'M', 'L', 'XL', 'XXL')),
  created_at timestamptz not null default now()
);

create index on marathon_entries (agent_id);
create index on marathon_entries (group_id);
create index on marathon_entries (run_id);
create index on marathon_entries (category_id);
create index on marathon_entries (mobile);
create index on marathon_entries (created_at);

alter table marathon_config enable row level security;
alter table marathon_groups enable row level security;
alter table marathon_agents enable row level security;
alter table marathon_runs enable row level security;
alter table marathon_categories enable row level security;
alter table marathon_entries enable row level security;

-- Assigns the bib number atomically: locks the matching category row so
-- two agents saving at the same instant can never get the same sequence
-- number, and re-derives the category from age/gender/run itself so a
-- caller can't pass an arbitrary category_id or bib. Assumes category
-- age/gender ranges don't overlap within a run (true for the seed data).
create function marathon_create_entry(
  p_run_id uuid,
  p_group_id uuid,
  p_agent_id uuid,
  p_name text,
  p_mobile text,
  p_age int,
  p_gender text,
  p_tee_size text
)
returns marathon_entries
language plpgsql
as $$
declare
  v_category marathon_categories%rowtype;
  v_seq int;
  v_bib text;
  v_entry marathon_entries%rowtype;
begin
  select * into v_category
  from marathon_categories
  where run_id = p_run_id
    and (gender is null or gender = p_gender)
    and (min_age is null or p_age >= min_age)
    and (max_age is null or p_age <= max_age)
  for update
  limit 1;

  if not found then
    raise exception 'No matching category for run %, age %, gender %', p_run_id, p_age, p_gender;
  end if;

  v_seq := v_category.next_sequence;
  update marathon_categories set next_sequence = next_sequence + 1 where id = v_category.id;

  v_bib := v_category.bib_prefix || lpad(v_seq::text, 4, '0');

  insert into marathon_entries (bib, run_id, category_id, group_id, agent_id, name, mobile, age, gender, tee_size)
  values (v_bib, p_run_id, v_category.id, p_group_id, p_agent_id, p_name, p_mobile, p_age, p_gender, p_tee_size)
  returning * into v_entry;

  return v_entry;
end;
$$;

-- Defense in depth: even though this function is SECURITY INVOKER (the
-- default, so its internal statements would still hit RLS's deny-all if
-- called as anon/authenticated), explicitly block anon/authenticated from
-- calling it at all, and only allow the server's service-role client.
revoke execute on function marathon_create_entry(uuid, uuid, uuid, text, text, int, text, text) from public;
grant execute on function marathon_create_entry(uuid, uuid, uuid, text, text, int, text, text) to service_role;

-- Seed data --------------------------------------------------------------

insert into marathon_groups (name) values ('Open / Public');

insert into marathon_runs (id, name, distance_km, sort_order) values
  ('11111111-1111-1111-1111-111111111111', '3.5 K Fun Run', 3.5, 1),
  ('22222222-2222-2222-2222-222222222222', '10.5 K Quarter Marathon', 10.5, 2);

insert into marathon_categories (run_id, name, gender, min_age, max_age, bib_prefix, color) values
  ('11111111-1111-1111-1111-111111111111', 'Open',  null,     null, null, 'F', 'green'),
  ('22222222-2222-2222-2222-222222222222', 'Boys',  'male',   null, 17,   'B', 'blue'),
  ('22222222-2222-2222-2222-222222222222', 'Girls', 'female', null, 17,   'G', 'pink'),
  ('22222222-2222-2222-2222-222222222222', 'Men',   'male',   18,   59,   'M', 'indigo'),
  ('22222222-2222-2222-2222-222222222222', 'Women', 'female', 18,   59,   'W', 'purple'),
  ('22222222-2222-2222-2222-222222222222', 'King',  'male',   60,   null, 'K', 'orange'),
  ('22222222-2222-2222-2222-222222222222', 'Queen', 'female', 60,   null, 'Q', 'teal');

-- Shared admin PIN, defaults to 2026 (matches the approved mockup).
-- Change it later with:
--   update marathon_config set admin_pin_hash = '...', admin_pin_salt = '...';
-- (the app computes the hash/salt pair — see lib/marathon/session.ts)
insert into marathon_config (admin_pin_hash, admin_pin_salt) values (
  '347e4411369d91148e6a172229ea004dd4ea122ba2ccc7d160549fb4f469fa7ae7ce0968bc4ebcde5bf35176d6a587b95ac0be10ad9fb00add7cadaa7ae5eae5',
  'f002183c8d7504e6feb2195a963e5dd5'
);

-- One test agent (PIN 1234) so the PIN-login and entry-form screens can be
-- tried out before the admin "add member" screen ships. Delete this row
-- once real field agents are added.
insert into marathon_agents (name, pin_hash, pin_salt) values (
  'Test Agent',
  'ff8557f0e168aa676a95c229af658b0be23166a92d3eab5d3d7fdf810565b269bfb1ff68e9cadd7eb7923bafe521884beb9648cc5b86b24c53bc4d004b075c1b',
  'b3007868baf0f55250ff32d938b1c2d6'
);
