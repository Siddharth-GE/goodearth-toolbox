-- Behaviour trial for 0134 — site checklists. Runs inside the dry-run transaction; always rolled
-- back, UNDER ROW-LEVEL SECURITY (BUGCATCHER #19), as the staff account made /supervisors-only,
-- then as the probe without the grant.
--
--   npx tsx scripts/dry-run-migrations.ts --project ipstebqawrvhkyntctrv \
--     supabase/migrations/0134_*.sql --trial scripts/trials/site-checklists.sql
do $trial$
declare
  v_user uuid := (select id from auth.users where email = 'siddharth.cyriac.99@gmail.com');
  v_probe uuid := (select id from auth.users where email = 'siddharth.cyriac.99+probe@gmail.com');
  s_user uuid := gen_random_uuid();
  s_probe uuid := gen_random_uuid();
  v_plot uuid := (select id from plots order by name limit 1);
  v_template uuid;
  v_a uuid;
  v_b uuid;
  v_list uuid;
  v_count int;
  v_refused boolean;
begin
  if v_user is null or v_probe is null or v_plot is null then
    raise exception 'TRIAL SETUP: staging is missing the staff account, the probe or a plot';
  end if;
  insert into auth_verified_sessions (session_id, user_id, method) values (s_user, v_user, 'otp'), (s_probe, v_probe, 'otp');
  delete from user_apps where user_id = v_user;
  insert into user_apps (user_id, app) values (v_user, '/supervisors');
  delete from user_apps where user_id = v_probe and app = '/supervisors';

  perform set_config('request.jwt.claims', json_build_object('sub', v_user,
    'role', 'authenticated', 'session_id', s_user)::text, true);
  set local role authenticated;

  -- 1. A supervisor keeps the templates and fills one in for a villa.
  insert into checklist_templates (name, work_refs, created_by, updated_by)
  values ('Trial Blockwork', 'SS.01', v_user, v_user) returning id into v_template;
  insert into checklist_template_items (template_id, sort_order, text, origin, created_by, updated_by)
  values (v_template, 1, 'Check block dimensions', 'source', v_user, v_user) returning id into v_a;
  insert into checklist_template_items (template_id, sort_order, text, origin, review_note, created_by, updated_by)
  values (v_template, 2, 'Check the mortar mix', 'review', 'Confirm the mix', v_user, v_user) returning id into v_b;

  insert into site_checklists (plot_id, template_id, location, created_by, updated_by)
  values (v_plot, v_template, 'Ground floor', v_user, v_user) returning id into v_list;
  insert into site_checklist_items (checklist_id, template_item_id, created_by, updated_by)
  values (v_list, v_a, v_user, v_user), (v_list, v_b, v_user, v_user);

  -- 2. Not every item answered: no sign-off.
  update site_checklist_items set status = 'pass' where checklist_id = v_list and template_item_id = v_a;
  v_refused := false;
  begin
    update site_checklists set status = 'signed_off', signed_off_by = v_user, signed_off_at = now() where id = v_list;
  exception when raise_exception then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 2 FAILED: signed off with an item unanswered'; end if;

  -- 3. A Fail with no remark: no sign-off; with one, it signs off.
  update site_checklist_items set status = 'fail' where checklist_id = v_list and template_item_id = v_b;
  v_refused := false;
  begin
    update site_checklists set status = 'signed_off', signed_off_by = v_user, signed_off_at = now() where id = v_list;
  exception when raise_exception then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 3 FAILED: signed off with a Fail unexplained'; end if;
  update site_checklist_items set remarks = 'Mix 1:6 found, redone at 1:5' where checklist_id = v_list and template_item_id = v_b;
  update site_checklists set status = 'signed_off', signed_off_by = v_user, signed_off_at = now() where id = v_list;

  -- 4. Signed off is final: no item changes, no header changes, no delete.
  v_refused := false;
  begin
    update site_checklist_items set status = 'pass' where checklist_id = v_list and template_item_id = v_b;
  exception when raise_exception then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 4 FAILED: an item changed after sign-off'; end if;
  v_refused := false;
  begin
    update site_checklists set location = 'First floor' where id = v_list;
  exception when raise_exception then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 4 FAILED: a signed-off checklist changed'; end if;
  delete from site_checklists where id = v_list;
  select count(*) into v_count from site_checklists where id = v_list;
  if v_count <> 1 then raise exception 'TRIAL 4 FAILED: a signed-off checklist was deleted'; end if;

  -- 5. Templates are switched off, not deleted.
  delete from checklist_templates where id = v_template;
  select count(*) into v_count from checklist_templates where id = v_template;
  if v_count <> 1 then raise exception 'TRIAL 5 FAILED: a template was deleted'; end if;

  -- 6. Without /supervisors the probe reads the templates but no villa's checklists, and writes nothing.
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_probe,
    'role', 'authenticated', 'session_id', s_probe)::text, true);
  set local role authenticated;
  select count(*) into v_count from checklist_templates where id = v_template;
  if v_count <> 1 then raise exception 'TRIAL 6 FAILED: the probe cannot read the templates'; end if;
  select count(*) into v_count from site_checklists where id = v_list;
  if v_count <> 0 then raise exception 'TRIAL 6 FAILED: the probe reads a villa''s checklist'; end if;
  v_refused := false;
  begin
    insert into site_checklists (plot_id, template_id, created_by, updated_by) values (v_plot, v_template, v_probe, v_probe);
  exception when insufficient_privilege then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 6 FAILED: the probe started a checklist'; end if;

  reset role;
  raise exception 'ALL TRIALS PASSED';
end $trial$;
