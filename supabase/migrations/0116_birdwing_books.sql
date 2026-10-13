-- 0116 — Birdwing Books: the guest house's expenses, attendance and salaries
--
-- FOUNDER, 2026-10-13 — the Birdwing build plan (plan.md, _Birdwing_);
-- the second of the two Hospitality tools, `/birdwing-books`. It replaces
-- the combined expenses workbook (599 lines over 13 months), the
-- attendance and overtime workbook, and the salary arithmetic nobody
-- wrote down.
--
--   * Expenses follow the Bills shape — header-only, an accounting month
--     apart from the day it was paid, an optional vendor from the shared
--     Masters list, a bill attached in a private bucket — so Financial
--     Management reads one expense model. `source_key` (sheet!cell) is the
--     repeat-upload key: an upload twice adds nothing the second time.
--   * Attendance + a dated pay rule per person produces ONE salary
--     expense per person per month: birdwing_confirm_salary() writes the
--     run and its expense line together, once; pressing again is a no-op,
--     and both are locked afterwards, with that month's attendance.
--   * The pay formula is the laptop app's, kept as it was until the
--     founder changes it (lib/birdwing-books/payroll.ts, tested):
--       base + OT hours × OT rate + room-days × room rate
--            + guest-days × guest rate + incentives − deductions
--     where a room-day is one occupied room on a day the person worked,
--     and a guest-day one guest in the house on such a day. Leave earns
--     no incentive.
--   * Occupancy comes from Stays through ONE money-free, name-free view,
--     birdwing_occupancy_facts — rooms occupied and guests in the house
--     per day, and nothing else. Books declares it, so the coupling points
--     from the reader to the read (STATUS.md's contract table).
--
-- Re-runnable throughout. Needs 0115 (the slugs, the stays tables).

-- ---------------------------------------------------------------------
-- 1. The masters: expense heads, staff, pay rules — admins write them
-- ---------------------------------------------------------------------

create table if not exists birdwing_expense_heads (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  -- The one head a confirmed salary run writes into.
  is_salary boolean not null default false,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists birdwing_expense_heads_name_key
  on birdwing_expense_heads (lower(trim(name)));
create unique index if not exists birdwing_expense_heads_one_salary
  on birdwing_expense_heads (is_salary) where is_salary;

create table if not exists birdwing_staff (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  -- Optional: the person's toolbox account, when they have one (Amal is
  -- in Directory). Shared surface, read for a name only.
  profile_id uuid references profiles (id),
  role text,
  joined_on date,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists birdwing_staff_name_key on birdwing_staff (lower(trim(name)));

-- Effective-dated: a raise is a new row from its first day, and last
-- year's salaries keep last year's rule.
create table if not exists birdwing_pay_rules (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references birdwing_staff (id),
  effective_from date not null,
  base_salary numeric(12, 2) not null check (base_salary >= 0),
  -- The normal shift; overtime is worked time outside it. Without one,
  -- no overtime is reckoned (a fixed salary).
  shift_start time,
  shift_end time,
  ot_rate_per_hr numeric(10, 2) not null default 0 check (ot_rate_per_hr >= 0),
  room_day_rate numeric(10, 2) not null default 0 check (room_day_rate >= 0),
  guest_day_rate numeric(10, 2) not null default 0 check (guest_day_rate >= 0),
  notes text,
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (staff_id, effective_from),
  constraint birdwing_pay_rules_shift check ((shift_start is null) = (shift_end is null))
);

-- ---------------------------------------------------------------------
-- 2. Attendance
-- ---------------------------------------------------------------------

create table if not exists birdwing_attendance (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references birdwing_staff (id),
  on_date date not null,
  status text not null default 'present'
    check (status in ('present', 'half_day', 'leave', 'holiday_leave', 'absent')),
  in_at time,
  out_at time,
  break_minutes int not null default 0 check (break_minutes between 0 and 720),
  -- The old sheets' overtime notation ("6.3") is kept here as written,
  -- never parsed as hours.
  note text,
  source_key text unique,
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (staff_id, on_date),
  constraint birdwing_attendance_times check ((in_at is null) = (out_at is null))
);
create index if not exists birdwing_attendance_date_idx on birdwing_attendance (on_date);

-- ---------------------------------------------------------------------
-- 3. Salary runs and expenses
-- ---------------------------------------------------------------------

create table if not exists birdwing_salary_runs (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references birdwing_staff (id),
  month date not null check (extract(day from month) = 1),
  base numeric(12, 2) not null check (base >= 0),
  ot_hours numeric(8, 2) not null default 0 check (ot_hours >= 0),
  ot_amount numeric(12, 2) not null default 0 check (ot_amount >= 0),
  room_days int not null default 0 check (room_days >= 0),
  room_amount numeric(12, 2) not null default 0 check (room_amount >= 0),
  guest_days int not null default 0 check (guest_days >= 0),
  guest_amount numeric(12, 2) not null default 0 check (guest_amount >= 0),
  incentives numeric(12, 2) not null default 0 check (incentives >= 0),
  deductions numeric(12, 2) not null default 0 check (deductions >= 0),
  total numeric(12, 2) not null check (total > 0),
  note text,
  confirmed_by uuid references profiles (id),
  confirmed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (staff_id, month),
  constraint birdwing_salary_runs_sum check (
    total = base + ot_amount + room_amount + guest_amount + incentives - deductions
  )
);

create table if not exists birdwing_expenses (
  id uuid primary key default gen_random_uuid(),
  -- The month the cost belongs to (first of the month), apart from the
  -- day it was paid: October's electricity is paid in November.
  accounting_month date not null check (extract(day from accounting_month) = 1),
  head_id uuid not null references birdwing_expense_heads (id),
  description text not null check (length(trim(description)) > 0),
  spent_on date,
  amount numeric(12, 2) not null check (amount > 0),
  vendor_id uuid references vendors (id),
  -- Who was paid when there is no vendor record — a staff member, a shop.
  payee text,
  bill_ref text,
  payment_details text,
  status text not null default 'recorded' check (status in ('recorded', 'confirmed')),
  -- What the import could not settle ("date outside its month",
  -- "future month — not yet confirmed"), shown until cleared.
  review_note text,
  source_key text unique,
  -- Written by a confirmed salary run, and then not editable here.
  salary_run_id uuid unique references birdwing_salary_runs (id),
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists birdwing_expenses_month_idx on birdwing_expenses (accounting_month, head_id);

create table if not exists birdwing_expense_files (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references birdwing_expenses (id),
  storage_path text not null unique,
  file_name text not null,
  content_type text not null,
  size_bytes int not null check (size_bytes > 0),
  created_by uuid references profiles (id),
  created_at timestamptz not null default now()
);
create index if not exists birdwing_expense_files_expense_idx on birdwing_expense_files (expense_id);

-- ---------------------------------------------------------------------
-- 4. Guards
-- ---------------------------------------------------------------------
-- Invoker, direct write paths in this tool only.

-- A salary line is the run's; a confirmed line is settled. Confirmed
-- may go back to recorded (to correct it), and nothing else moves.
create or replace function birdwing_expenses_guard()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.salary_run_id is not null then
      raise exception 'This is a confirmed salary — it cannot be removed.';
    end if;
    if old.status = 'confirmed' then
      raise exception 'This line is confirmed — mark it recorded again before removing it.';
    end if;
    return old;
  end if;

  if old.salary_run_id is not null then
    raise exception 'This is a confirmed salary — it cannot be changed here.';
  end if;
  if new.salary_run_id is distinct from old.salary_run_id
     or new.source_key is distinct from old.source_key then
    raise exception 'An expense line''s origin never changes.';
  end if;
  if old.status = 'confirmed' and new.status = 'confirmed'
     and (new.accounting_month, new.head_id, new.description, new.spent_on, new.amount,
          new.vendor_id, new.payee, new.bill_ref, new.payment_details)
         is distinct from
         (old.accounting_month, old.head_id, old.description, old.spent_on, old.amount,
          old.vendor_id, old.payee, old.bill_ref, old.payment_details) then
    raise exception 'This line is confirmed — mark it recorded again to change it.';
  end if;
  return new;
end $$;

drop trigger if exists birdwing_expenses_guard on birdwing_expenses;
create trigger birdwing_expenses_guard
  before update or delete on birdwing_expenses
  for each row execute function birdwing_expenses_guard();

-- A confirmed salary closes that person's month of attendance.
create or replace function birdwing_attendance_open_month()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_staff uuid;
  v_date date;
begin
  if tg_op = 'DELETE' then
    v_staff := old.staff_id;
    v_date := old.on_date;
  else
    v_staff := new.staff_id;
    v_date := new.on_date;
  end if;

  if exists (
    select 1 from birdwing_salary_runs
    where staff_id = v_staff and month = date_trunc('month', v_date)::date
  ) or (tg_op = 'UPDATE' and exists (
    select 1 from birdwing_salary_runs
    where staff_id = old.staff_id and month = date_trunc('month', old.on_date)::date
  )) then
    raise exception 'That month''s salary is confirmed — its attendance is closed.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end $$;

drop trigger if exists birdwing_attendance_open_month on birdwing_attendance;
create trigger birdwing_attendance_open_month
  before insert or update or delete on birdwing_attendance
  for each row execute function birdwing_attendance_open_month();

revoke execute on function birdwing_expenses_guard() from public, anon, authenticated;
revoke execute on function birdwing_attendance_open_month() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 5. Confirming a salary — the run and its one expense line together
-- ---------------------------------------------------------------------
-- The figures are worked out by the server from attendance and the pay
-- rule (lib/birdwing-books/payroll.ts) — the screen sends only who, which
-- month and the reviewer's incentives, deductions and note. The total is
-- summed HERE, so the stored run always adds up. A run that already
-- exists is returned untouched: confirming twice is confirming once.

create or replace function birdwing_confirm_salary(
  p_staff_id uuid,
  p_month date,
  p_base numeric,
  p_ot_hours numeric,
  p_ot_amount numeric,
  p_room_days int,
  p_room_amount numeric,
  p_guest_days int,
  p_guest_amount numeric,
  p_incentives numeric,
  p_deductions numeric,
  p_note text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_run uuid;
  v_name text;
  v_head uuid;
  v_total numeric;
begin
  if p_month is null or extract(day from p_month) <> 1 then
    raise exception 'A salary is confirmed for a whole month.';
  end if;

  -- Serialise two presses for the same person and month. An advisory
  -- lock, not `for update`: locking a staff row would need that table's
  -- UPDATE policy, which is admins' only.
  perform pg_advisory_xact_lock(hashtext('birdwing_salary:' || p_staff_id::text || ':' || p_month::text));
  select name into v_name from birdwing_staff where id = p_staff_id;
  if not found then
    raise exception 'That person could not be found.';
  end if;

  select id into v_run from birdwing_salary_runs where staff_id = p_staff_id and month = p_month;
  if v_run is not null then
    return v_run;
  end if;

  select id into v_head from birdwing_expense_heads where is_salary and is_active;
  if v_head is null then
    raise exception 'Mark one expense head as the salary head in Settings first.';
  end if;

  v_total := round(coalesce(p_base, 0) + coalesce(p_ot_amount, 0) + coalesce(p_room_amount, 0)
    + coalesce(p_guest_amount, 0) + coalesce(p_incentives, 0) - coalesce(p_deductions, 0), 2);
  if v_total <= 0 then
    raise exception 'The salary comes to nothing — check the deductions.';
  end if;

  insert into birdwing_salary_runs (
    staff_id, month, base, ot_hours, ot_amount, room_days, room_amount, guest_days,
    guest_amount, incentives, deductions, total, note, confirmed_by
  ) values (
    p_staff_id, p_month, round(coalesce(p_base, 0), 2), round(coalesce(p_ot_hours, 0), 2),
    round(coalesce(p_ot_amount, 0), 2), coalesce(p_room_days, 0), round(coalesce(p_room_amount, 0), 2),
    coalesce(p_guest_days, 0), round(coalesce(p_guest_amount, 0), 2),
    round(coalesce(p_incentives, 0), 2), round(coalesce(p_deductions, 0), 2), v_total,
    nullif(trim(coalesce(p_note, '')), ''), auth.uid()
  )
  returning id into v_run;

  insert into birdwing_expenses (
    accounting_month, head_id, description, amount, payee, status, salary_run_id,
    created_by, updated_by
  ) values (
    p_month, v_head, v_name || ' — salary, ' || to_char(p_month, 'FMMonth YYYY'), v_total, v_name,
    'confirmed', v_run, auth.uid(), auth.uid()
  );

  return v_run;
end $$;

revoke execute on function birdwing_confirm_salary(
  uuid, date, numeric, numeric, numeric, int, numeric, int, numeric, numeric, numeric, text
) from public, anon;
grant execute on function birdwing_confirm_salary(
  uuid, date, numeric, numeric, numeric, int, numeric, int, numeric, numeric, numeric, text
) to authenticated;

-- ---------------------------------------------------------------------
-- 6. Occupancy, as Books may see it — counts per day, nothing else
-- ---------------------------------------------------------------------
-- Owner view: it reads Stays' tables past their RLS, so its WHERE and its
-- three columns ARE the boundary — no guest, no stay, no rupee. Readable
-- by either Birdwing grant (Stays shows the same counts on its welcome).
-- Write grants revoked by name (BUGCATCHER #3); pinned in
-- scripts/view-manifest.ts.

create or replace view birdwing_occupancy_facts
with (security_barrier = true) as
with room_nights as (
  select n::date as on_date, count(*) as rooms
  from birdwing_stay_rooms r
  join birdwing_stays s on s.id = r.stay_id
  cross join lateral generate_series(r.from_date::timestamp, (r.to_date - 1)::timestamp, interval '1 day') n
  where r.released_at is null
    and not s.is_block
    and s.status in ('confirmed', 'checked_in', 'checked_out')
  group by 1
),
guest_nights as (
  select n::date as on_date, sum(s.adults + s.children) as guests
  from birdwing_stays s
  cross join lateral generate_series(s.arrival::timestamp, (s.departure - 1)::timestamp, interval '1 day') n
  where not s.is_block
    and s.departure > s.arrival
    and s.status in ('confirmed', 'checked_in', 'checked_out')
  group by 1
)
select
  coalesce(r.on_date, g.on_date) as on_date,
  coalesce(r.rooms, 0)::int as rooms_occupied,
  coalesce(g.guests, 0)::int as guests_in_house
from room_nights r
full join guest_nights g on g.on_date = r.on_date
where has_app('/birdwing') or has_app('/birdwing-books');

revoke insert, update, delete, truncate on birdwing_occupancy_facts from anon, authenticated;
grant select on birdwing_occupancy_facts to authenticated;

-- ---------------------------------------------------------------------
-- 7. The `birdwing-books` bucket — bills against expense lines
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'birdwing-books', 'birdwing-books', false, 4194304,
  array['application/pdf', 'image/jpeg', 'image/png']
)
on conflict (id) do update
  set public = false,
      file_size_limit = 4194304,
      allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png'];

drop policy if exists "birdwing-books readable by birdwing books app" on storage.objects;
create policy "birdwing-books readable by birdwing books app"
  on storage.objects for select to authenticated
  using (bucket_id = 'birdwing-books' and public.has_app('/birdwing-books'));

drop policy if exists "birdwing-books writable by birdwing books app" on storage.objects;
create policy "birdwing-books writable by birdwing books app"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'birdwing-books' and public.has_app('/birdwing-books'));

drop policy if exists "birdwing-books deletable by birdwing books app" on storage.objects;
create policy "birdwing-books deletable by birdwing books app"
  on storage.objects for delete to authenticated
  using (bucket_id = 'birdwing-books' and public.has_app('/birdwing-books'));

-- ---------------------------------------------------------------------
-- 8. Audit, updated_at, RLS
-- ---------------------------------------------------------------------

do $$
declare
  t text;
begin
  for t in select unnest(array[
    'birdwing_expense_heads', 'birdwing_staff', 'birdwing_pay_rules', 'birdwing_attendance',
    'birdwing_salary_runs', 'birdwing_expenses', 'birdwing_expense_files'
  ])
  loop
    execute format('drop trigger if exists audit_%I on %I', t, t);
    execute format(
      'create trigger audit_%I after insert or update or delete on %I
         for each row execute function audit_row()', t, t);
    execute format('alter table %I enable row level security', t);
  end loop;

  for t in select unnest(array[
    'birdwing_expense_heads', 'birdwing_staff', 'birdwing_pay_rules', 'birdwing_attendance',
    'birdwing_expenses'
  ])
  loop
    execute format('drop trigger if exists set_updated_at on %I', t);
    execute format(
      'create trigger set_updated_at before update on %I
         for each row execute function set_updated_at()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 9. Policies — ONE per verb; nothing for anon
-- ---------------------------------------------------------------------
-- Staff names and every rupee here are this tool's: /birdwing-books to
-- read, everywhere. The masters are written by admins only.

do $$
declare
  t text;
begin
  for t in select unnest(array['birdwing_expense_heads', 'birdwing_staff', 'birdwing_pay_rules'])
  loop
    execute format('drop policy if exists "%s readable by birdwing books app" on %I', t, t);
    execute format(
      'create policy "%s readable by birdwing books app" on %I
         for select to authenticated using (has_app(''/birdwing-books''))', t, t);
    execute format('drop policy if exists "%s insertable by admins" on %I', t, t);
    execute format(
      'create policy "%s insertable by admins" on %I
         for insert to authenticated with check (is_admin())', t, t);
    execute format('drop policy if exists "%s updatable by admins" on %I', t, t);
    execute format(
      'create policy "%s updatable by admins" on %I
         for update to authenticated using (is_admin()) with check (is_admin())', t, t);
  end loop;

  -- Attendance and expenses: all four verbs (the guards say when).
  for t in select unnest(array['birdwing_attendance', 'birdwing_expenses'])
  loop
    execute format('drop policy if exists "%s readable by birdwing books app" on %I', t, t);
    execute format(
      'create policy "%s readable by birdwing books app" on %I
         for select to authenticated using (has_app(''/birdwing-books''))', t, t);
    execute format('drop policy if exists "%s insertable by birdwing books app" on %I', t, t);
    execute format(
      'create policy "%s insertable by birdwing books app" on %I
         for insert to authenticated with check (has_app(''/birdwing-books''))', t, t);
    execute format('drop policy if exists "%s updatable by birdwing books app" on %I', t, t);
    execute format(
      'create policy "%s updatable by birdwing books app" on %I
         for update to authenticated
         using (has_app(''/birdwing-books'')) with check (has_app(''/birdwing-books''))', t, t);
    execute format('drop policy if exists "%s deletable by birdwing books app" on %I', t, t);
    execute format(
      'create policy "%s deletable by birdwing books app" on %I
         for delete to authenticated using (has_app(''/birdwing-books''))', t, t);
  end loop;
end $$;

-- A confirmed run is permanent: read and made, never changed.
drop policy if exists "birdwing_salary_runs readable by birdwing books app" on birdwing_salary_runs;
create policy "birdwing_salary_runs readable by birdwing books app" on birdwing_salary_runs
  for select to authenticated using (has_app('/birdwing-books'));
drop policy if exists "birdwing_salary_runs insertable by birdwing books app" on birdwing_salary_runs;
create policy "birdwing_salary_runs insertable by birdwing books app" on birdwing_salary_runs
  for insert to authenticated with check (has_app('/birdwing-books'));

drop policy if exists "birdwing_expense_files readable by birdwing books app" on birdwing_expense_files;
create policy "birdwing_expense_files readable by birdwing books app" on birdwing_expense_files
  for select to authenticated using (has_app('/birdwing-books'));
drop policy if exists "birdwing_expense_files insertable by birdwing books app" on birdwing_expense_files;
create policy "birdwing_expense_files insertable by birdwing books app" on birdwing_expense_files
  for insert to authenticated with check (has_app('/birdwing-books'));
drop policy if exists "birdwing_expense_files deletable by birdwing books app" on birdwing_expense_files;
create policy "birdwing_expense_files deletable by birdwing books app" on birdwing_expense_files
  for delete to authenticated using (has_app('/birdwing-books'));

-- ---------------------------------------------------------------------
-- 10. Seed — the expense heads the sheet and the laptop app used
-- ---------------------------------------------------------------------

insert into birdwing_expense_heads (name, is_salary, sort_order)
select v.name, v.is_salary, v.sort_order
from (values
  ('Staff Salaries', true, 10), ('Food Supplies', false, 20), ('Gas', false, 30),
  ('Electricity', false, 40), ('WiFi', false, 50), ('Laundry', false, 60),
  ('Diesel', false, 70), ('Maintenance', false, 80), ('Other', false, 90)
) as v (name, is_salary, sort_order)
where not exists (
  select 1 from birdwing_expense_heads h where lower(trim(h.name)) = lower(v.name)
);

-- ---------------------------------------------------------------------
-- 11. Prove it
-- ---------------------------------------------------------------------

do $$
declare
  r record;
  v int;
  b record;
begin
  for r in
    select * from (values
      ('birdwing_expense_heads', 3), ('birdwing_staff', 3), ('birdwing_pay_rules', 3),
      ('birdwing_attendance', 4), ('birdwing_salary_runs', 2), ('birdwing_expenses', 4),
      ('birdwing_expense_files', 3)
    ) as x (name, expected)
  loop
    if not exists (
      select 1 from pg_class cl join pg_namespace n on n.oid = cl.relnamespace
      where n.nspname = 'public' and cl.relname = r.name and cl.relrowsecurity
    ) then
      raise exception '0116: % is missing or has RLS off', r.name;
    end if;
    select count(*) into v from pg_policies where schemaname = 'public' and tablename = r.name;
    if v <> r.expected then
      raise exception '0116: % has % policies, expected %', r.name, v, r.expected;
    end if;
    select count(*) into v from pg_policies
      where schemaname = 'public' and tablename = r.name and cmd = 'SELECT';
    if v <> 1 then
      raise exception '0116: % has % SELECT policies, expected exactly 1', r.name, v;
    end if;
    if exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = r.name and 'anon' = any(roles)
    ) then
      raise exception '0116: % has a policy for anon', r.name;
    end if;
  end loop;

  if exists (
    select 1 from information_schema.table_privileges
    where table_schema = 'public' and table_name = 'birdwing_occupancy_facts'
      and grantee in ('anon', 'authenticated')
      and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
  ) then
    raise exception '0116: birdwing_occupancy_facts is writable';
  end if;
  if (select array_agg(column_name::text order by ordinal_position)
        from information_schema.columns
       where table_schema = 'public' and table_name = 'birdwing_occupancy_facts')
     <> array['on_date', 'rooms_occupied', 'guests_in_house'] then
    raise exception '0116: birdwing_occupancy_facts carries more than its three counts';
  end if;

  if (select count(*) from birdwing_expense_heads where is_salary) <> 1 then
    raise exception '0116: exactly one expense head must be the salary head';
  end if;

  select * into b from storage.buckets where id = 'birdwing-books';
  if b is null or b.public or b.file_size_limit <> 4194304 then
    raise exception '0116: birdwing-books bucket missing, public, or the wrong size';
  end if;
  select count(*) into v from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname like 'birdwing-books %';
  if v <> 3 then
    raise exception '0116: % birdwing-books storage policies, expected 3', v;
  end if;

  if exists (
    select 1 from information_schema.routine_privileges
    where routine_schema = 'public' and grantee in ('anon', 'PUBLIC')
      and routine_name = 'birdwing_confirm_salary'
  ) then
    raise exception '0116: anon or public may execute birdwing_confirm_salary';
  end if;
end $$;
