-- Behaviour trial for 0158 — category leads, a villa's own stage owner, and indents raised for a stage. Runs inside the
-- dry-run transaction; always rolled back. The writes run UNDER ROW-LEVEL SECURITY as the staff account holding one
-- grant at a time (BUGCATCHER #19).
--
--   npx tsx scripts/dry-run-migrations.ts --project ipstebqawrvhkyntctrv \
--     supabase/migrations/0158_*.sql --trial scripts/trials/stage-owners.sql
do $trial$
declare
  v_user uuid := (select id from auth.users where email = 'siddharth.cyriac.99@gmail.com');
  s_user uuid := gen_random_uuid();
  v_other uuid := (select id from profiles where id <> (select id from auth.users where email = 'siddharth.cyriac.99@gmail.com') and is_active order by full_name limit 1);
  v_category uuid := (select id from work_categories where is_active order by sort_order limit 1);
  v_group uuid := (select id from work_groups where is_active order by sort_order, code limit 1);
  v_work uuid := (select id from work_items where is_active order by code limit 1);
  v_project uuid := (select id from projects where code is not null order by name limit 1);
  v_plot uuid;
  v_indent uuid;
  v_refused boolean;
  v_n int;
begin
  select id into v_plot from plots where project_id = v_project order by name limit 1;
  if v_user is null or v_other is null or v_category is null or v_group is null or v_plot is null then
    raise exception 'TRIAL SETUP: staging is missing a person, a category, a stage or a plot';
  end if;
  insert into auth_verified_sessions (session_id, user_id, method) values (s_user, v_user, 'otp');
  update profiles set role_id = null where id = v_user;
  delete from user_apps where user_id = v_user;
  perform set_config('request.jwt.claims', json_build_object('sub', v_user,
    'role', 'authenticated', 'session_id', s_user)::text, true);

  -- 1. Without /supervisors, a category lead can be neither read nor set.
  insert into user_apps (user_id, app) values (v_user, '/indents');
  set local role authenticated;
  v_refused := false;
  begin
    insert into site_category_owners (category_id, owner_id) values (v_category, v_other);
  exception when insufficient_privilege then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 1 FAILED: an /indents person set a category lead'; end if;
  reset role;

  -- 2. With /supervisors: set a lead, change it, take it off; give a villa's stage its own owner.
  delete from user_apps where user_id = v_user;
  insert into user_apps (user_id, app) values (v_user, '/supervisors');
  set local role authenticated;
  insert into site_category_owners (category_id, owner_id, created_by, updated_by)
  values (v_category, v_other, v_user, v_user);
  update site_category_owners set owner_id = v_user where category_id = v_category;
  select count(*) into v_n from site_category_owners where category_id = v_category and owner_id = v_user;
  if v_n <> 1 then raise exception 'TRIAL 2 FAILED: the lead did not change'; end if;
  delete from site_category_owners where category_id = v_category;
  select count(*) into v_n from site_category_owners where category_id = v_category;
  if v_n <> 0 then raise exception 'TRIAL 2 FAILED: the lead could not be taken off'; end if;
  insert into site_stages (plot_id, work_group_id, owner_id, created_by, updated_by)
  values (v_plot, v_group, v_other, v_user, v_user)
  on conflict (plot_id, work_group_id) do update set owner_id = excluded.owner_id;
  if (select owner_id from site_stages where plot_id = v_plot and work_group_id = v_group) is distinct from v_other then
    raise exception 'TRIAL 2 FAILED: the stage owner was not kept';
  end if;
  reset role;

  -- 3. An indent names a stage or a work, never both.
  delete from user_apps where user_id = v_user;
  insert into user_apps (user_id, app) values (v_user, '/indents');
  set local role authenticated;
  v_indent := create_indent(v_project, v_plot, null, null, null, null);
  update indents set work_group_id = v_group where id = v_indent;
  if (select work_group_id from indents where id = v_indent) is distinct from v_group then
    raise exception 'TRIAL 3 FAILED: the stage was not kept on the indent';
  end if;
  v_refused := false;
  begin
    update indents set work_item_id = v_work where id = v_indent;
  exception when check_violation then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 3 FAILED: an indent took a stage and a work'; end if;

  reset role;
  raise exception 'ALL TRIALS PASSED';
end $trial$;
