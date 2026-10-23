-- Behaviour trial for the checklist runner's writes (plan.md phase C, no migration): a photo on one check, and the stages a
-- checklist inspects. Runs inside the dry-run transaction; always rolled back, UNDER ROW-LEVEL SECURITY (BUGCATCHER #19), as
-- the staff account made /supervisors-only, then as the probe, who has no /supervisors.
--
--   npx tsx scripts/dry-run-migrations.ts --project ipstebqawrvhkyntctrv \
--     supabase/migrations/0138_*.sql --trial scripts/trials/checklist-runner.sql
do $trial$
declare
  v_user uuid := (select id from auth.users where email = 'siddharth.cyriac.99@gmail.com');
  v_probe uuid := (select id from auth.users where email = 'siddharth.cyriac.99+probe@gmail.com');
  s_user uuid := gen_random_uuid();
  s_probe uuid := gen_random_uuid();
  v_template uuid := (select t.id from checklist_templates t
                       where t.is_active and exists (select 1 from checklist_template_items i
                                                      where i.template_id = t.id and i.is_active)
                       order by t.sort_order limit 1);
  v_plot uuid := (select id from plots order by name limit 1);
  v_group uuid := (select id from work_groups where code = 'LP.08' and is_active);
  v_checklist uuid;
  v_item uuid;
  n int;
begin
  if v_user is null or v_probe is null or v_template is null or v_plot is null or v_group is null then
    raise exception 'TRIAL SETUP: staging is missing the staff account, the probe, a template with checks, a plot or LP.08';
  end if;
  insert into auth_verified_sessions (session_id, user_id, method) values (s_user, v_user, 'otp'), (s_probe, v_probe, 'otp');
  delete from user_apps where user_id = v_user;
  insert into user_apps (user_id, app) values (v_user, '/supervisors');
  delete from checklist_template_groups where template_id = v_template and work_group_id = v_group;

  perform set_config('request.jwt.claims', json_build_object('sub', v_user,
    'role', 'authenticated', 'session_id', s_user)::text, true);
  set local role authenticated;

  insert into site_checklists (plot_id, template_id, created_by, updated_by)
  values (v_plot, v_template, v_user, v_user) returning id into v_checklist;
  insert into site_checklist_items (checklist_id, template_item_id, created_by, updated_by)
  select v_checklist, i.id, v_user, v_user from checklist_template_items i where i.template_id = v_template and i.is_active;
  select id into v_item from site_checklist_items where checklist_id = v_checklist limit 1;

  -- 1. A photo on a check of an open checklist saves.
  update site_checklist_items set photo_path = 'checklists/x/checks/y.jpg', status = 'pass' where id = v_item;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'TRIAL 1 FAILED: the photo was not saved'; end if;

  -- 2. The stages a checklist inspects: linked, then taken off.
  insert into checklist_template_groups (template_id, work_group_id, created_by) values (v_template, v_group, v_user);
  delete from checklist_template_groups where template_id = v_template and work_group_id = v_group;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'TRIAL 2 FAILED: the stage link was not taken off'; end if;
  insert into checklist_template_groups (template_id, work_group_id, created_by) values (v_template, v_group, v_user);

  -- 3. Signed off, the photo can no longer change.
  update site_checklist_items set status = 'pass' where checklist_id = v_checklist;
  update site_checklists set status = 'signed_off', signed_off_by = v_user, signed_off_at = now() where id = v_checklist;
  begin
    update site_checklist_items set photo_path = 'checklists/x/checks/z.jpg' where id = v_item;
    raise exception 'TRIAL 3 FAILED: a signed-off check took a new photo';
  exception when raise_exception then
    if sqlerrm like 'TRIAL%' then raise; end if;
  end;

  reset role;

  -- 4. The probe cannot take a stage link off or touch a check.
  perform set_config('request.jwt.claims', json_build_object('sub', v_probe,
    'role', 'authenticated', 'session_id', s_probe)::text, true);
  set local role authenticated;
  delete from checklist_template_groups where template_id = v_template and work_group_id = v_group;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'TRIAL 4a FAILED: the probe took a stage link off'; end if;
  update site_checklist_items set remarks = 'probe' where id = v_item;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'TRIAL 4b FAILED: the probe changed a check'; end if;

  reset role;
  raise exception 'ALL TRIALS PASSED';
end $trial$;
