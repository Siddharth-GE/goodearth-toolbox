-- 0038 — Pusher: departments, and a trail can be in more than one.
--
-- Founder, 2026-08-10: "each trail needs to be divided by department
-- like design, site, etc" and "a trail can be cross department as well".
--
-- The second half is the load-bearing half. A selections handoff runs
-- through Design AND Purchase; a site handover through Site AND Client
-- Relations. So this is a many-to-many join, not a column on the chain.
-- A single department_id would have forced a lie on exactly the trails
-- that cross a boundary — which are the ones worth watching.
--
-- NOT profiles.team. That column exists (0001), is free text, is null on
-- every row, and describes which team a PERSON sits in. A department
-- here describes what kind of work a TRAIL is, and a Design person
-- routinely carries a leg of a Site trail. Two different questions; do
-- not merge them.
--
-- Kept inside Pusher rather than lib/masters/ because Pusher is the only
-- consumer today, and this repo's rule is to build the third copy into a
-- shared component, not the first. Promoting it later is one migration:
-- the table moves, the join table does not change.
--
-- Departments are picked when a trail opens, PREFILLED FROM THAT
-- ACTIVITY'S LAST RUN exactly the way legs are — so opening a repeat
-- stays a thirty-second job, which is the whole point of the prefill.
--
-- Re-runnable throughout.

-- ---------------------------------------------------------------------
-- 1. pusher_departments — the master
-- ---------------------------------------------------------------------
-- Same shape and same rules as pusher_activities (0036 §3): unique on
-- lower(name) so "Site" and "site" cannot split the list in two, and an
-- off-switch rather than a delete, because a finished trail's
-- departments have to stay readable forever.

create table if not exists pusher_departments (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists pusher_departments_name_key
  on pusher_departments (lower(name));
create index if not exists pusher_departments_active_idx
  on pusher_departments (sort_order, name) where is_active;

-- ---------------------------------------------------------------------
-- 2. pusher_chain_departments — the join
-- ---------------------------------------------------------------------
-- Carries its own id purely so audit_row() applies (the 0018/0031
-- lesson: a table without an `id` raises inside the audit trigger at
-- runtime). No `on delete cascade` from pusher_chains, matching every
-- other child in 0036 — chains are never deleted anyway.

create table if not exists pusher_chain_departments (
  id uuid primary key default gen_random_uuid(),
  chain_id uuid not null references pusher_chains (id),
  department_id uuid not null references pusher_departments (id),
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  unique (chain_id, department_id)
);

create index if not exists pusher_chain_departments_chain_idx
  on pusher_chain_departments (chain_id);
create index if not exists pusher_chain_departments_dept_idx
  on pusher_chain_departments (department_id);

-- ---------------------------------------------------------------------
-- 3. A finished trail's departments are history
-- ---------------------------------------------------------------------
-- While a trail is running its departments are freely editable — someone
-- realises halfway that Purchase is involved after all, and that is a
-- correction, not a rewrite. Once it is finished they freeze, because at
-- that point changing them silently rewrites what every past report
-- said. Same instinct as the legs guard (0036 §9), which is why it reads
-- the same way: one lookup of the chain's last event.

create or replace function pusher_chain_departments_guard()
returns trigger
language plpgsql
as $$
declare
  v_chain uuid;
  v_last_kind text;
begin
  if tg_op = 'DELETE' then
    v_chain := old.chain_id;
  else
    v_chain := new.chain_id;
  end if;

  select kind into v_last_kind
  from pusher_chain_events
  where chain_id = v_chain
  order by seq desc
  limit 1;

  if v_last_kind = 'completed' then
    raise exception 'This trail is finished — its departments are history now';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end $$;

drop trigger if exists pusher_chain_departments_guard on pusher_chain_departments;
create trigger pusher_chain_departments_guard
  before insert or update or delete on pusher_chain_departments
  for each row execute function pusher_chain_departments_guard();

-- ---------------------------------------------------------------------
-- 4. set_chain_departments() — replace the whole set in one go
-- ---------------------------------------------------------------------
-- The UI edits departments as a set of chips, so the write is "these are
-- the departments now", not a series of adds and removes. Doing it in
-- one function keeps a half-applied set impossible, and means the screen
-- never has to work out the difference.

create or replace function set_chain_departments(p_chain_id uuid, p_department_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_chain_id::text, 0));

  delete from pusher_chain_departments
  where chain_id = p_chain_id
    and (p_department_ids is null or department_id <> all (p_department_ids));

  if p_department_ids is not null then
    insert into pusher_chain_departments (chain_id, department_id, created_by)
    select p_chain_id, d, auth.uid()
    from unnest(p_department_ids) as d
    on conflict (chain_id, department_id) do nothing;
  end if;
end $$;

revoke execute on function set_chain_departments(uuid, uuid[]) from public;
grant execute on function set_chain_departments(uuid, uuid[]) to authenticated;

-- ---------------------------------------------------------------------
-- 5. pusher_chain_state gains its departments
-- ---------------------------------------------------------------------
-- As arrays on the row rather than something to join afterwards, so
-- "show me every cold Design trail" stays one server-side filter
-- (PostgREST `cs`) instead of a second query and a merge in Node. The
-- rest of the view is 0036 §11 unchanged — repeated in full because a
-- view cannot be altered in place.

drop view if exists pusher_chain_state;

create view pusher_chain_state
with (security_barrier) as
select
  c.id as chain_id,
  c.project_id,
  c.unit_id,
  c.activity_id,
  c.title,
  c.created_at,
  p.name as project_name,
  p.code as project_code,
  u.name as unit_name,
  a.name as activity_name,
  dept.department_ids,
  dept.department_names,
  legs.leg_count,
  last.seq as last_seq,
  last.kind as last_kind,
  last.to_leg as current_leg,
  last.to_assignee_id as holder_id,
  entry.occurred_at as entered_at,
  entry.to_expected_days as expected_days,
  first_ev.occurred_at as started_at,
  (last.kind = 'completed') as is_finished,
  case
    when last.kind = 'completed' then 0
    else greatest(
      0,
      (now() at time zone 'Asia/Kolkata')::date
        - (entry.occurred_at at time zone 'Asia/Kolkata')::date
    )
  end as days_in_leg,
  case
    when last.kind = 'completed' then false
    else (now() at time zone 'Asia/Kolkata')::date
           - (entry.occurred_at at time zone 'Asia/Kolkata')::date
         > entry.to_expected_days
  end as is_stuck
from pusher_chains c
join projects p on p.id = c.project_id
join pusher_activities a on a.id = c.activity_id
left join units u on u.id = c.unit_id
left join lateral (
  select e.seq, e.kind, e.to_leg, e.to_assignee_id
  from pusher_chain_events e
  where e.chain_id = c.id
  order by e.seq desc
  limit 1
) last on true
-- The leg clock is anchored on the last LEG-ENTERING event, so a
-- hand-off cannot reset a cold trail's timer.
left join lateral (
  select e.occurred_at, e.to_expected_days
  from pusher_chain_events e
  where e.chain_id = c.id and e.kind <> 'handed'
  order by e.seq desc
  limit 1
) entry on true
left join lateral (
  select e.occurred_at
  from pusher_chain_events e
  where e.chain_id = c.id
  order by e.seq asc
  limit 1
) first_ev on true
left join lateral (
  select count(*)::int as leg_count
  from pusher_chain_legs l
  where l.chain_id = c.id
) legs on true
left join lateral (
  select
    coalesce(array_agg(d.id order by d.sort_order, d.name), '{}') as department_ids,
    coalesce(array_agg(d.name order by d.sort_order, d.name), '{}') as department_names
  from pusher_chain_departments cd
  join pusher_departments d on d.id = cd.department_id
  where cd.chain_id = c.id
) dept on true;

revoke all on pusher_chain_state from public, anon;
grant select on pusher_chain_state to authenticated;

-- ---------------------------------------------------------------------
-- 6. Audit, updated_at, RLS
-- ---------------------------------------------------------------------

drop trigger if exists audit_pusher_departments on pusher_departments;
create trigger audit_pusher_departments
  after insert or update or delete on pusher_departments
  for each row execute function audit_row();

drop trigger if exists set_updated_at on pusher_departments;
create trigger set_updated_at
  before update on pusher_departments
  for each row execute function set_updated_at();

drop trigger if exists audit_pusher_chain_departments on pusher_chain_departments;
create trigger audit_pusher_chain_departments
  after insert or update or delete on pusher_chain_departments
  for each row execute function audit_row();

alter table pusher_departments enable row level security;
alter table pusher_chain_departments enable row level security;

do $$
declare
  t text;
begin
  for t in select unnest(array['pusher_departments', 'pusher_chain_departments'])
  loop
    execute format('drop policy if exists "%1$s readable by authenticated users" on %1$I', t);
    execute format(
      'create policy "%1$s readable by authenticated users" on %1$I for select to authenticated using (true)',
      t
    );
    execute format('drop policy if exists "%1$s writable by pusher app" on %1$I', t);
    execute format(
      'create policy "%1$s writable by pusher app" on %1$I for insert to authenticated with check (has_app(''/pusher''))',
      t
    );
    execute format('drop policy if exists "%1$s updatable by pusher app" on %1$I', t);
    execute format(
      'create policy "%1$s updatable by pusher app" on %1$I for update to authenticated using (has_app(''/pusher'')) with check (has_app(''/pusher''))',
      t
    );
  end loop;
end $$;

-- Un-tagging a trail is not rewriting history, so the join row is
-- deletable; the master itself is switched off, never deleted.
drop policy if exists "pusher_chain_departments deletable by pusher app" on pusher_chain_departments;
create policy "pusher_chain_departments deletable by pusher app"
  on pusher_chain_departments for delete to authenticated using (has_app('/pusher'));

-- ---------------------------------------------------------------------
-- 7. Seed
-- ---------------------------------------------------------------------
-- The first four mirror the tools already built — Selections and Budgets
-- are Design's, Indents and Inventory are Site's, Purchase Orders are
-- Purchase's, Bills are Accounts' — so a trail sorts the same way the
-- rest of the toolbox already does. The last two cover the client-facing
-- and back-office work that has no tool of its own yet. All renameable
-- and switchable from the app.

insert into pusher_departments (name, sort_order)
values
  ('Design', 10),
  ('Site', 20),
  ('Purchase', 30),
  ('Accounts', 40),
  ('Client Relations', 50),
  ('Admin', 60)
on conflict do nothing;
