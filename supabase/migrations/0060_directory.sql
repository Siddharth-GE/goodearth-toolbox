-- 0060 — Directory: everyone who works here, with a card.
--
-- FOUNDER, 2026-08-14. Five decisions taken before any of this was
-- written, and the schema below is those decisions rather than a guess:
--
--   1. ONE PERSON = ONE ACCOUNT = ONE CARD. Every named person on the
--      staff sheet gets a real login with a random starting password
--      handed over by hand. There is no person-without-an-account
--      concept, which is why staff_details' PRIMARY KEY is profiles.id
--      and not a surrogate: the schema cannot represent a second card
--      for one person, or a card for nobody.
--   2. THE CARD CARRIES phone, designation, department, reports-to,
--      joined date, blood group, emergency contact, photo and date of
--      birth. The photo column ships here; the bucket is 0061.
--   3. THE EDITING IS SPLIT, IN THE DATABASE. A person edits their own
--      contact details. Only an admin sets department, designation,
--      reporting line and joining date. Enforced by staff_details_guard()
--      in §4, mirroring profiles_guard() (0034 §6) — not by the UI, which
--      is a suggestion.
--   4. A NEW PEOPLE-DEPARTMENT LIST, owned by Directory. Relay's
--      pusher_departments (0038) IS NOT TOUCHED and must not be reused:
--      0038's own header forbids conflating "what kind of work a trail
--      is" with "which department a person sits in", because a Design
--      person routinely carries a leg of a Site trail. Ten departments,
--      seeded in §1. "Farm Manager" and "GH Caretaker" from the staff
--      sheet are DESIGNATIONS, not departments.
--   5. profiles.team STAYS DEAD. It is free text, null on every row, and
--      repointing it at staff_departments is a rename on a shared table,
--      which the additive-only rule forbids. Ignore it.
--
-- WHAT THIS FILE DELIBERATELY DOES NOT DO
--
--   '/directory' IS ALREADY A KNOWN GRANT. It has been in both
--   user_apps_app_known and role_apps_app_known since 0030 and was
--   re-added verbatim by 0052:20-40. There is NO CHECK to extend — §8
--   ASSERTS it instead, rather than leaving the next person to hunt for
--   a constraint that "must" be missing. Same note 0048 §3 and 0050 §11
--   leave behind.
--
--   No view is created. §6 says why the email surface is a function.
--
-- Safe to run twice throughout.

-- ---------------------------------------------------------------------
-- 1. staff_departments — the people-department master
-- ---------------------------------------------------------------------
-- Same shape and same rules as pusher_departments (0038 §1): unique on
-- lower(name) so "Design" and "design" cannot split the list in two, and
-- an off-switch rather than a delete, because someone who has left still
-- sits in a department on every past record.

create table if not exists staff_departments (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists staff_departments_name_key
  on staff_departments (lower(name));

create index if not exists staff_departments_active_idx
  on staff_departments (sort_order, name) where is_active;

-- The ten from the staff sheet, in the order the company reads them: the
-- build first, then the client-facing and back-office functions. All
-- renameable and switchable from the app.
insert into staff_departments (name, sort_order) values
  ('Engineering', 10),
  ('Design',      20),
  ('Interior',    30),
  ('Project',     40),
  ('Carpentry',   50),
  ('CRM',         60),
  ('Marketing',   70),
  ('Commercial',  80),
  ('Accounts',    90),
  ('Logistics',  100)
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 2. staff_details — one row per account, forever
-- ---------------------------------------------------------------------
-- PRIMARY KEY IS profiles.id. That is founder decision 1 written as a
-- constraint rather than a convention. Named `id` and not `profile_id`
-- because audit_row() reads NEW.id — a table without one raises inside
-- the audit trigger at runtime (the 0018/0031 lesson, restated in 0038).
--
-- THE COLUMN SPLIT IS THE POINT OF THIS TABLE, so it is grouped and
-- labelled here and enforced by §4. ANYONE ADDING A COLUMN MUST DECIDE
-- WHICH GROUP IT JOINS and, if it is a company column, add it to the
-- guard's two tuples IN THE SAME MIGRATION. A column added to the admin
-- group and forgotten in the guard is silently self-editable, and nothing
-- on screen says so.

create table if not exists staff_details (
  id uuid primary key references profiles (id) on delete cascade,

  -- --- The person's own, editable from "My details" -------------------
  phone text,
  date_of_birth date,
  blood_group text,
  emergency_contact_name text,
  emergency_contact_phone text,
  -- The object key in the private `staff-photos` bucket, or null. The
  -- bucket and its policies are 0061; the column ships now so the card
  -- component has one shape from day one.
  photo_path text,

  -- --- The company's, admin only (guarded in §4) ----------------------
  department_id uuid references staff_departments (id),
  designation text,
  reports_to_id uuid references profiles (id),
  joined_on date,

  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Phone shape is a BACKSTOP, not the UX rule. normalisePhone() in
-- lib/directory/people.ts strips spaces, dashes and brackets before every
-- write, so what arrives here is already digits with an optional +. The
-- range is wide on purpose: a ten-digit Indian mobile, a landline with an
-- STD code and an international number all have to fit, and a stricter
-- pattern would refuse a real number that someone then keeps in a
-- spreadsheet instead of here.
alter table staff_details drop constraint if exists staff_details_phone_check;
alter table staff_details add constraint staff_details_phone_check
  check (phone is null or phone ~ '^\+?[0-9]{7,15}$');

alter table staff_details drop constraint if exists staff_details_emergency_phone_check;
alter table staff_details add constraint staff_details_emergency_phone_check
  check (emergency_contact_phone is null or emergency_contact_phone ~ '^\+?[0-9]{7,15}$');

-- A number with nobody's name against it is not an emergency contact —
-- it is a number. Same instinct as 0050's "a lost prospect must say why".
alter table staff_details drop constraint if exists staff_details_emergency_named_check;
alter table staff_details add constraint staff_details_emergency_named_check
  check (
    emergency_contact_phone is null
    or length(trim(coalesce(emergency_contact_name, ''))) > 0
  );

alter table staff_details drop constraint if exists staff_details_blood_group_check;
alter table staff_details add constraint staff_details_blood_group_check
  check (blood_group is null or blood_group in
    ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'));

-- NOTE FOR THE NEXT PERSON: "not in the future" CANNOT live here.
-- current_date is STABLE, not IMMUTABLE, and Postgres refuses it in a
-- CHECK. The lower bound is a constraint; the upper bound is in the guard
-- (§4), which can call it. Tidying this into a CHECK produces a migration
-- that fails at apply time, which is at least loud.
alter table staff_details drop constraint if exists staff_details_dob_check;
alter table staff_details add constraint staff_details_dob_check
  check (date_of_birth is null or date_of_birth > date '1900-01-01');

alter table staff_details drop constraint if exists staff_details_designation_check;
alter table staff_details add constraint staff_details_designation_check
  check (designation is null or length(trim(designation)) > 0);

-- Nobody reports to themselves. The wider case (A -> B -> A) is
-- representable and is broken in lib/directory/org.ts, which walks with a
-- `seen` set and a depth cap — a full cycle check in a trigger is a
-- recursive CTE, which is over-engineering for fifty people. See the
-- accepted gap in the tool's PLAN.md.
alter table staff_details drop constraint if exists staff_details_self_report_check;
alter table staff_details add constraint staff_details_self_report_check
  check (reports_to_id is null or reports_to_id <> id);

create index if not exists staff_details_department_idx
  on staff_details (department_id) where department_id is not null;

create index if not exists staff_details_reports_to_idx
  on staff_details (reports_to_id) where reports_to_id is not null;

-- No index on date_of_birth, deliberately. The birthday window wraps the
-- year boundary and ignores the birth year, so no btree on the column
-- serves it; the table is fifty rows today and ~200 at the size this app
-- is built for, and lib/directory/birthdays.ts does the arithmetic on a
-- complete read. An index here would be theatre.

-- ---------------------------------------------------------------------
-- 3. Every account has a card, forever
-- ---------------------------------------------------------------------
-- The units_seed_engagement shape (0050 §8), and for the same two
-- reasons. First, the roster gets a real row per person with server-side
-- filters instead of a left join filtered in Node. Second and more
-- important: "My details" becomes an UPDATE of a row that already exists,
-- so staff_details NEEDS NO INSERT POLICY AT ALL — exactly like profiles,
-- whose rows only ever arrive through handle_new_user().
--
-- THAT IS A SECURITY PROPERTY, not tidiness. With an INSERT policy a
-- person could insert their own row with department_id and reports_to_id
-- already set, and a BEFORE UPDATE guard would never see it. The guard in
-- §4 covers INSERT too, belt and braces — but the policy that does not
-- exist is the stronger half.
--
-- THIS IS A CROSS-TOOL TRIGGER ON A SHARED TABLE. It fires inside
-- handle_new_user(), which fires inside Settings' inviteUser(). CLAUDE.md:
-- "a cross-tool trigger or definer function not listed there is what
-- nobody finds until it misfires" — so it is declared HERE, in Directory's
-- own migration, so the coupling points the right way, and named in
-- CLAUDE.md and STATUS.md.
--
-- THE MISFIRE TO WATCH FOR: if staff_details ever grows a NOT NULL column
-- with no default, inviteUser() starts failing and surfaces as "Could not
-- create the account", nowhere near the cause.

create or replace function profiles_seed_staff_details()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into staff_details (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists profiles_seed_staff_details on profiles;
create trigger profiles_seed_staff_details
  after insert on profiles
  for each row execute function profiles_seed_staff_details();

-- Backfill the accounts that already exist. Re-runnable.
insert into staff_details (id)
select p.id from profiles p
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 4. staff_details_guard() — founder decision 3, in the database
-- ---------------------------------------------------------------------
-- Postgres RLS cannot restrict an UPDATE to particular COLUMNS, which is
-- exactly why profiles_guard() exists (0013 §1). This is that function's
-- twin, for the four company-owned columns. The UI hides them too; the UI
-- is not the boundary.
--
-- `auth.uid() is not null` on the column branch, verbatim from 0014's
-- narrowing. TWO THINGS DEPEND ON IT:
--   * Studio stays the break-glass path.
--   * scripts/import-staff.ts sets department and designation for the
--     whole company with the SERVICE ROLE, where auth.uid() is null.
-- Remove that condition and the importer stops working, silently, on the
-- one run that matters. Same fragility 0014 documented.

create or replace function staff_details_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- A card belongs to one account permanently — the primary key is
  -- founder decision 1, and an UPDATE could otherwise move it.
  if tg_op = 'UPDATE' and new.id is distinct from old.id then
    raise exception 'A directory card belongs to one account permanently';
  end if;

  -- Born in the future is a typo, every time. Not a CHECK because
  -- current_date is not IMMUTABLE — see §2.
  if new.date_of_birth is not null and new.date_of_birth >= current_date then
    raise exception 'That date of birth is in the future — check the year';
  end if;

  -- The four company-owned columns. ADDING A COLUMN TO THE ADMIN GROUP
  -- MEANS ADDING IT TO BOTH BRANCHES BELOW, in the same migration.
  if auth.uid() is not null and not is_admin() then
    if tg_op = 'INSERT' then
      if new.department_id is not null
         or new.designation is not null
         or new.reports_to_id is not null
         or new.joined_on is not null then
        raise exception
          'Only an admin can set a department, designation, reporting line or joining date';
      end if;
    else
      if (new.department_id, new.designation, new.reports_to_id, new.joined_on)
         is distinct from
         (old.department_id, old.designation, old.reports_to_id, old.joined_on) then
        raise exception
          'Only an admin can change a department, designation, reporting line or joining date';
      end if;
    end if;
  end if;

  return new;
end $$;

drop trigger if exists staff_details_guard on staff_details;
create trigger staff_details_guard
  before insert or update on staff_details
  for each row execute function staff_details_guard();

-- ---------------------------------------------------------------------
-- 5. RLS
-- ---------------------------------------------------------------------
-- WRITES ARE GATED ON is_admin(), NOT ON has_app('/directory'), and this
-- is the most important decision in the file. Every account in the
-- company is going to hold '/directory'. A grant everybody holds is not a
-- boundary — it is `true` with extra steps. So everything that must
-- actually be restricted here says is_admin().

alter table staff_departments enable row level security;

drop policy if exists "staff_departments readable by authenticated users" on staff_departments;
create policy "staff_departments readable by authenticated users"
  on staff_departments for select to authenticated using (true);

drop policy if exists "staff_departments writable by admins" on staff_departments;
create policy "staff_departments writable by admins"
  on staff_departments for insert to authenticated with check (is_admin());

drop policy if exists "staff_departments updatable by admins" on staff_departments;
create policy "staff_departments updatable by admins"
  on staff_departments for update to authenticated
  using (is_admin()) with check (is_admin());

-- No delete policy. A department is switched off, never removed.

alter table staff_details enable row level security;

-- ONE select policy, with the self clause folded into the same qual.
-- CLAUDE.md: "Never add a second SELECT policy to a gated table —
-- permissive policies OR together and the second one is invisible. Widen
-- the existing qual." The `or id = auth.uid()` half is why losing the
-- /directory grant never locks someone out of correcting their own phone
-- number, and why "My details" needs no grant of its own.
drop policy if exists "staff_details readable by directory app" on staff_details;
create policy "staff_details readable by directory app"
  on staff_details for select to authenticated
  using (has_app('/directory') or id = auth.uid());

-- Two UPDATE policies, which IS the profiles idiom (0001's own-row policy
-- plus 0013's admin policy) and NOT the mistake above — that rule is
-- about a second SELECT on a money-gated table. The column split between
-- these two is held by the guard in §4, not by the policies, because RLS
-- cannot see columns.
drop policy if exists "staff_details updatable by the person" on staff_details;
create policy "staff_details updatable by the person"
  on staff_details for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "staff_details updatable by admins" on staff_details;
create policy "staff_details updatable by admins"
  on staff_details for update to authenticated
  using (is_admin()) with check (is_admin());

-- NO INSERT POLICY and NO DELETE POLICY, on purpose — see §3. Rows arrive
-- from the seeding trigger and leave only with the auth user.

-- ---------------------------------------------------------------------
-- 6. directory_emails() — the one new read of auth.users
-- ---------------------------------------------------------------------
-- Email lives ONLY in auth.users. Today the single read path is
-- admin_list_users() (0034 §6), gated `where is_admin()`, so a member of
-- staff has no way to see a colleague's address at all. A directory that
-- cannot show an email is not a directory.
--
-- A FUNCTION, NOT A VIEW, and the reasons are worth stating because this
-- schema's instinct is otherwise:
--   * admin_list_users() is the established shape for reading auth.users
--     from this app. This is that function with a different gate — one
--     shape, one place to audit, no new class of object.
--   * A view is owned by postgres and bypasses RLS. It would need its own
--     has_app() in the WHERE and the full revoke set 0059 exists to teach.
--     A function needs one revoke line and gets it right.
--   * `npm run db:types` would put an auth.users-derived relation into
--     database.types.ts, where the next person joins it without thinking.
--
-- THE `where has_app('/directory')` IS THE ENTIRE PERMISSION BOUNDARY.
-- Security definer bypasses RLS; delete that line and any signed-in
-- account, including one with no grants at all, reads every email address
-- in the company.
--
-- RETURNS INACTIVE PEOPLE TOO. The screens filter. Filtering here would
-- blank the email on a deactivated person's card, which is the one time an
-- admin most needs it.
--
-- No self-fallback and no argument: a person's own email is already on
-- their session (lib/auth/dal.ts), so "My details" never calls this.

create or replace function directory_emails()
returns table (id uuid, email text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, u.email::text
  from profiles p
  join auth.users u on u.id = p.id
  where has_app('/directory')
$$;

revoke all on function directory_emails() from public, anon;
grant execute on function directory_emails() to authenticated;

-- ---------------------------------------------------------------------
-- 7. Audit and updated_at
-- ---------------------------------------------------------------------
-- Both tables carry `id`, so audit_row() applies cleanly.

do $$
declare
  t text;
begin
  for t in select unnest(array['staff_departments', 'staff_details'])
  loop
    execute format('drop trigger if exists audit_%1$s on %1$I', t);
    execute format(
      'create trigger audit_%1$s after insert or update or delete on %1$I '
      'for each row execute function audit_row()', t);
    execute format('drop trigger if exists set_updated_at on %1$I', t);
    execute format(
      'create trigger set_updated_at before update on %1$I '
      'for each row execute function set_updated_at()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 8. Assert what this file claimed
-- ---------------------------------------------------------------------
-- Fails loudly rather than reporting success on a half-applied change.

do $$
declare
  v int;
begin
  -- The grant slug was already known. Assert rather than extend — see the
  -- header.
  if not exists (
    select 1 from pg_constraint
    where conname = 'user_apps_app_known'
      and pg_get_constraintdef(oid) like '%''/directory''%'
  ) then
    raise exception '0060: /directory is missing from user_apps_app_known';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'role_apps_app_known'
      and pg_get_constraintdef(oid) like '%''/directory''%'
  ) then
    raise exception '0060: /directory is missing from role_apps_app_known';
  end if;

  -- Ten departments, all on.
  select count(*) into v from staff_departments where is_active;
  if v < 10 then
    raise exception '0060: expected 10 active staff_departments, found %', v;
  end if;

  -- Relay's list is untouched — decision 4.
  select count(*) into v from pusher_departments;
  if v < 6 then
    raise exception '0060: pusher_departments has % rows — Relay''s list was disturbed', v;
  end if;

  -- Every account has a card.
  select count(*) into v
  from profiles p left join staff_details s on s.id = p.id
  where s.id is null;
  if v <> 0 then
    raise exception '0060: % profiles have no staff_details row', v;
  end if;

  -- RLS on, both tables.
  select count(*) into v from pg_class
  where relname in ('staff_details', 'staff_departments') and relrowsecurity;
  if v <> 2 then
    raise exception '0060: row level security is not on for both tables (% of 2)', v;
  end if;

  -- EXACTLY ONE select policy on staff_details. The "never a second
  -- SELECT policy" rule, made checkable rather than remembered.
  select count(*) into v from pg_policies
  where schemaname = 'public' and tablename = 'staff_details' and cmd = 'SELECT';
  if v <> 1 then
    raise exception '0060: staff_details has % SELECT policies, expected 1', v;
  end if;

  -- No INSERT or DELETE policy on staff_details — see §3.
  select count(*) into v from pg_policies
  where schemaname = 'public' and tablename = 'staff_details'
    and cmd in ('INSERT', 'DELETE');
  if v <> 0 then
    raise exception '0060: staff_details has % INSERT/DELETE policies, expected 0', v;
  end if;

  -- The email surface is not reachable without a session.
  if has_function_privilege('anon', 'public.directory_emails()', 'execute')
     or has_function_privilege('public', 'public.directory_emails()', 'execute') then
    raise exception '0060: directory_emails() is executable by anon or public';
  end if;

  -- The guard is armed.
  select count(*) into v from pg_trigger
  where tgrelid = 'staff_details'::regclass and tgname = 'staff_details_guard';
  if v <> 1 then
    raise exception '0060: staff_details_guard trigger is missing';
  end if;

  -- The seeding trigger is armed on the shared table.
  select count(*) into v from pg_trigger
  where tgrelid = 'profiles'::regclass and tgname = 'profiles_seed_staff_details';
  if v <> 1 then
    raise exception '0060: profiles_seed_staff_details trigger is missing';
  end if;
end $$;
