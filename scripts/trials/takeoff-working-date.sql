-- Behaviour trial for 0109. Runs inside the dry-run transaction; always rolled back.
--   npx tsx scripts/dry-run-migrations.ts --project <ref> supabase/migrations/0109_*.sql \
--     --trial scripts/trials/takeoff-working-date.sql
-- Needs a villa with a working estimate (staging has one); builds a throwaway
-- official copy for that villa, so it never depends on a real official.
do $trial$
declare
  v_user uuid := (select id from auth.users where email = 'siddharth.cyriac.99@gmail.com');
  v_item uuid := (select id from items where kind = 'material' order by code limit 1);
  v_nobody uuid;
  w estimator_estimates%rowtype;
  v_official uuid;
  v_line uuid;
  v_before timestamptz;
  v_seen timestamptz;
  v_n int;
begin
  select * into w from estimator_estimates where is_working and unit_id is not null limit 1;
  if w.id is null then
    raise exception 'TRIAL SETUP: no villa has a working estimate to try this on';
  end if;

  -- The working estimate's newest write, worked out apart from the view.
  select greatest(
    w.updated_at,
    (select max(updated_at) from estimator_estimate_lines where estimate_id = w.id),
    (select max(lm.updated_at) from estimator_estimate_line_measurements lm
       join estimator_estimate_lines l on l.id = lm.line_id where l.estimate_id = w.id),
    (select max(lc.updated_at) from estimator_estimate_line_components lc
       join estimator_estimate_lines l on l.id = lc.line_id where l.estimate_id = w.id))
  into v_before;

  -- A throwaway official copy for the same villa, made official a minute
  -- after the working estimate's last change.
  insert into estimator_estimates (project_id, unit_id, name, created_by, updated_by)
  values (w.project_id, w.unit_id, 'TRIAL official', v_user, v_user)
  returning id into v_official;
  insert into estimator_estimate_lines (estimate_id, work_item_id, qty, created_by, updated_by)
  select v_official, l.work_item_id, coalesce(l.qty, 1), v_user, v_user
    from estimator_estimate_lines l where l.estimate_id = w.id limit 1
  returning id into v_line;
  insert into estimator_estimate_line_costs (estimate_id, line_id, work_item_id, qty)
  select v_official, l.id, l.work_item_id, l.qty from estimator_estimate_lines l where l.id = v_line;
  insert into estimator_estimate_takeoff (estimate_id, work_item_id, item_id, material_name, uom, quantity)
  select v_official, l.work_item_id, v_item, 'TRIAL material', 'nos', 1
    from estimator_estimate_lines l where l.id = v_line;
  update estimator_estimates
     set status = 'submitted', est_no = 9001, reference = 'EST/TRIAL/001',
         submitted_by = v_user, submitted_at = v_before + interval '1 minute'
   where id = v_official;

  -- 1. As the founder's staging account (/indents): the official's row
  --    carries the working estimate's date, which is before it was made official.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  select count(*), max(working_updated_at) into v_n, v_seen
    from estimate_takeoff_facts where estimate_id = v_official;
  if v_n <> 1 then
    raise exception 'TRIAL 1 FAILED: /indents sees % rows of the official, expected 1', v_n;
  end if;
  if v_seen is distinct from v_before then
    raise exception 'TRIAL 1 FAILED: working_updated_at % expected %', v_seen, v_before;
  end if;

  -- 2. Measuring a line on the working estimate moves the date past the official.
  update estimator_estimate_lines set qty = coalesce(qty, 0) + 1
   where id = (select id from estimator_estimate_lines where estimate_id = w.id limit 1);
  select max(working_updated_at) into v_seen
    from estimate_takeoff_facts where estimate_id = v_official;
  if v_seen is distinct from now() or v_seen <= v_before + interval '1 minute' then
    raise exception 'TRIAL 2 FAILED: after an edit working_updated_at is %, official made %',
      v_seen, v_before + interval '1 minute';
  end if;

  -- 3. Someone holding none of the four grants sees no row at all.
  select p.id into v_nobody from profiles p
   where p.is_active and p.role <> 'admin' and p.role_id is null
     and not exists (select 1 from user_apps ua where ua.user_id = p.id
       and ua.app in ('/estimator', '/indents', '/inventory', '/supervisors'))
   limit 1;
  if v_nobody is null then
    raise notice 'TRIAL 3 skipped: every active account holds one of the four grants';
  else
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_nobody, 'role', 'authenticated')::text, true);
    select count(*) into v_n from estimate_takeoff_facts where estimate_id = v_official;
    if v_n <> 0 then
      raise exception 'TRIAL 3 FAILED: an account without the grants sees % rows', v_n;
    end if;
  end if;

  raise notice 'TRIAL 0109 OK — the date, the edit, the gate';
end $trial$;
