-- 0158 — Stage owners, and indents raised for a stage (plan.md, the team's additions, D).
--
-- 1. site_category_owners: each work category's lead (MEP → one person, Carpentry → another), set on Supervisors →
--    Sequence. site_stages.owner_id overrides it on one villa's stage. A stage's owner is the override, else its
--    category's lead; the app works that out, nothing stores it twice. Owners are people, not grants: an owner without
--    /supervisors simply cannot open the tool.
-- 2. indents.work_group_id: an indent is raised for a stage (a work group, as Supervisors' programme counts stages)
--    rather than one work, and its estimate pull offers every work of that stage. An older indent keeps its work; an
--    indent names a work or a stage, never both. indents_guard already freezes every header field once past draft.

-- 1 ------------------------------------------------------------------------------------------------------
create table if not exists site_category_owners (
  category_id uuid primary key references work_categories (id),
  owner_id uuid not null references profiles (id),
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table site_category_owners enable row level security;
revoke all on site_category_owners from public, anon;

drop trigger if exists audit_site_category_owners on site_category_owners;
create trigger audit_site_category_owners after insert or update or delete on site_category_owners
  for each row execute function audit_row();
drop trigger if exists set_updated_at on site_category_owners;
create trigger set_updated_at before update on site_category_owners
  for each row execute function set_updated_at();

-- Edited freely by the site team, as the sequence is: a lead is set, changed or taken off.
drop policy if exists "site_category_owners readable by supervisors app" on site_category_owners;
create policy "site_category_owners readable by supervisors app" on site_category_owners
  for select to authenticated using ((select has_app('/supervisors')));
drop policy if exists "site_category_owners insertable by supervisors app" on site_category_owners;
create policy "site_category_owners insertable by supervisors app" on site_category_owners
  for insert to authenticated with check ((select has_app('/supervisors')));
drop policy if exists "site_category_owners updatable by supervisors app" on site_category_owners;
create policy "site_category_owners updatable by supervisors app" on site_category_owners
  for update to authenticated using ((select has_app('/supervisors'))) with check ((select has_app('/supervisors')));
drop policy if exists "site_category_owners deletable by supervisors app" on site_category_owners;
create policy "site_category_owners deletable by supervisors app" on site_category_owners
  for delete to authenticated using ((select has_app('/supervisors')));

alter table site_stages add column if not exists owner_id uuid references profiles (id);
create index if not exists site_stages_owner on site_stages (owner_id) where owner_id is not null;

-- 2 ------------------------------------------------------------------------------------------------------
alter table indents add column if not exists work_group_id uuid references work_groups (id);
create index if not exists indents_work_group on indents (work_group_id) where work_group_id is not null;
alter table indents drop constraint if exists indents_work_or_stage;
alter table indents add constraint indents_work_or_stage
  check (work_item_id is null or work_group_id is null);

-- Checks ---------------------------------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_class where relname = 'site_category_owners' and relrowsecurity) then
    raise exception '0158: site_category_owners has RLS off';
  end if;
  if has_table_privilege('anon', 'site_category_owners', 'select') then
    raise exception '0158: anon can read site_category_owners';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_name = 'site_stages' and column_name = 'owner_id')
     or not exists (select 1 from information_schema.columns
                     where table_name = 'indents' and column_name = 'work_group_id') then
    raise exception '0158: a column is missing';
  end if;
end $$;
