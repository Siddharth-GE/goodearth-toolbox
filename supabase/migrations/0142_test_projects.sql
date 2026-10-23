-- 0142 — Test projects, and one button that deletes one (plan.md, piece 3; founder 2026-10-23: "make a test project and
-- populate the whole chain … and one big red delete button to clear it all").
-- A definer function that deletes across every tool: Fable reviews before it is applied, unless the founder waives it.
--
--   projects.is_test — a project made for trying the tools. Set by the database owner (the seed script), never from the app:
--     no policy or action writes it.
--   delete_test_project(project) — admin only (is_admin() carries session_is_verified()), and only a project marked test. It
--     finds every row that hangs off the project through the foreign keys, refuses when any of them also belongs to something
--     that stays (a real PO that gathered a test indent line), refuses to touch setup (people, vendors, items, works…), puts
--     back a budgeting rate a test PO raised, then deletes with the tools' own guards set aside for those tables only — the
--     foreign keys stay checked, so a real row still pointing at a test one stops the whole delete. Returns the rows deleted
--     per table.

alter table projects add column if not exists is_test boolean not null default false;

create or replace function delete_test_project(p_project uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Rows a test project's records may point at and leave standing. Reaching one of these as a row to delete is refused.
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
  v_pass int;
  v_counts jsonb := '{}'::jsonb;
  v_tangled text;
begin
  if not is_admin() then
    raise exception 'Only an admin can delete a test project.';
  end if;
  select name into v_name from projects where id = p_project and is_test;
  if v_name is null then
    raise exception 'That project is not marked as a test project, so it cannot be deleted here.';
  end if;

  create temp table if not exists test_doomed (tbl text, id uuid, primary key (tbl, id)) on commit drop;
  delete from test_doomed;
  insert into test_doomed values ('projects', p_project);

  -- 1. Every row that points at a doomed row, until nothing new turns up.
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

  -- 2. Never setup — a store the test project owns is its own and goes with it.
  select string_agg(distinct tbl, ', ') into v_tangled from test_doomed where tbl = any(v_setup) and tbl <> 'stores';
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
  loop
    execute format(
      'select count(*) from %I c join %I p on (%s) where c.id in (select id from test_doomed where tbl = %L) and p.id not in (select id from test_doomed where tbl = %L)',
      v_fk.child, v_fk.parent,
      (select string_agg(format('c.%I = p.%I', cc, pc), ' and ')
         from unnest(v_fk.child_cols, v_fk.parent_cols) as u(cc, pc)),
      v_fk.child, v_fk.parent)
      into v_n;
    if v_n > 0 then
      raise exception 'Some % rows of this project also belong to a % row that is not part of it. Nothing was deleted.',
        v_fk.child, v_fk.parent;
    end if;
  end loop;

  -- 4. A budgeting rate a test PO raised goes back, where that PO's change is the item's latest.
  update items i set indicative_price = first.old_price
    from (select distinct on (ch.item_id) ch.item_id, ch.old_price
            from item_price_changes ch
           where ch.id in (select id from test_doomed where tbl = 'item_price_changes')
           order by ch.item_id, ch.changed_at, ch.id) first
   where i.id = first.item_id
     and (select ch.id from item_price_changes ch where ch.item_id = i.id order by ch.changed_at desc, ch.id desc limit 1)
         in (select id from test_doomed where tbl = 'item_price_changes');

  -- 5. Delete, the tools' guards set aside for these tables only; the foreign keys still checked. Children first: a table
  --    still pointed at waits for the next pass.
  select array_agg(distinct tbl) into v_tables from test_doomed;
  foreach v_name in array v_tables loop
    execute format('alter table %I disable trigger user', v_name);
  end loop;
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
  foreach v_name in array v_tables loop
    execute format('alter table %I enable trigger user', v_name);
  end loop;
  if coalesce(array_length(v_left, 1), 0) > 0 then
    raise exception 'Rows outside the test project still point at it (%). Nothing was deleted.', array_to_string(v_left, ', ');
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
end $$;
