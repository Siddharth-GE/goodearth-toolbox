-- Behaviour trial for 0161 — Saarang Collections. Runs inside the dry-run transaction; always
-- rolled back, UNDER ROW-LEVEL SECURITY (BUGCATCHER #19), as the staff account made
-- /saarang-collections-only, and as the probe (/estimator, /inventory), who must see nothing.
--
--   npx tsx scripts/dry-run-migrations.ts --project ipstebqawrvhkyntctrv \
--     supabase/migrations/0161_saarang_collections.sql --trial scripts/trials/saarang-collections.sql
do $trial$
declare
  v_user uuid := (select id from auth.users where email = 'siddharth.cyriac.99@gmail.com');
  v_probe uuid := (select id from auth.users where email = 'siddharth.cyriac.99+probe@gmail.com');
  s_user uuid := gen_random_uuid();
  s_probe uuid := gen_random_uuid();
  v_upload uuid;
  v_n int;
  v_refused boolean;
begin
  if v_user is null or v_probe is null then
    raise exception 'TRIAL SETUP: staging is missing the staff account or the probe';
  end if;
  insert into auth_verified_sessions (session_id, user_id, method) values (s_user, v_user, 'otp'), (s_probe, v_probe, 'otp');
  delete from user_apps where user_id = v_user;
  update profiles set role_id = null where id = v_user;
  insert into user_apps (user_id, app) values (v_user, '/saarang-collections');
  if exists (select 1 from user_apps where user_id = v_probe and app = '/saarang-collections') then
    raise exception 'TRIAL SETUP: the probe holds /saarang-collections';
  end if;

  -- 1. The grant holder reads the rules and uploads a report.
  perform set_config('request.jwt.claims', json_build_object('sub', v_user,
    'role', 'authenticated', 'session_id', s_user)::text, true);
  set local role authenticated;
  if (select is_admin()) then raise exception 'TRIAL SETUP: the staff account is an admin'; end if;
  select count(*) into v_n from saarang_collection_settings;
  if v_n <> 1 then raise exception 'TRIAL 1 FAILED: the grant holder sees % settings rows', v_n; end if;
  insert into saarang_collection_uploads (slot, file_name, as_of, row_count, rows)
  values ('plot_payments', 'Payments.xlsx', '2026-10-21', 1, '[["SAR-1","2026-10-01","A","","",100,0]]')
  returning id into v_upload;

  -- 2. An upload is never edited or deleted, and nobody uploads in another's name.
  v_refused := false;
  begin
    update saarang_collection_uploads set file_name = 'changed.xlsx' where id = v_upload;
  exception when insufficient_privilege then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 2 FAILED: an upload could be updated'; end if;
  v_refused := false;
  begin
    delete from saarang_collection_uploads where id = v_upload;
  exception when insufficient_privilege then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 2 FAILED: an upload could be deleted'; end if;
  v_refused := false;
  begin
    insert into saarang_collection_uploads (slot, file_name, row_count, rows, uploaded_by)
    values ('plot_sold', 'x.xlsx', 0, '[]', v_probe);
  exception when insufficient_privilege then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 2 FAILED: an upload was recorded in someone else''s name'; end if;

  -- 3. Figures: a known cell saves and changes; an unknown one, or one in another's name, is refused.
  insert into saarang_collection_figures (project, key, value) values ('plot', 'C', 1)
  on conflict (project, key) do update set value = excluded.value, updated_by = excluded.updated_by;
  insert into saarang_collection_figures (project, key, value) values ('plot', 'C', 2)
  on conflict (project, key) do update set value = excluded.value, updated_by = excluded.updated_by;
  insert into saarang_collection_figures (project, key, value) values ('phase3', 'MTD', null);
  if (select value from saarang_collection_figures where project = 'plot' and key = 'C') is distinct from 2 then
    raise exception 'TRIAL 3 FAILED: a typed figure did not change';
  end if;
  v_refused := false;
  begin
    insert into saarang_collection_figures (project, key, value) values ('plot', 'MTD', 1);
  exception when check_violation then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 3 FAILED: a calculated cell was typed'; end if;
  v_refused := false;
  begin
    insert into saarang_collection_figures (project, key, value, updated_by) values ('villa', 'D', 1, v_probe);
  exception when insufficient_privilege then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 3 FAILED: a figure was typed in someone else''s name'; end if;
  v_refused := false;
  begin
    update saarang_collection_figures set value = 3, updated_by = v_probe where project = 'plot' and key = 'C';
  exception when insufficient_privilege then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 3 FAILED: a figure was changed in someone else''s name'; end if;

  -- 4. Rules: the settings change, and each list adds and removes; nothing in another's name.
  update saarang_collection_settings set gst_villa = 12, updated_by = v_user;
  if (select gst_villa from saarang_collection_settings) is distinct from 12::numeric then
    raise exception 'TRIAL 4 FAILED: the settings did not change';
  end if;
  v_refused := false;
  begin
    update saarang_collection_settings set gst_villa = 5, updated_by = v_probe;
  exception when insufficient_privilege then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 4 FAILED: a rule was changed in someone else''s name'; end if;
  insert into saarang_collection_excluded_receipts (receipt_no, reason) values ('SAR-1', 'Trial'), ('SAR-2', 'Kept');
  insert into saarang_collection_corrections (unit, stage, delta) values ('SAARANG-PLOT-07', 'On Sale Deed', -100000);
  insert into saarang_collection_corrections (unit, delta) values ('SAARANG-PLOT-08', -1);
  insert into saarang_collection_extra_units (unit, applicant, sold_value, completed) values ('SAARANG-PLOT-29', 'Trial', 1, 1), ('SAARANG-VILLA-99', 'Kept', 1, 0);
  delete from saarang_collection_excluded_receipts where receipt_no = 'SAR-1';
  delete from saarang_collection_corrections where unit = 'SAARANG-PLOT-07';
  delete from saarang_collection_extra_units where unit = 'SAARANG-PLOT-29';
  select (select count(*) from saarang_collection_excluded_receipts where receipt_no = 'SAR-1')
       + (select count(*) from saarang_collection_corrections where unit = 'SAARANG-PLOT-07')
       + (select count(*) from saarang_collection_extra_units where unit = 'SAARANG-PLOT-29') into v_n;
  if v_n <> 0 then raise exception 'TRIAL 4 FAILED: % rule rows were not removed', v_n; end if;
  v_refused := false;
  begin
    insert into saarang_collection_corrections (unit, stage, delta) values ('saarang-plot-07', 'x', 1);
  exception when check_violation then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 4 FAILED: a lower-case unit was kept'; end if;
  v_refused := false;
  begin
    insert into saarang_collection_excluded_receipts (receipt_no, added_by) values ('SAR-3', v_probe);
  exception when insufficient_privilege then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 4 FAILED: a receipt was left out in someone else''s name'; end if;
  v_refused := false;
  begin
    insert into saarang_collection_corrections (unit, delta, added_by) values ('SAARANG-PLOT-09', 1, v_probe);
  exception when insufficient_privilege then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 4 FAILED: a correction was added in someone else''s name'; end if;
  v_refused := false;
  begin
    insert into saarang_collection_extra_units (unit, sold_value, added_by) values ('SAARANG-PLOT-30', 1, v_probe);
  exception when insufficient_privilege then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 4 FAILED: a unit was added in someone else''s name'; end if;
  reset role;

  -- 5. The probe, without the grant, reads nothing and writes nothing.
  perform set_config('request.jwt.claims', json_build_object('sub', v_probe,
    'role', 'authenticated', 'session_id', s_probe)::text, true);
  set local role authenticated;
  select (select count(*) from saarang_collection_uploads) + (select count(*) from saarang_collection_settings)
       + (select count(*) from saarang_collection_figures)
       + (select count(*) from saarang_collection_excluded_receipts)
       + (select count(*) from saarang_collection_corrections)
       + (select count(*) from saarang_collection_extra_units) into v_n;
  if v_n <> 0 then raise exception 'TRIAL 5 FAILED: the probe reads % rows', v_n; end if;
  update saarang_collection_settings set gst_plot = 50, updated_by = v_probe;
  delete from saarang_collection_excluded_receipts;
  delete from saarang_collection_corrections;
  delete from saarang_collection_extra_units;
  v_refused := false;
  begin
    insert into saarang_collection_figures (project, key, value, updated_by) values ('villa', 'C', 1, v_probe);
  exception when insufficient_privilege then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 5 FAILED: the probe typed a figure'; end if;
  reset role;
  if (select gst_plot from saarang_collection_settings) is distinct from 0::numeric then
    raise exception 'TRIAL 5 FAILED: the probe changed a rule';
  end if;
  select (select count(*) from saarang_collection_excluded_receipts where receipt_no = 'SAR-2')
       + (select count(*) from saarang_collection_corrections where unit = 'SAARANG-PLOT-08' and stage is null)
       + (select count(*) from saarang_collection_extra_units where unit = 'SAARANG-VILLA-99') into v_n;
  if v_n <> 3 then raise exception 'TRIAL 5 FAILED: the probe removed % rule rows', 3 - v_n; end if;

  raise exception 'ALL TRIALS PASSED';
end $trial$;
