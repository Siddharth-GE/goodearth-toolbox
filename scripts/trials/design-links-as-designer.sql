-- Behaviour trial for 0122 — TB numbers, the designer's revision number,
-- the WorkDrive link and the kept folder list. Runs inside the dry-run
-- transaction; always rolled back.
--
-- Under row-level security (set local role authenticated) as a designer
-- holding /design-management alone (the staff Siddharth account, the gmail
-- one) and a supervisor holding /supervisors alone (the probe). A trial
-- run as the database owner proves no policy and no guard (BUGCATCHER #19).
--
--   npx tsx scripts/dry-run-migrations.ts --project ipstebqawrvhkyntctrv \
--     supabase/migrations/0122_*.sql --trial scripts/trials/design-links-as-designer.sql
do $trial$
declare
  v_designer uuid := (select id from auth.users where email = 'siddharth.cyriac.99@gmail.com');
  v_site uuid := (select id from auth.users where email = 'siddharth.cyriac.99+probe@gmail.com');
  v_unit uuid;
  v_stage uuid;
  v_set uuid;
  v_rev uuid;
  v_next uuid;
  v_draft uuid;
  v_tx uuid;
  v_expected text;
  v_number text;
  v_n int;
  v_refused boolean;
  v_link constant text :=
    'https://workdrive.zohoexternal.com/external/263e00c525983e7ad6db66aa9e1b1f9873b60b6d371104be1ebe01b53ead6751';
begin
  if v_designer is null or v_site is null then
    raise exception 'TRIAL SETUP: the staff or probe account is missing on staging';
  end if;
  select u.id into v_unit from units u where u.name = 'Villa 40' order by u.id limit 1;
  select s.id into v_stage from design_stages s where s.is_active order by s.sort_order limit 1;
  if v_unit is null or v_stage is null then
    raise exception 'TRIAL SETUP: Villa 40 or an active design stage is missing';
  end if;
  select 'TB-' || lpad((coalesce(max(last_no), 0) + 1)::text, 4, '0') into v_expected
    from transmittal_counters where scope = v_unit::text;

  update profiles set role_id = null where id in (v_designer, v_site);
  delete from user_apps where user_id in (v_designer, v_site);
  insert into user_apps (user_id, app)
    values (v_designer, '/design-management'), (v_site, '/supervisors');

  -- 1. The designer starts a transmittal on a new set: no link, no sheet —
  --    Issue is refused, by name.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_designer, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into drawing_sets (name, design_stage_id, sort_order, created_by, updated_by)
    values ('Trial: Electrical SLD', v_stage, 99999, v_designer, v_designer)
    returning id into v_set;
  insert into drawing_revisions (unit_id, drawing_set_id, revision_no, created_by)
    values (v_unit, v_set, 0, v_designer) returning id into v_rev;
  insert into transmittals (unit_id, design_stage_id, created_by)
    values (v_unit, v_stage, v_designer) returning id into v_tx;
  insert into transmittal_lines (transmittal_id, unit_id, drawing_revision_id, sort_order, created_by)
    values (v_tx, v_unit, v_rev, 0, v_designer);
  v_refused := false;
  begin
    perform issue_transmittal(v_tx);
  exception when others then
    v_refused := sqlerrm like '%has no drawings%WorkDrive%';
  end;
  if not v_refused then
    raise exception 'TRIAL 1 FAILED: a transmittal with no link and no sheet was not refused by name';
  end if;

  -- 2. Only a WorkDrive share link is taken.
  v_refused := false;
  begin
    update drawing_revisions set drawings_url = 'https://drive.google.com/drive/folders/abc'
      where id = v_rev;
  exception when check_violation then
    v_refused := true;
  end;
  if not v_refused then
    raise exception 'TRIAL 2 FAILED: a Google Drive address was taken as the link';
  end if;

  -- 3. The link, the folder's list, and the number moved up to R3 (a set
  --    the team had at R2 in Excel).
  update drawing_revisions set drawings_url = v_link, revision_no = 3 where id = v_rev;
  insert into drawing_revision_folder_sheets
      (drawing_revision_id, workdrive_id, name, size_bytes, modified_at, sort_order, created_by)
    values
      (v_rev, 'trial-1', 'Saarang - Plot 17 - Electrical SLD - R0 - 05022026.pdf', 224691, now(), 0, v_designer),
      (v_rev, 'trial-2', 'Saarang - Plot 17 - Electrical Dwg - R0 - 05022026.pdf', 352414, now(), 1, v_designer);
  if (select revision_no from drawing_revisions where id = v_rev) <> 3 then
    raise exception 'TRIAL 3 FAILED: the draft''s number did not move to 3';
  end if;

  -- 4. R3 needs its reason; then it issues as TB, the villa's next number.
  v_refused := false;
  begin
    perform issue_transmittal(v_tx);
  exception when others then
    v_refused := sqlerrm like '%needs a note%';
  end;
  if not v_refused then
    raise exception 'TRIAL 4 FAILED: R3 issued without saying what changed';
  end if;
  update drawing_revisions set note = 'Brought in from Excel at R2; sleeve sizes changed.'
    where id = v_rev;
  v_number := issue_transmittal(v_tx);
  if v_number is distinct from v_expected then
    raise exception 'TRIAL 4 FAILED: issued as %, expected %', v_number, v_expected;
  end if;

  -- 5. Once issued, the link, the number and the kept list never change.
  v_refused := false;
  begin
    update drawing_revisions set drawings_url = null where id = v_rev;
  exception when others then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 5 FAILED: a released link was cleared'; end if;
  v_refused := false;
  begin
    update drawing_revisions set revision_no = 9 where id = v_rev;
  exception when others then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 5 FAILED: a released number moved'; end if;
  v_refused := false;
  begin
    insert into drawing_revision_folder_sheets (drawing_revision_id, workdrive_id, name, created_by)
      values (v_rev, 'trial-3', 'Added later.pdf', v_designer);
  exception when others then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 5 FAILED: a sheet was added to a released list'; end if;
  v_refused := false;
  begin
    delete from drawing_revision_folder_sheets where drawing_revision_id = v_rev;
  exception when others then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 5 FAILED: a released list was deleted'; end if;
  if (select count(*) from drawing_revision_folder_sheets where drawing_revision_id = v_rev) <> 2 then
    raise exception 'TRIAL 5 FAILED: the released list did not keep its two sheets';
  end if;

  -- 6. The next draft of the set starts at R4; it can go up, never to or
  --    below a number already used.
  insert into drawing_revisions (unit_id, drawing_set_id, revision_no, created_by)
    values (v_unit, v_set, 4, v_designer) returning id into v_next;
  foreach v_n in array array[3, 2] loop
    v_refused := false;
    begin
      update drawing_revisions set revision_no = v_n where id = v_next;
    exception when others then
      v_refused := sqlerrm like '%above R3%';
    end;
    if not v_refused then
      raise exception 'TRIAL 6 FAILED: the next draft was moved to R%, at or below R3', v_n;
    end if;
  end loop;
  update drawing_revisions set revision_no = 7 where id = v_next;

  -- 7. Its own list, then the draft deleted with it.
  insert into drawing_revision_folder_sheets (drawing_revision_id, workdrive_id, name, created_by)
    values (v_next, 'trial-4', 'Draft sheet.pdf', v_designer);
  perform delete_draft_revision(v_next);
  if exists (select 1 from drawing_revision_folder_sheets where drawing_revision_id = v_next) then
    raise exception 'TRIAL 7 FAILED: deleting the draft left its list behind';
  end if;

  -- A second draft with a list, for site to be kept away from.
  insert into drawing_revisions (unit_id, drawing_set_id, revision_no, created_by)
    values (v_unit, v_set, 4, v_designer) returning id into v_draft;
  insert into drawing_revision_folder_sheets (drawing_revision_id, workdrive_id, name, created_by)
    values (v_draft, 'trial-5', 'Not yet issued.pdf', v_designer);

  -- 8. Site sees the issued list and the link, never a draft's.
  reset role;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_site, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if (select count(*) from drawing_revision_folder_sheets where drawing_revision_id = v_rev) <> 2 then
    raise exception 'TRIAL 8 FAILED: site cannot read the issued list';
  end if;
  if (select drawings_url from drawing_revisions where id = v_rev) is distinct from v_link then
    raise exception 'TRIAL 8 FAILED: site cannot read the issued link';
  end if;
  if exists (select 1 from drawing_revision_folder_sheets where drawing_revision_id = v_draft) then
    raise exception 'TRIAL 8 FAILED: site can read a draft''s list';
  end if;

  -- 9. Site cannot write a list — onto a draft (which it cannot even see,
  --    so the draft-only trigger refuses first) or onto the issued one.
  foreach v_next in array array[v_draft, v_rev] loop
    v_refused := false;
    begin
      insert into drawing_revision_folder_sheets (drawing_revision_id, workdrive_id, name, created_by)
        values (v_next, 'trial-6', 'From site.pdf', v_site);
    exception when others then v_refused := true;
    end;
    if not v_refused then raise exception 'TRIAL 9 FAILED: site wrote a folder list'; end if;
  end loop;
  v_refused := false;
  begin
    delete from drawing_revision_folder_sheets where drawing_revision_id = v_rev;
    get diagnostics v_n = row_count;
    v_refused := v_n = 0;
  exception when others then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 9 FAILED: site deleted an issued list'; end if;

  reset role;
  raise exception 'ALL TRIALS PASSED';
end $trial$;
