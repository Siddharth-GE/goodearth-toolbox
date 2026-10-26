-- Behaviour trial for 0135 — the site confirms what reached it. Runs inside the dry-run
-- transaction; always rolled back, UNDER ROW-LEVEL SECURITY (BUGCATCHER #19), as the staff account
-- made /supervisors-only, then as the probe (/inventory, /estimator).
--
--   npx tsx scripts/dry-run-migrations.ts --project ipstebqawrvhkyntctrv \
--     supabase/migrations/0135_*.sql --trial scripts/trials/site-receipt.sql
do $trial$
declare
  v_user uuid := (select id from auth.users where email = 'siddharth.cyriac.99@gmail.com');
  v_probe uuid := (select id from auth.users where email = 'siddharth.cyriac.99+probe@gmail.com');
  s_user uuid := gen_random_uuid();
  s_probe uuid := gen_random_uuid();
  v_issue uuid := (select i.id from stock_issues i where i.plot_id is not null
                    and exists (select 1 from stock_issue_lines l where l.issue_id = i.id) limit 1);
  v_other_line uuid;
  v_line uuid;
  v_sent numeric;
  v_transfer uuid := (select id from stock_issues where to_store_id is not null limit 1);
  v_confirmation uuid;
  v_count int;
  v_refused boolean;
begin
  if v_user is null or v_probe is null or v_issue is null then
    raise exception 'TRIAL SETUP: staging is missing the staff account, the probe or an issue to a villa';
  end if;
  select id, quantity into v_line, v_sent from stock_issue_lines where issue_id = v_issue order by id limit 1;
  v_other_line := (select id from stock_issue_lines where issue_id <> v_issue limit 1);
  insert into auth_verified_sessions (session_id, user_id, method) values (s_user, v_user, 'otp'), (s_probe, v_probe, 'otp');
  delete from user_apps where user_id = v_user;
  insert into user_apps (user_id, app) values (v_user, '/supervisors');

  perform set_config('request.jwt.claims', json_build_object('sub', v_user,
    'role', 'authenticated', 'session_id', s_user)::text, true);
  set local role authenticated;

  -- 1. The supervisor confirms the issue, one line short.
  insert into site_receipt_confirmations (issue_id, note, confirmed_by)
  values (v_issue, 'Two bags short', v_user) returning id into v_confirmation;
  v_refused := false;
  begin
    insert into site_receipt_confirmation_lines (confirmation_id, issue_line_id, received_quantity)
    values (v_confirmation, v_line, v_sent + 1);
  exception when raise_exception then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 1 FAILED: more than was sent was received'; end if;
  insert into site_receipt_confirmation_lines (confirmation_id, issue_line_id, received_quantity)
  values (v_confirmation, v_line, greatest(v_sent - 2, 0));

  -- 2. A line confirmed twice, or a line of another issue, is refused.
  v_refused := false;
  begin
    insert into site_receipt_confirmation_lines (confirmation_id, issue_line_id, received_quantity)
    values (v_confirmation, v_line, 1);
  exception when unique_violation then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 2 FAILED: a line was confirmed twice'; end if;
  if v_other_line is not null then
    v_refused := false;
    begin
      insert into site_receipt_confirmation_lines (confirmation_id, issue_line_id, received_quantity)
      values (v_confirmation, v_other_line, 1);
    exception when raise_exception then v_refused := true;
    end;
    if not v_refused then raise exception 'TRIAL 2 FAILED: another issue''s line was confirmed'; end if;
  end if;

  -- 3. One confirmation per issue; a transfer between stores is not the site's to confirm.
  v_refused := false;
  begin
    insert into site_receipt_confirmations (issue_id, confirmed_by) values (v_issue, v_user);
  exception when unique_violation then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 3 FAILED: an issue was confirmed twice'; end if;
  if v_transfer is not null then
    v_refused := false;
    begin
      insert into site_receipt_confirmations (issue_id, confirmed_by) values (v_transfer, v_user);
    exception when raise_exception then v_refused := true;
    end;
    if not v_refused then raise exception 'TRIAL 3 FAILED: a store transfer was confirmed on site'; end if;
  end if;

  -- 4. A confirmation is signed by whoever makes it, and never changes.
  v_refused := false;
  begin
    insert into site_receipt_confirmations (issue_id, confirmed_by)
    values ((select id from stock_issues where plot_id is not null and id <> v_issue limit 1), v_probe);
  exception when raise_exception or not_null_violation then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 4 FAILED: confirmed in someone else''s name'; end if;
  v_refused := false;
  begin
    update site_receipt_confirmation_lines set received_quantity = v_sent where confirmation_id = v_confirmation;
  exception when insufficient_privilege then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 4 FAILED: a confirmed quantity changed'; end if;

  -- 5. The store reads the confirmation; it cannot make one.
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_probe,
    'role', 'authenticated', 'session_id', s_probe)::text, true);
  set local role authenticated;
  select count(*) into v_count from site_receipt_confirmation_lines where confirmation_id = v_confirmation;
  if v_count <> 1 then raise exception 'TRIAL 5 FAILED: the store sees % confirmed lines', v_count; end if;
  v_refused := false;
  begin
    insert into site_receipt_confirmations (issue_id, confirmed_by)
    values ((select id from stock_issues where plot_id is not null and id <> v_issue limit 1), v_probe);
  exception when insufficient_privilege then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 5 FAILED: the store confirmed for the site'; end if;

  reset role;
  raise exception 'ALL TRIALS PASSED';
end $trial$;
