-- 0142 — Test projects, and one button that deletes one (plan.md, piece 3).
-- A definer that deletes across every tool; the founder waived Fable's review for it, and an independent review stands in.
--
--   projects.is_test — a project made for trying the tools. Only the database owner sets or clears it (the seed script):
--     projects_is_test_guard refuses any client role, whatever its grant.
--   delete_test_project(project) — admin only (is_admin() carries session_is_verified()), and only a project marked test.
--     It finds every row that hangs off the project through the foreign keys, and refuses — deleting nothing — when any of
--     them is setup (people, vendors, items, works…), also belongs to something that stays (a real PO that gathered a test
--     indent line), has an uploaded file, or is the target of a Relay link outside the project. It takes every lock it needs
--     at once and gives up at once when someone is saving, puts back a budgeting rate a test PO raised while nothing has
--     moved it since, sets the tools' own guards aside for those tables only (the audit triggers and the foreign keys stay
--     on), deletes children first, and returns the rows deleted per table.

alter table projects add column if not exists is_test boolean not null default false;

create or replace function projects_is_test_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon')
     and (case when tg_op = 'INSERT' then new.is_test else new.is_test is distinct from old.is_test end) then
    raise exception 'Only the seed script marks a project as a test project.';
  end if;
  return new;
end $$;

drop trigger if exists projects_is_test_guard on projects;
create trigger projects_is_test_guard before insert or update on projects
  for each row execute function projects_is_test_guard();

revoke all on function projects_is_test_guard() from public, anon, authenticated;

create or replace function delete_test_project(p_project uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  -- Rows a test project's records may point at and leave standing; reaching one as a row to delete is refused — except a
  -- store the test project owns. A test record in a real store goes with the project: that stock was never real.
  v_setup constant text[] := array[
    'profiles', 'vendors', 'vendor_payment_details', 'items', 'item_categories', 'brands', 'gst_rates', 'uoms',
    'clients', 'companies', 'stores', 'roles', 'role_apps', 'user_apps', 'tool_teams', 'tool_team_apps', 'tool_leads',
    'work_categories', 'work_groups', 'work_items', 'construction_stages', 'progress_stages', 'design_stages',
    'space_types', 'document_terms', 'drawing_sets', 'drawing_set_works', 'checklist_templates',
    'checklist_template_items', 'checklist_template_groups', 'site_sequence', 'site_schedule_settings',
    'estimator_uoms', 'estimator_work_info', 'estimator_mixes', 'estimator_mix_components', 'estimator_materials',
    'estimator_work_components', 'work_order_templates', 'work_order_template_lines', 'pusher_activities',
    'pusher_departments', 'pusher_trail_sets', 'pusher_trail_set_items', 'staff_departments', 'staff_details'];
  v_name text;
  v_fk record;
  v_added bigint;
  v_n bigint;
  v_tables text[];
  v_left text[];
  v_guards text[];
  v_pass int;
  v_counts jsonb := '{}'::jsonb;
  v_tangled text;
begin
  if not is_admin() then
    raise exception 'Only an admin can delete a test project.';
  end if;
  if not exists (select 1 from projects where id = p_project and is_test) then
    raise exception 'That project is not marked as a test project, so it cannot be deleted here.';
  end if;

  create temp table if not exists test_doomed (tbl text, id uuid, primary key (tbl, id)) on commit drop;
  truncate test_doomed;
  insert into test_doomed values ('projects', p_project);

  -- 1. Every row that points at a doomed row, until nothing new turns up. A key that empties itself when its parent goes
  --    (set null) is left to do that — except a store's project, which is how the test project's stores are found.
  loop
    v_added := 0;
    for v_fk in
      select c.conrelid::regclass::text as child, c.confrelid::regclass::text as parent,
             array(select a.attname::text from unnest(c.conkey) with ordinality k(n, i)
                   join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.n order by k.i) as child_cols,
             array(select a.attname::text from unnest(c.confkey) with ordinality k(n, i)
                   join pg_attribute a on a.attrelid = c.confrelid and a.attnum = k.n order by k.i) as parent_cols
        from pg_constraint c
       where c.contype = 'f' and c.connamespace = 'public'::regnamespace
         and c.confrelid::regclass::text in (select distinct tbl from test_doomed)
         and (c.confdeltype not in ('n', 'd') or c.conrelid = 'stores'::regclass)
    loop
      if not exists (select 1 from pg_attribute where attrelid = v_fk.child::regclass and attname = 'id' and not attisdropped) then
        -- Counters and other keyless rows: deleted by the key they share with the doomed row, at the end.
        continue;
      end if;
      execute format(
        'insert into test_doomed select %L, c.id from %I c where (%s) in (select %s from %I p where p.id in (select id from test_doomed where tbl = %L)) on conflict do nothing',
        v_fk.child, v_fk.child,
        (select string_agg(format('c.%I', col), ', ') from unnest(v_fk.child_cols) col),
        (select string_agg(format('p.%I', col), ', ') from unnest(v_fk.parent_cols) col),
        v_fk.parent, v_fk.parent);
      get diagnostics v_n = row_count;
      v_added := v_added + v_n;
    end loop;
    exit when v_added = 0;
  end loop;

  -- 2. Never setup.
  select string_agg(distinct tbl, ', ') into v_tangled
    from test_doomed where tbl = any(v_setup) and tbl <> 'stores';
  if v_tangled is not null then
    raise exception 'Deleting this project would delete setup (%). Nothing was deleted.', v_tangled;
  end if;

  -- 3. Nothing that also belongs to something staying: every row a doomed row points at is doomed too, or is setup.
  for v_fk in
    select c.conrelid::regclass::text as child, c.confrelid::regclass::text as parent,
           array(select a.attname::text from unnest(c.conkey) with ordinality k(n, i)
                 join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.n order by k.i) as child_cols,
           array(select a.attname::text from unnest(c.confkey) with ordinality k(n, i)
                 join pg_attribute a on a.attrelid = c.confrelid and a.attnum = k.n order by k.i) as parent_cols
      from pg_constraint c
     where c.contype = 'f' and c.connamespace = 'public'::regnamespace
       and c.conrelid::regclass::text in (select distinct tbl from test_doomed)
       and not (c.confrelid::regclass::text = any(v_setup))
       and (select relnamespace from pg_class where oid = c.confrelid) = 'public'::regnamespace
       and c.confdeltype not in ('n', 'd')
  loop
    execute format(
      'select count(*) from %I c join %I p on (%s) where c.id in (select id from test_doomed where tbl = %L) and p.id not in (select id from test_doomed where tbl = %L)',
      v_fk.child, v_fk.parent,
      (select string_agg(format('c.%I = p.%I', cc, pc), ' and ')
         from unnest(v_fk.child_cols, v_fk.parent_cols) as u(cc, pc)),
      v_fk.child, v_fk.parent)
      into v_n;
    if v_n > 0 then
      raise exception 'Some of this project''s records are also part of records outside it (% in %). Nothing was deleted.',
        replace(v_fk.child, '_', ' '), replace(v_fk.parent, '_', ' ');
    end if;
  end loop;

  -- 4. Nothing the database cannot take back on its own: uploaded files, and Relay links from outside.
  if exists (select 1 from test_doomed where tbl in ('drawing_revision_files', 'space_views'))
     or exists (select 1 from site_checklists where id in (select id from test_doomed where tbl = 'site_checklists')
                and attachment_path is not null)
     or exists (select 1 from site_checklist_items where id in (select id from test_doomed where tbl = 'site_checklist_items')
                and photo_path is not null) then
    raise exception 'This test project has uploaded files (drawings, photos or attachments). Remove them first. Nothing was deleted.';
  end if;
  if exists (select 1 from pusher_chain_links l
              where l.target_id in (select id from test_doomed)
                and l.id not in (select id from test_doomed where tbl = 'pusher_chain_links')) then
    raise exception 'A Relay chain outside this project links to one of its records. Nothing was deleted.';
  end if;

  -- 5. Every lock at once, giving up at once when someone is saving: no queue behind the team, no deadlock.
  select array_agg(distinct tbl order by tbl) into v_tables from test_doomed;
  begin
    foreach v_name in array v_tables || array['items', 'transmittal_counters'] loop
      execute format('lock table %I in share row exclusive mode nowait', v_name);
    end loop;
  exception when lock_not_available then
    raise exception 'Someone is saving in the tools right now. Try again in a minute. Nothing was deleted.';
  end;

  -- 6. A budgeting rate a test PO raised goes back — only while it still stands at that PO's rate, and back to where the
  --    last real change left it.
  update items i set indicative_price = back.old_price
    from (select distinct on (ch.item_id) ch.item_id, ch.old_price
            from item_price_changes ch
           where ch.id in (select id from test_doomed where tbl = 'item_price_changes')
             and ch.changed_at > coalesce((select max(r.changed_at) from item_price_changes r
                                            where r.item_id = ch.item_id
                                              and r.id not in (select id from test_doomed where tbl = 'item_price_changes')),
                                          '-infinity')
           order by ch.item_id, ch.changed_at, ch.id) back
   where i.id = back.item_id
     and i.indicative_price = (select ch.new_price from item_price_changes ch where ch.item_id = i.id
                                order by ch.changed_at desc, ch.id desc limit 1)
     and (select ch.id from item_price_changes ch where ch.item_id = i.id order by ch.changed_at desc, ch.id desc limit 1)
         in (select id from test_doomed where tbl = 'item_price_changes');

  -- 7. Delete. The tools' guards on these tables are set aside by name; the audit triggers and the foreign keys stay on.
  --    Children first: a table still pointed at waits for the next pass.
  select array_agg(format('%s.%s', c.relname, t.tgname)) into v_guards
    from pg_trigger t join pg_class c on c.oid = t.tgrelid
   where c.relnamespace = 'public'::regnamespace and c.relname = any(v_tables)
     and not t.tgisinternal and t.tgenabled = 'O' and t.tgname not like 'audit%';
  foreach v_name in array coalesce(v_guards, '{}') loop
    execute format('alter table %I disable trigger %I', split_part(v_name, '.', 1), split_part(v_name, '.', 2));
  end loop;
  delete from transmittal_counters
   where scope in (select id::text from test_doomed where tbl = 'units');
  v_left := v_tables;
  for v_pass in 1 .. array_length(v_tables, 1) + 1 loop
    exit when coalesce(array_length(v_left, 1), 0) = 0;
    foreach v_name in array v_left loop
      begin
        -- Keyless rows (counters) hanging off a doomed row go with it.
        for v_fk in
          select c.conrelid::regclass::text as child,
                 array(select a.attname::text from unnest(c.conkey) with ordinality k(n, i)
                       join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.n order by k.i) as child_cols,
                 array(select a.attname::text from unnest(c.confkey) with ordinality k(n, i)
                       join pg_attribute a on a.attrelid = c.confrelid and a.attnum = k.n order by k.i) as parent_cols
            from pg_constraint c
           where c.contype = 'f' and c.connamespace = 'public'::regnamespace
             and c.confrelid::regclass::text = v_name
             and not exists (select 1 from pg_attribute where attrelid = c.conrelid and attname = 'id' and not attisdropped)
        loop
          execute format('delete from %I c where (%s) in (select %s from %I p where p.id in (select id from test_doomed where tbl = %L))',
            v_fk.child,
            (select string_agg(format('c.%I', col), ', ') from unnest(v_fk.child_cols) col),
            (select string_agg(format('p.%I', col), ', ') from unnest(v_fk.parent_cols) col),
            v_name, v_name);
        end loop;
        execute format('delete from %I where id in (select id from test_doomed where tbl = %L)', v_name, v_name);
        get diagnostics v_n = row_count;
        v_counts := v_counts || jsonb_build_object(v_name, v_n);
        v_left := array_remove(v_left, v_name);
      exception when foreign_key_violation then
        null;
      end;
    end loop;
  end loop;
  foreach v_name in array coalesce(v_guards, '{}') loop
    execute format('alter table %I enable trigger %I', split_part(v_name, '.', 1), split_part(v_name, '.', 2));
  end loop;
  if coalesce(array_length(v_left, 1), 0) > 0 then
    raise exception 'Records outside the test project still point at it (%). Nothing was deleted.',
      replace(array_to_string(v_left, ', '), '_', ' ');
  end if;
  return v_counts;
end $$;

revoke all on function delete_test_project(uuid) from public, anon;
grant execute on function delete_test_project(uuid) to authenticated;

do $$
begin
  if not (select prosecdef from pg_proc where oid = 'delete_test_project(uuid)'::regprocedure) then
    raise exception '0142: delete_test_project must run as the owner to set the guards aside';
  end if;
  if has_function_privilege('anon', 'delete_test_project(uuid)', 'execute') then
    raise exception '0142: delete_test_project is executable by anon';
  end if;
  if position('is_admin()' in pg_get_functiondef('delete_test_project(uuid)'::regprocedure)) = 0
     or position('is_test' in pg_get_functiondef('delete_test_project(uuid)'::regprocedure)) = 0 then
    raise exception '0142: delete_test_project must check the admin and the test mark';
  end if;
  if (select prosecdef from pg_proc where oid = 'projects_is_test_guard()'::regprocedure) then
    raise exception '0142: projects_is_test_guard must run as the caller';
  end if;
end $$;
