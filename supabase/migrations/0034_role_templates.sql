-- Named roles: a bundle of apps and approval rights, assigned in one click.
--
-- Access has been per-person since 0003, which means setting up a new
-- site engineer is remembering which nine boxes the last one got. A role
-- is that list, named once: assign it and the person has the bundle;
-- edit it and everyone holding it changes with it.
--
-- THE MODEL: effective access = the role's bundle UNION the person's own
-- grants, computed at READ time, never copied. Two consequences worth
-- stating, because both were deliberate:
--   * Editing a role takes effect immediately for everyone holding it —
--     there is no stored copy to drift.
--   * A personal grant is additive, never subtractive. Someone whose job
--     is "Purchase, plus Inventory" gets the role and one extra tick;
--     there is no way to give a role and take something away, because a
--     hole in a bundle is a thing nobody can see when reading a screen.
--
-- THE CRITICAL PIECE is has_app(), which ~80 RLS policies across every
-- tool already call. Replacing that one function teaches all of them
-- about roles with zero policy edits. The new definition is a strict
-- SUPERSET for an active user — personal grants are still checked first
-- and unchanged — so every existing user_apps row keeps working by
-- construction, and nobody can lose access to anything they hold today.
--
-- profiles.role (admin/staff) is NOT touched: that is the admin flag,
-- a different question from "what does this person do here".
--
-- Re-runnable throughout.

-- ---------------------------------------------------------------------
-- 1. roles — the bundle itself
-- ---------------------------------------------------------------------
create table if not exists roles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- The approval rights ride along with the apps: "Accounts" means the
  -- Bills app AND the right to approve up to a number, in one thing to
  -- assign. Null limit = unlimited, exactly as in bill_approvers (0033).
  can_approve_indents boolean not null default false,
  can_approve_bills boolean not null default false,
  bill_approval_limit numeric check (bill_approval_limit is null or bill_approval_limit > 0),
  created_at timestamptz not null default now(),
  created_by uuid references profiles (id),
  updated_at timestamptz,
  updated_by uuid references profiles (id)
);

-- Case-insensitive uniqueness: "Purchase" and "purchase" are one role,
-- and two of them would be indistinguishable on screen.
create unique index if not exists roles_name_key on roles (lower(name));

create table if not exists role_apps (
  role_id uuid not null references roles (id) on delete cascade,
  app text not null,
  -- Surrogate id for audit_row(), the 0018 convention.
  id uuid not null default gen_random_uuid(),
  primary key (role_id, app)
);
create unique index if not exists role_apps_id_key on role_apps (id);

-- Mirrors user_apps_app_known (0030). ADDING A NEW TOOL NOW MEANS
-- EXTENDING BOTH CHECKS in the same migration — noted in CLAUDE.md.
alter table role_apps drop constraint if exists role_apps_app_known;
alter table role_apps add constraint role_apps_app_known check (app in (
  '/selections', '/budgets', '/masters', '/marathon',
  '/indents', '/purchase-orders', '/inventory', '/bills',
  '/directory', '/training',
  '/management-dashboard', '/project-management', '/design-management',
  '/client-relations', '/financial-management', '/business-planning'
));

-- on delete restrict, NOT set null: deleting a role somebody holds must
-- fail loudly rather than silently stripping their access. The UI turns
-- the FK error into "N people hold this role — move them first".
alter table profiles add column if not exists role_id uuid references roles (id) on delete restrict;
create index if not exists profiles_role_id_idx on profiles (role_id);

-- ---------------------------------------------------------------------
-- 2. RLS
-- ---------------------------------------------------------------------
-- Readable by any authenticated user, like indent_approvers (0019): the
-- dal reads a person's own bundle on every request, and has_app() must
-- see them. A bundle is not a secret — what it *contains* is the same
-- information the sidebar already shows its holder.
alter table roles enable row level security;
alter table role_apps enable row level security;

drop policy if exists "roles readable by authenticated users" on roles;
create policy "roles readable by authenticated users"
  on roles for select to authenticated using (true);
drop policy if exists "roles writable by admins" on roles;
create policy "roles writable by admins"
  on roles for insert to authenticated with check (is_admin());
drop policy if exists "roles updatable by admins" on roles;
create policy "roles updatable by admins"
  on roles for update to authenticated using (is_admin()) with check (is_admin());
drop policy if exists "roles deletable by admins" on roles;
create policy "roles deletable by admins"
  on roles for delete to authenticated using (is_admin());

drop policy if exists "role_apps readable by authenticated users" on role_apps;
create policy "role_apps readable by authenticated users"
  on role_apps for select to authenticated using (true);
drop policy if exists "role_apps writable by admins" on role_apps;
create policy "role_apps writable by admins"
  on role_apps for insert to authenticated with check (is_admin());
drop policy if exists "role_apps deletable by admins" on role_apps;
create policy "role_apps deletable by admins"
  on role_apps for delete to authenticated using (is_admin());

drop trigger if exists set_updated_at on roles;
create trigger set_updated_at before update on roles
  for each row execute function set_updated_at();

drop trigger if exists audit_roles on roles;
create trigger audit_roles after insert or update or delete on roles
  for each row execute function audit_row();
drop trigger if exists audit_role_apps on role_apps;
create trigger audit_role_apps after insert or update or delete on role_apps
  for each row execute function audit_row();

-- ---------------------------------------------------------------------
-- 3. has_app() learns about bundles — the one statement it all rides on
-- ---------------------------------------------------------------------
-- Strict superset of the 0032 definition: same active check, same
-- is_admin() short-circuit, same personal user_apps lookup, plus the
-- role bundle. Keeps security definer / stable / pinned search_path.
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
    is_admin()
    or exists (
      select 1 from user_apps ua where ua.user_id = auth.uid() and ua.app = slug
    )
    or exists (
      select 1
      from profiles p
      join role_apps ra on ra.role_id = p.role_id
      where p.id = auth.uid() and ra.app = slug
    )
  )
$$;

-- ---------------------------------------------------------------------
-- 4. Approval rights, personal ∪ role
-- ---------------------------------------------------------------------
-- Where both say something, the MORE GENEROUS wins: a null limit
-- (unlimited) beats any number, otherwise the larger. Being named
-- personally and holding a role that approves should never leave
-- someone able to approve less than either alone would allow.
create or replace function can_approve_indents(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from profiles p where p.id = uid and p.is_active)
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
  select exists (select 1 from profiles p where p.id = uid and p.is_active)
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

-- ---------------------------------------------------------------------
-- 5. The guards read the helpers instead of the tables
-- ---------------------------------------------------------------------
-- Verbatim from 0033/0019 except the approver tests, which now honour a
-- role's rights and its ceiling too.
create or replace function bills_guard()
returns trigger
language plpgsql
as $$
declare
  v_cap numeric;
begin
  if (new.project_id, new.plot_id, new.unit_id, new.scope_code, new.vendor_id,
      new.po_id, new.labour_contract_id, new.kind, new.bill_no, new.reference)
     is distinct from
     (old.project_id, old.plot_id, old.unit_id, old.scope_code, old.vendor_id,
      old.po_id, old.labour_contract_id, old.kind, old.bill_no, old.reference) then
    raise exception 'A bill''s anchor, vendor, scope and number are permanent';
  end if;

  if new.status = old.status then
    if old.status <> 'recorded' then
      raise exception 'A % bill can no longer be edited', old.status;
    end if;
    return new;
  end if;

  if old.status = 'recorded' and new.status = 'approved' then
    -- Self-approval allowed (founder decision): the recorder may sit on
    -- this list — no recorder <> approver check, deliberately.
    if not (is_admin() or can_approve_bills(auth.uid())) then
      raise exception 'Only a named bill approver or an admin can approve a bill';
    end if;
    if not is_admin() then
      v_cap := bill_approval_cap(auth.uid());
      if v_cap is not null and new.total_amount > v_cap then
        raise exception 'This bill is above your approval limit of %', v_cap;
      end if;
    end if;
    if new.approved_by is null or new.approved_at is null then
      raise exception 'Approving must record who approved and when';
    end if;
    if new.rejection_note is not null then
      raise exception 'Approving must clear the rejection note';
    end if;
    return new;
  end if;

  if old.status = 'approved' and new.status = 'recorded' then
    if not (is_admin() or can_approve_bills(auth.uid())) then
      raise exception 'Only a named bill approver or an admin can send a bill back';
    end if;
    if new.rejection_note is null or length(trim(new.rejection_note)) = 0 then
      raise exception 'Say what needs changing — a send-back needs a note';
    end if;
    if new.approved_by is not null or new.approved_at is not null then
      raise exception 'Sending back must clear the approval fields';
    end if;
    return new;
  end if;

  if old.status = 'approved' and new.status = 'paid' then
    if new.payment_ref is null or length(trim(new.payment_ref)) = 0 then
      raise exception 'Record the payment reference before marking this bill paid';
    end if;
    if new.paid_by is null or new.paid_at is null then
      raise exception 'Marking paid must record who paid and when';
    end if;
    return new;
  end if;

  raise exception 'Invalid bill status change: % -> %', old.status, new.status;
end $$;

create or replace function labour_contracts_guard()
returns trigger
language plpgsql
as $$
declare
  v_cap numeric;
begin
  if new.status = old.status then
    if old.status = 'approved'
       and (new.vendor_id, new.project_id, new.plot_id, new.unit_id,
            new.description, new.contract_value)
           is distinct from
           (old.vendor_id, old.project_id, old.plot_id, old.unit_id,
            old.description, old.contract_value) then
      raise exception 'An approved labour contract''s terms are permanent — deactivate it and record a new one';
    end if;
    return new;
  end if;

  if old.status = 'pending_approval' and new.status = 'approved' then
    if not (is_admin() or can_approve_bills(auth.uid())) then
      raise exception 'Only a named bill approver or an admin can approve a labour contract';
    end if;
    if not is_admin() then
      v_cap := bill_approval_cap(auth.uid());
      if v_cap is not null and new.contract_value > v_cap then
        raise exception 'This contract is above your approval limit of %', v_cap;
      end if;
    end if;
    if new.approved_by is null or new.approved_at is null then
      raise exception 'Approving must record who approved and when';
    end if;
    return new;
  end if;

  raise exception 'Invalid labour contract status change: % -> %', old.status, new.status;
end $$;

-- Indents: 0019 verbatim, except the single approver test in the
-- approve branch. The rejection branch deliberately has no approver
-- check in 0019 and keeps none here — this migration teaches the guards
-- about roles, it does not change who may do what.
create or replace function indents_guard()
returns trigger
language plpgsql
as $$
begin
  -- The number on the paper is permanent.
  if (new.project_id, new.indent_no, new.reference)
     is distinct from (old.project_id, old.indent_no, old.reference) then
    raise exception 'An indent''s project, number and reference are permanent';
  end if;

  if new.status = old.status then
    -- Header edits (plot, unit, stage, required_by, note) only while
    -- it's a draft.
    if old.status <> 'draft' then
      raise exception 'A % indent can no longer be edited', old.status;
    end if;
    return new;
  end if;

  if old.status = 'draft' and new.status = 'submitted' then
    -- The UPDATE's row lock serialises this count against concurrent
    -- line writes, which take FOR SHARE on this row (0019).
    if not exists (select 1 from indent_lines where indent_id = new.id) then
      raise exception 'Add at least one line before submitting this indent';
    end if;
    if new.submitted_by is null or new.submitted_at is null then
      raise exception 'Submitting must record who submitted and when';
    end if;
    if new.rejection_note is not null then
      raise exception 'Resubmitting must clear the rejection note';
    end if;
    return new;
  end if;

  if old.status = 'submitted' and new.status = 'approved' then
    if not (is_admin() or can_approve_indents(auth.uid())) then
      raise exception 'Only a named indent approver or an admin can approve an indent';
    end if;
    if new.approved_by is null or new.approved_at is null then
      raise exception 'Approving must record who approved and when';
    end if;
    return new;
  end if;

  if old.status = 'submitted' and new.status = 'draft' then
    -- A rejection: the reason is mandatory, and the submission record is
    -- cleared so a resubmit stamps fresh.
    if new.rejection_note is null or length(trim(new.rejection_note)) = 0 then
      raise exception 'Say what needs changing — a rejection needs a note';
    end if;
    if new.submitted_by is not null or new.submitted_at is not null
       or new.approved_by is not null or new.approved_at is not null then
      raise exception 'Rejecting must clear the submission and approval fields';
    end if;
    return new;
  end if;

  raise exception 'Invalid indent status change: % -> %', old.status, new.status;
end $$;

-- ---------------------------------------------------------------------
-- 6. profiles_guard() covers role_id, and admin_list_users() returns it
-- ---------------------------------------------------------------------
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

  -- The bundle assignment is an access decision like any other.
  if new.role_id is distinct from old.role_id
     and auth.uid() is not null
     and not is_admin() then
    raise exception 'Only an admin can change someone''s role';
  end if;

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

drop function if exists admin_list_users();

create function admin_list_users()
returns table (
  id uuid,
  email text,
  full_name text,
  role text,
  team text,
  is_active boolean,
  role_id uuid
)
language sql
security definer
set search_path = public
as $$
  select p.id, u.email::text, p.full_name, p.role, p.team, p.is_active, p.role_id
  from profiles p
  join auth.users u on u.id = p.id
  where is_admin()
  order by p.full_name nulls last, u.email
$$;

revoke all on function admin_list_users() from public, anon;
grant execute on function admin_list_users() to authenticated;
