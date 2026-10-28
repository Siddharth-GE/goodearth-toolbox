-- Behaviour trial for 0166 — combined contractor bills: each line names its villa, one company per bill.
-- Runs inside the dry-run transaction; always rolled back. Every billing step runs UNDER ROW-LEVEL SECURITY
-- (BUGCATCHER #19) as the staff account made /bills-only.
--
--   npx tsx scripts/dry-run-migrations.ts --project ipstebqawrvhkyntctrv \
--     supabase/migrations/0166_*.sql --trial scripts/trials/bill-lines-villa.sql
do $trial$
declare
  v_user uuid := (select id from auth.users where email = 'siddharth.cyriac.99@gmail.com');
  s_user uuid := gen_random_uuid();
  -- EF: Saarang - Villas and Saarang - Mobilisation (no plots). ED: Saarang - Infrastructure. EP: Saarang West both.
  v_villas uuid := '041b4401-ab9c-4ee5-b6d7-3443f58dbc6a';
  v_mobilisation uuid := '0a41b5fe-c3fa-4a12-a2ac-4fc01d787bda';
  v_infra uuid := '49dc6af6-ded4-4522-9798-ca1f04003839';
  v_west_villas uuid := 'c5044466-47d6-4e3e-8014-e36e41a33c23';
  v_west_infra uuid := '7139eb3b-de7b-4979-b286-2b49d63737fb';
  v_p1 uuid;
  v_p2 uuid;
  v_ch uuid;
  v_w1 uuid;
  v_w2 uuid;
  v_wi uuid;
  v_contractor uuid;
  v_supplier uuid;
  v_bill uuid;
  v_line uuid;
  v_logs uuid[];
  v_log uuid;
  v_count int;
  v_text text;
  v_message text;
  v_before numeric;
begin
  select id into v_p1 from plots where project_id = v_villas order by code limit 1;
  select id into v_p2 from plots where project_id = v_villas order by code offset 1 limit 1;
  select id into v_ch from plots where project_id = v_infra order by code limit 1;
  select id into v_w1 from plots where project_id = v_west_villas order by code limit 1;
  select id into v_w2 from plots where project_id = v_west_villas order by code offset 1 limit 1;
  select id into v_wi from plots where project_id = v_west_infra order by code limit 1;
  if v_user is null or v_p2 is null or v_ch is null or v_w2 is null or v_wi is null then
    raise exception 'TRIAL SETUP: staging is missing the staff account or the plots';
  end if;
  insert into auth_verified_sessions (session_id, user_id, method) values (s_user, v_user, 'otp');
  insert into vendors (name, is_contractor) values ('Qzvy Trial 0166', true) returning id into v_contractor;
  insert into vendors (name, is_contractor) values ('Qzvy Supplier 0166', false) returning id into v_supplier;

  delete from user_apps where user_id = v_user;
  insert into user_apps (user_id, app) values (v_user, '/bills');
  perform set_config('request.jwt.claims', json_build_object('sub', v_user,
    'role', 'authenticated', 'session_id', s_user)::text, true);
  set local role authenticated;

  -- 1. A hand-made contractor's bill on Saarang - Villas takes lines on two villas and on Mobilisation (same company).
  v_bill := create_nmr_bill(v_contractor, v_villas, null, null, '', current_date, 1, 0, 1, null);
  insert into bill_lines (bill_id, sort_order, line_kind, description, quantity, rate, gst_pct, plot_id)
  values (v_bill, 1, 'nmr', 'Helpers (man-days)', 2, 450, 0, v_p1),
         (v_bill, 2, 'nmr', 'Masons (man-days)', 1, 1100, 0, v_p2);
  insert into bill_lines (bill_id, sort_order, line_kind, description, quantity, rate, gst_pct, project_id)
  values (v_bill, 3, 'nmr', 'Helpers (man-days)', 4, 450, 0, v_mobilisation);
  if (select count(*) from bill_lines where bill_id = v_bill and project_id is not null) <> 3
     or (select project_id from bill_lines where bill_id = v_bill and sort_order = 1) is distinct from v_villas then
    raise exception 'TRIAL 1 FAILED: a line''s project was not filled from its villa';
  end if;
  if (select total_amount from bills where id = v_bill) <> 3800 then
    raise exception 'TRIAL 1 FAILED: the header did not roll up to 3800';
  end if;

  -- 2. Another company's villa is refused, and so is a villa outside the project named.
  v_message := null;
  begin
    insert into bill_lines (bill_id, sort_order, line_kind, description, quantity, rate, gst_pct, plot_id)
    values (v_bill, 4, 'nmr', 'Helpers (man-days)', 1, 450, 0, v_ch);
  exception when raise_exception then v_message := sqlerrm;
  end;
  if v_message is null or v_message not like 'That project is another company''s%' then
    raise exception 'TRIAL 2 FAILED: an ED villa on an EF bill gave "%"', v_message;
  end if;
  v_message := null;
  begin
    insert into bill_lines (bill_id, sort_order, line_kind, description, quantity, rate, gst_pct, project_id, plot_id)
    values (v_bill, 4, 'nmr', 'Helpers (man-days)', 1, 450, 0, v_mobilisation, v_p1);
  exception when raise_exception then v_message := sqlerrm;
  end;
  if v_message is distinct from 'That villa is not in that project' then
    raise exception 'TRIAL 2 FAILED: a villa outside its project gave "%"', v_message;
  end if;
  -- Moving a line to another villa of the company is an edit like any other.
  update bill_lines set plot_id = v_p2 where bill_id = v_bill and sort_order = 1;

  -- 3. A material supplier's labour bill, and a muster roll paid directly, keep every line on the bill's own villa.
  v_bill := create_nmr_bill(v_supplier, v_villas, v_p1, null, 'MR 0166 S', current_date, 1, 0, 1, null);
  insert into bill_lines (bill_id, sort_order, line_kind, description, quantity, rate, gst_pct, plot_id)
  values (v_bill, 1, 'nmr', 'Helpers (man-days)', 1, 450, 0, v_p1);
  v_message := null;
  begin
    insert into bill_lines (bill_id, sort_order, line_kind, description, quantity, rate, gst_pct, plot_id)
    values (v_bill, 2, 'nmr', 'Helpers (man-days)', 1, 450, 0, v_p2);
  exception when raise_exception then v_message := sqlerrm;
  end;
  if v_message is null or v_message not like 'Only a contractor''s labour bill%' then
    raise exception 'TRIAL 3 FAILED: a supplier''s line on another villa gave "%"', v_message;
  end if;
  v_bill := create_nmr_bill(null, v_villas, null, null, 'MR 0166 D', current_date, 1, 0, 1, null);
  v_message := null;
  begin
    insert into bill_lines (bill_id, sort_order, line_kind, description, quantity, rate, gst_pct, plot_id)
    values (v_bill, 1, 'nmr', 'Helpers (man-days)', 1, 450, 0, v_p1);
  exception when raise_exception then v_message := sqlerrm;
  end;
  if v_message is null or v_message not like 'Only a contractor''s labour bill%' then
    raise exception 'TRIAL 3 FAILED: a direct muster roll''s line on a villa gave "%"', v_message;
  end if;

  -- 4. Send to Bill: daily wages across the two Saarang West projects (EP) make one bill, a line per trade per villa.
  reset role;
  select coalesce(sum(amount), 0) into v_before from villa_cost_facts where plot_id = v_w2 and kind = 'labour_billed';
  v_logs := array[]::uuid[];
  insert into labour_logs (plot_id, custom_name, contractor_id, log_date, kind, masons, helpers, others, work_class, created_by, updated_by)
  values (v_w1, 'Trial 0166 a', v_contractor, current_date - 3, 'nmr', 1, 2, 0, 'additional', v_user, v_user) returning id into v_log;
  v_logs := v_logs || v_log;
  insert into labour_logs (plot_id, custom_name, contractor_id, log_date, kind, masons, helpers, others, work_class, created_by, updated_by)
  values (v_w1, 'Trial 0166 b', v_contractor, current_date - 2, 'nmr', 0, 1, 0, 'additional', v_user, v_user) returning id into v_log;
  v_logs := v_logs || v_log;
  insert into labour_logs (plot_id, custom_name, contractor_id, log_date, kind, masons, helpers, others, work_class, created_by, updated_by)
  values (v_w2, 'Trial 0166 c', v_contractor, current_date - 2, 'nmr', 0, 3, 0, 'additional', v_user, v_user) returning id into v_log;
  v_logs := v_logs || v_log;
  insert into labour_logs (plot_id, custom_name, contractor_id, log_date, kind, masons, helpers, others, work_class, created_by, updated_by)
  values (v_wi, 'Trial 0166 d', v_contractor, current_date - 1, 'nmr', 2, 0, 0, 'additional', v_user, v_user) returning id into v_log;
  v_logs := v_logs || v_log;
  set local role authenticated;
  v_bill := send_labour_logs_to_bill(v_logs, null, '', current_date,
    jsonb_build_object('mason', 1100, 'helper', 450, 'gst_pct', 0), null, null, null);
  select count(*) into v_count from bill_lines where bill_id = v_bill;
  if v_count <> 4 then
    raise exception 'TRIAL 4 FAILED: % lines, not masons + helpers on the first villa, helpers on the second, masons on Infrastructure', v_count;
  end if;
  if (select quantity from bill_lines where bill_id = v_bill and plot_id = v_w1 and description like 'Helpers%') <> 3
     or (select project_id from bill_lines where bill_id = v_bill and plot_id = v_wi) is distinct from v_west_infra then
    raise exception 'TRIAL 4 FAILED: a villa''s man-days were not kept on its own line';
  end if;
  select project_id::text || '/' || coalesce(plot_id::text, 'none') || '/' || reference into v_text from bills where id = v_bill;
  if v_text not like v_west_villas::text || '/none/QZVY-NMR-EP-%' then
    raise exception 'TRIAL 4 FAILED: the header is %, not Saarang West - Villas with no villa', v_text;
  end if;
  if (select total_amount from bills where id = v_bill) <> 1100 * 3 + 450 * 6 then
    raise exception 'TRIAL 4 FAILED: the total is not the man-days at their rates';
  end if;

  -- 5. Piece-work: each line names its log's villa. Entries of two companies are refused.
  reset role;
  insert into labour_logs (plot_id, custom_name, contractor_id, log_date, kind, masons, helpers, others, description, work_class, created_by, updated_by)
  values (v_p1, 'Trial 0166 e', v_contractor, current_date - 1, 'pw_lump', 0, 0, 0, 'Break and relay', 'rework', v_user, v_user)
  returning id into v_log;
  v_logs := array[v_log];
  insert into labour_logs (plot_id, custom_name, contractor_id, log_date, kind, masons, helpers, others, description, work_class, created_by, updated_by)
  values (v_ch, 'Trial 0166 f', v_contractor, current_date - 1, 'pw_lump', 0, 0, 0, 'Patch', 'rework', v_user, v_user)
  returning id into v_line;
  set local role authenticated;
  v_message := null;
  begin
    perform send_labour_logs_to_bill(v_logs || v_line, null, '', current_date,
      jsonb_build_object(v_log::text, jsonb_build_object('rate', 5000), v_line::text, jsonb_build_object('rate', 3000)),
      null, null, null);
  exception when raise_exception then v_message := sqlerrm;
  end;
  if v_message is null or v_message not like 'A bill is for one company%' then
    raise exception 'TRIAL 5 FAILED: EF and ED entries together gave "%"', v_message;
  end if;
  v_bill := send_labour_logs_to_bill(v_logs, null, '', current_date,
    jsonb_build_object(v_log::text, jsonb_build_object('rate', 5000)), null, null, null);
  if (select plot_id from bill_lines where bill_id = v_bill) is distinct from v_p1
     or (select plot_id from bills where id = v_bill) is distinct from v_p1 then
    raise exception 'TRIAL 5 FAILED: a one-villa piece-work bill lost its villa';
  end if;

  -- 6. Villa costs: the daily-wages bill's second villa gains exactly its own helpers, though the header names no villa.
  reset role;
  if (select coalesce(sum(amount), 0) from villa_cost_facts where plot_id = v_w2 and kind = 'labour_billed') - v_before <> 1350 then
    raise exception 'TRIAL 6 FAILED: the second Saarang West villa''s helpers are not in its cost';
  end if;

  raise exception 'ALL TRIALS PASSED';
end $trial$;
