-- 0150 — Delete or Cancel, step F (plan.md, Piece 4): a master nothing uses is deleted, by an admin and nobody else.
--
-- One that is used keeps its Active switch (retire). Most links already refuse a delete on their own; the five that
-- would blank a column or take rows with them (brands→items, clients→units, projects→stores, items→item_margins,
-- units→spaces) are refused by a guard instead. A unit and a project are each seeded rows of their own (a Client
-- Relations record and schedule; a Relay plan and stages): those go with it only while nobody has changed them since.
-- GST rates stay switch-off only: items and lines carry the rate as a number, not a key.

-- ---------------------------------------------------------------------
-- 1. The guards
-- ---------------------------------------------------------------------
-- Definer: "is it used" must see rows the caller's grants cannot (BUGCATCHER #19). Arguments: what the row is called,
-- then (table, column, who uses it) per link.

create or replace function masters_delete_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  i int := 1;
  v_used boolean;
begin
  while i + 2 < tg_nargs loop
    execute format('select exists (select 1 from %I where %I = $1)', tg_argv[i], tg_argv[i + 1])
      into v_used using old.id;
    if v_used then
      raise exception '% use this %, so it cannot be deleted', tg_argv[i + 2], tg_argv[0];
    end if;
    i := i + 3;
  end loop;
  return old;
end $$;

revoke all on function masters_delete_guard() from public, anon, authenticated;

drop trigger if exists brands_delete_guard on brands;
create trigger brands_delete_guard before delete on brands
  for each row execute function masters_delete_guard('brand', 'items', 'brand_id', 'Items');
drop trigger if exists clients_delete_guard on clients;
create trigger clients_delete_guard before delete on clients
  for each row execute function masters_delete_guard('client', 'units', 'client_id', 'Units');
drop trigger if exists items_delete_guard on items;
create trigger items_delete_guard before delete on items
  for each row execute function masters_delete_guard('item', 'item_margins', 'item_id', 'Budget margins');

-- A seeded row is made in its parent's own transaction, so it is untouched exactly while updated_at = created_at and
-- created_at is its parent's: any later edit, or a row added later, moves one of them.

-- A unit: never one reserved, sold or with a buyer, or with rooms. Its seeded Client Relations record and payment
-- schedule go with it while nobody has changed either; that record's receipts and actions still refuse by their keys.
create or replace function units_delete_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_engagement uuid;
begin
  if old.client_id is not null or old.status <> 'available' then
    raise exception 'This unit is reserved or sold, so it cannot be deleted';
  end if;
  if exists (select 1 from spaces where unit_id = old.id) then
    raise exception 'Selections'' rooms use this unit, so it cannot be deleted';
  end if;
  select id into v_engagement from client_engagements where unit_id = old.id;
  if v_engagement is not null then
    if exists (select 1 from client_engagements e
                where e.id = v_engagement
                  and (e.updated_at <> e.created_at or e.created_at <> old.created_at))
       or exists (select 1 from client_payment_milestones m
                   where m.engagement_id = v_engagement
                     and (m.updated_at <> m.created_at or m.created_at <> old.created_at)) then
      raise exception 'Client Relations has details on this unit, so it cannot be deleted';
    end if;
    delete from client_engagements where id = v_engagement;
  end if;
  return old;
end $$;

revoke all on function units_delete_guard() from public, anon, authenticated;

-- A project: never one with a store. Its seeded Relay plan and stages go with it while nobody has changed them or
-- added a stage.
create or replace function projects_delete_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from stores where project_id = old.id) then
    raise exception 'Stores use this project, so it cannot be deleted';
  end if;
  if exists (select 1 from pusher_chains where project_id = old.id) then
    raise exception 'Relay trails use this project, so it cannot be deleted';
  end if;
  if exists (select 1 from pusher_project_plans p
              where p.project_id = old.id
                and (p.updated_at <> p.created_at or p.created_at <> old.created_at))
     or exists (select 1 from project_stages s
                 where s.project_id = old.id
                   and (s.updated_at <> s.created_at or s.created_at <> old.created_at)) then
    raise exception 'Relay has a schedule on this project, so it cannot be deleted';
  end if;
  delete from project_stages where project_id = old.id;
  delete from pusher_project_plans where project_id = old.id;
  return old;
end $$;

revoke all on function projects_delete_guard() from public, anon, authenticated;

drop trigger if exists projects_delete_guard on projects;
create trigger projects_delete_guard before delete on projects
  for each row execute function projects_delete_guard();

drop trigger if exists units_delete_guard on units;
create trigger units_delete_guard before delete on units
  for each row execute function units_delete_guard();

-- ---------------------------------------------------------------------
-- 2. One delete policy per master: admins only
-- ---------------------------------------------------------------------
-- The six that had a Masters-grant delete (with no button behind it) are narrowed to the same rule.

do $$
declare
  t text;
begin
  foreach t in array array[
    'construction_stages', 'progress_stages', 'uoms', 'work_categories', 'work_groups', 'work_items'
  ] loop
    execute format('drop policy if exists %I on %I', t || ' deletable by masters app', t);
  end loop;

  foreach t in array array[
    'projects', 'plots', 'units', 'clients', 'vendors', 'items', 'stores', 'companies', 'document_terms',
    'item_categories', 'brands',
    'construction_stages', 'progress_stages', 'uoms', 'work_categories', 'work_groups', 'work_items'
  ] loop
    execute format('drop policy if exists %I on %I', t || ' deletable by admins', t);
    execute format(
      'create policy %I on %I for delete to authenticated using ((select is_admin()))',
      t || ' deletable by admins', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Prove it landed
-- ---------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'projects', 'plots', 'units', 'clients', 'vendors', 'items', 'stores', 'companies', 'document_terms',
    'item_categories', 'brands',
    'construction_stages', 'progress_stages', 'uoms', 'work_categories', 'work_groups', 'work_items'
  ] loop
    if not (select relrowsecurity from pg_class where oid = t::regclass) then
      raise exception '0150: RLS is off on %', t;
    end if;
    if (select count(*) from pg_policies where schemaname = 'public' and tablename = t and cmd = 'DELETE') <> 1
       or (select qual from pg_policies where schemaname = 'public' and tablename = t and cmd = 'DELETE')
          is distinct from '( SELECT is_admin() AS is_admin)'
       or exists (select 1 from pg_policies
                   where schemaname = 'public' and tablename = t and (cmd = 'ALL' or 'anon' = any (roles))) then
      raise exception '0150: % should have exactly one delete policy, admins only', t;
    end if;
  end loop;

  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'gst_rates' and cmd = 'DELETE') then
    raise exception '0150: gst_rates must stay without a delete';
  end if;

  foreach t in array array['brands', 'clients', 'projects', 'items', 'units'] loop
    if not exists (select 1 from pg_trigger
                    where tgrelid = t::regclass and tgname = t || '_delete_guard' and tgenabled <> 'D') then
      raise exception '0150: % has no delete guard', t;
    end if;
  end loop;

  foreach t in array array['masters_delete_guard()', 'units_delete_guard()', 'projects_delete_guard()'] loop
    if not (select prosecdef from pg_proc where oid = t::regprocedure) then
      raise exception '0150: % must be security definer', t;
    end if;
    if not exists (select 1 from pg_proc p, unnest(coalesce(p.proconfig, '{}')) c
                    where p.oid = t::regprocedure and c like 'search_path=%') then
      raise exception '0150: % has no pinned search_path', t;
    end if;
    if has_function_privilege('anon', t, 'execute') or has_function_privilege('authenticated', t, 'execute') then
      raise exception '0150: a client role can execute %', t;
    end if;
  end loop;

  -- Every link from a master that blanks or cascades is one a guard covers.
  if exists (
    select 1 from pg_constraint k
     where k.contype = 'f' and k.confdeltype in ('c', 'n', 'd')
       and k.confrelid::regclass::text = any (array[
         'projects', 'plots', 'units', 'clients', 'vendors', 'items', 'stores', 'companies', 'document_terms',
         'item_categories', 'brands',
         'construction_stages', 'progress_stages', 'uoms', 'work_categories', 'work_groups', 'work_items'])
       and (k.confrelid::regclass::text, k.conrelid::regclass::text) not in (
         ('brands', 'items'), ('clients', 'units'), ('projects', 'stores'), ('items', 'item_margins'),
         ('units', 'spaces'))
  ) then
    raise exception '0150: a master has a cascading or blanking link no guard covers';
  end if;
end $$;
