-- The test project, its whole chain filled (plan.md, piece 3). Run through scripts/seed-test-project.ts, which rehearses it in a
-- rolled-back transaction first. Everything is made as the founder's admin login, through the tools' own functions where one
-- exists, so every guard, number and trigger runs as it would in the app. Hangs entirely off one project marked is_test, so
-- Settings → Test project's red button (delete_test_project, 0142) removes all of it.
do $seed$
declare
  v_admin uuid := (select id from auth.users where email = 'siddharth@goodearthkannur.org');
  v_session uuid := gen_random_uuid();
  v_company uuid := (select company_id from projects where code = 'SAAVILLA');
  v_project uuid;
  v_plot uuid;
  v_unit uuid;
  v_store_main uuid;
  v_store_site uuid;
  v_working uuid;
  v_official uuid;
  v_ref text;
  v_start date := current_date - 120;
  v_at date;
  v_line uuid;
  v_indent uuid;
  v_po uuid;
  v_grn uuid;
  v_iss uuid;
  v_req uuid;
  v_conf uuid;
  v_chk uuid;
  v_rev uuid;
  v_tx uuid;
  v_wo uuid;
  v_bill uuid;
  v_logs uuid[];
  v_work record;
  v_mat record;
  v_stage record;
  v_n int := 0;
  v_vendors uuid[];
  v_contractors uuid[];
  v_added_approver boolean := false;
  v_added_bill_approver boolean := false;
begin
  if v_admin is null or v_company is null then
    raise exception 'SEED: the admin login or the Saarang company is missing';
  end if;
  if exists (select 1 from projects where is_test) then
    raise exception 'SEED: a test project already exists — delete it from Settings first';
  end if;

  -- As the admin, verified, so has_app() and the approver checks pass as they would for them.
  insert into auth_verified_sessions (session_id, user_id, method) values (v_session, v_admin, 'otp');
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_session)::text, true);
  if not exists (select 1 from indent_approvers where user_id = v_admin) then
    insert into indent_approvers (user_id) values (v_admin);
    v_added_approver := true;
  end if;
  if not exists (select 1 from bill_approvers where user_id = v_admin) then
    insert into bill_approvers (user_id) values (v_admin);
    v_added_bill_approver := true;
  end if;

  -- 1. The project, its villa and two stores.
  insert into projects (name, code, project_type, status, company_id, location, is_test)
  values ('Test project', 'TEST', 'eco_village', 'active', v_company, 'Not a real site', true)
  returning id into v_project;
  insert into plots (project_id, name, code, status) values (v_project, 'Test plot 1', 'T1', 'sold')
  returning id into v_plot;
  insert into units (project_id, plot_id, name, unit_type, code, status)
  values (v_project, v_plot, 'Test villa 1', 'villa', 'TV1', 'sold') returning id into v_unit;
  insert into stores (name, project_id, location, is_active)
  values ('Test main store', v_project, 'Test project yard', true) returning id into v_store_main;
  insert into stores (name, project_id, location, is_active)
  values ('Test site store', v_project, 'Test plot 1', true) returning id into v_store_site;

  select array_agg(id order by name) into v_vendors
    from (select id, name from vendors where is_active and not is_contractor order by name limit 3) v;
  select array_agg(id order by name) into v_contractors
    from (select id, name from vendors where is_active and is_contractor order by name limit 2) c;

  -- 2. A big official estimate: two works from every stage in the sequence that has a labour rate, plus the size work.
  v_working := start_villa_estimate(v_unit, null, false, 'Test villa 1');
  for v_work in
    select distinct on (s.position, w.code) w.id, w.code, wi.labour_rate, s.position
      from site_sequence s
      join work_items w on w.group_id = s.work_group_id and w.is_active
      left join estimator_work_info wi on wi.work_item_id = w.id
     where (wi.labour_rate is not null or w.code = 'SS.01.00')
     order by s.position, w.code
  loop
    continue when (select count(*) from estimator_estimate_lines l join work_items w on w.id = l.work_item_id
                    where l.estimate_id = v_working and w.group_id = (select group_id from work_items where id = v_work.id)) >= 2
               and v_work.code <> 'SS.01.00';
    v_n := v_n + 1;
    insert into estimator_estimate_lines (estimate_id, work_item_id, qty, created_by, updated_by)
    values (v_working, v_work.id, case when v_work.code = 'SS.01.00' then 2400 else 40 + (v_n * 37) % 260 end,
            v_admin, v_admin)
    returning id into v_line;
    insert into estimator_estimate_line_measurements (line_id, description, nos, length, created_by, updated_by)
    values (v_line, 'Test measure', 1, (select qty from estimator_estimate_lines where id = v_line), v_admin, v_admin);
  end loop;
  if v_n < 20 then
    raise exception 'SEED: only % works with a labour rate — the estimate would be thin', v_n;
  end if;

  -- What each work needs: a material or two by its stage family, from the catalogue at its budgeting rate.
  create temp table seed_takeoff on commit drop as
  select l.work_item_id, m.id as item_id, m.name as material_name, m.default_uom as uom,
         round(l.qty * m.factor, 2) as quantity, m.indicative_price as rate
    from estimator_estimate_lines l
    join work_items w on w.id = l.work_item_id
    join work_groups g on g.id = w.group_id
    cross join lateral (
      select i.id, i.name, i.default_uom, i.indicative_price, p.factor
        from (values
          ('FD', 'cement', 0.4), ('FD', 'steel', 0.08), ('SS', 'cement', 0.3), ('SS', 'block', 1.2),
          ('PF', 'cement', 0.2), ('PF', 'sand', 0.05), ('F', 'tile', 1.05), ('F', 'emulsion', 0.02),
          ('MEP', 'wire', 0.5), ('MEP', 'pipe', 0.3), ('CAR', 'plywood', 0.05), ('CAR', 'hinge', 0.1),
          ('LP', 'stone', 0.9), ('LP', 'cement', 0.1)
        ) as p(family, word, factor)
        join lateral (
          select i.* from items i
           where i.is_active and i.indicative_price > 0 and i.default_uom is not null and i.name ilike '%' || p.word || '%'
           order by i.code limit 1
        ) i on true
       where p.family = split_part(g.code, '.', 1)
    ) m
   where l.estimate_id = v_working;

  perform make_estimate_official(
    v_working,
    (select jsonb_agg(jsonb_build_object(
        'work_item_id', l.work_item_id, 'qty', l.qty, 'uom', wi.uom, 'labour_rate', wi.labour_rate,
        'labour_cost', round(l.qty * coalesce(wi.labour_rate, 0), 2),
        'material_cost', coalesce(t.cost, 0),
        'total_cost', round(l.qty * coalesce(wi.labour_rate, 0), 2) + coalesce(t.cost, 0)))
       from estimator_estimate_lines l
       left join estimator_work_info wi on wi.work_item_id = l.work_item_id
       left join (select work_item_id, round(sum(quantity * rate), 2) as cost from seed_takeoff group by 1) t
         on t.work_item_id = l.work_item_id
      where l.estimate_id = v_working),
    coalesce((select jsonb_agg(to_jsonb(t)) from seed_takeoff t), '[]'::jsonb));
  select id, reference into v_official, v_ref
    from estimator_estimates where unit_id = v_unit and status = 'submitted' and not is_working;

  -- 3. The site: started four months ago, the first stages done, one working, one waiting; the admin runs it.
  insert into site_villas (plot_id, supervisor_id, start_on, note)
  values (v_plot, v_admin, v_start, 'Test villa — not a real site');
  v_at := v_start;
  v_n := 0;
  for v_stage in
    select s.work_group_id, coalesce(s.typical_days, 5) as days, s.wait_days
      from site_sequence s
     where exists (select 1 from estimator_estimate_lines l join work_items w on w.id = l.work_item_id
                    where l.estimate_id = v_official and w.group_id = s.work_group_id)
     order by s.position
  loop
    v_n := v_n + 1;
    exit when v_at > current_date - 3;
    if v_at + v_stage.days < current_date - 3 then
      insert into site_stages (plot_id, work_group_id, status, started_on, finished_on, contractor_id)
      values (v_plot, v_stage.work_group_id, 'done', v_at, v_at + v_stage.days - 1, v_contractors[1 + v_n % 2]);
      v_at := v_at + v_stage.days + v_stage.wait_days;
    else
      insert into site_stages (plot_id, work_group_id, status, started_on, contractor_id)
      values (v_plot, v_stage.work_group_id, 'working', v_at, v_contractors[1]);
      exit;
    end if;
  end loop;
  insert into site_stages (plot_id, work_group_id, status, started_on, waiting_on, waiting_note, contractor_id)
  select v_plot, s.work_group_id, 'waiting', current_date - 6, 'material', 'Test: waiting on the delivery', v_contractors[2]
    from site_sequence s
   where exists (select 1 from estimator_estimate_lines l join work_items w on w.id = l.work_item_id
                  where l.estimate_id = v_official and w.group_id = s.work_group_id)
     and not exists (select 1 from site_stages x where x.plot_id = v_plot and x.work_group_id = s.work_group_id)
   order by s.position limit 1;

  -- 4. Indents from the estimate, one per work with material, approved; one line off the estimate the estimator said yes to.
  for v_work in
    select t.work_item_id, min(w.code) as code
      from seed_takeoff t join work_items w on w.id = t.work_item_id
     group by t.work_item_id order by min(w.code) limit 8
  loop
    v_indent := create_indent(v_project, null, v_unit, null, current_date + 7, 'Test indent for ' || v_work.code);
    update indents set work_item_id = v_work.work_item_id, updated_by = v_admin where id = v_indent;
    insert into indent_lines (indent_id, item_id, quantity, uom, estimate_id, created_by, updated_by)
    select v_indent, t.item_id, t.quantity, t.uom, v_official, v_admin, v_admin
      from estimator_estimate_takeoff t
     where t.estimate_id = v_official and t.work_item_id = v_work.work_item_id and t.item_id is not null;
    update indents set status = 'submitted', submitted_by = v_admin, submitted_at = now() where id = v_indent;
    update indents set status = 'approved', approved_by = v_admin, approved_at = now() where id = v_indent;
  end loop;

  -- 5. POs from the approved indents, one per vendor, issued at the budgeting rate (no rate is raised).
  for v_n in 1 .. array_length(v_vendors, 1) loop
    v_po := create_purchase_order(v_project, null, v_unit, v_vendors[v_n],
      case when v_n = 1 then v_store_main else v_store_site end, null, current_date + 5, null, 'Test PO');
    insert into purchase_order_lines (po_id, item_id, quantity, uom, rate, gst_pct, indent_line_id, created_by, updated_by)
    select v_po, il.item_id, il.quantity, il.uom, i.indicative_price, 18, il.id, v_admin, v_admin
      from indent_lines il
      join indents ind on ind.id = il.indent_id and ind.project_id = v_project
      join items i on i.id = il.item_id
     where abs(hashtext(il.id::text)) % array_length(v_vendors, 1) = v_n - 1;
    if exists (select 1 from purchase_order_lines where po_id = v_po) then
      update purchase_orders set status = 'issued', issued_by = v_admin, issued_at = now() where id = v_po;
    else
      perform delete_draft_purchase_order(v_po);
    end if;
  end loop;

  -- 6. Deliveries: each issued PO in full into its store, the last one straight to site.
  v_n := 0;
  for v_po in select id from purchase_orders where project_id = v_project and status = 'issued' order by po_no loop
    v_n := v_n + 1;
    v_grn := create_goods_receipt(v_po,
      case when v_n = 3 then null else (select deliver_store_id from purchase_orders where id = v_po) end,
      v_n = 3,
      case when v_n = 3 then (select ind.work_item_id from purchase_order_lines pl
                                join indent_lines il on il.id = pl.indent_line_id
                                join indents ind on ind.id = il.indent_id
                               where pl.po_id = v_po limit 1) end,
      'TEST-CH-' || v_n, current_date - 20 + v_n, 'Test delivery');
    insert into goods_receipt_lines (receipt_id, po_line_id, item_id, quantity, uom, created_by, updated_by)
    select v_grn, pl.id, pl.item_id, pl.quantity, pl.uom, v_admin, v_admin
      from purchase_order_lines pl where pl.po_id = v_po;
  end loop;

  -- 7. The site asks for material, the store issues it, the site confirms one issue short.
  for v_mat in
    select gl.item_id, gl.uom, least(gl.quantity, greatest(1, round(gl.quantity / 2))) as qty, il.indent_id,
           (select work_item_id from indents where id = il.indent_id) as work_item_id, gr.store_id
      from goods_receipt_lines gl
      join goods_receipts gr on gr.id = gl.receipt_id and gr.project_id = v_project and not gr.to_site
      join purchase_order_lines pl on pl.id = gl.po_line_id
      join indent_lines il on il.id = pl.indent_line_id
     order by gl.created_at limit 4
  loop
    insert into issue_requests (plot_id, work_item_id, item_id, quantity, note, created_by, updated_by)
    values (v_plot, v_mat.work_item_id, v_mat.item_id, v_mat.qty, 'Test request', v_admin, v_admin)
    returning id into v_req;
    v_iss := create_stock_issue(v_mat.store_id, null, v_plot, v_mat.work_item_id, v_project, current_date - 5, 'Test issue');
    insert into stock_issue_lines (issue_id, item_id, quantity, uom, created_by, updated_by)
    values (v_iss, v_mat.item_id, v_mat.qty, v_mat.uom, v_admin, v_admin);
    update issue_requests set status = 'fulfilled', fulfilled_issue_id = v_iss, updated_by = v_admin where id = v_req;
  end loop;
  insert into issue_requests (plot_id, work_item_id, item_id, quantity, note, created_by, updated_by)
  select v_plot, t.work_item_id, t.item_id, round(t.quantity / 4, 2), 'Test request — still open', v_admin, v_admin
    from estimator_estimate_takeoff t where t.estimate_id = v_official and t.item_id is not null
   order by t.created_at desc limit 1;
  select id into v_iss from stock_issues where project_id = v_project order by iss_no limit 1;
  insert into site_receipt_confirmations (issue_id, note, confirmed_by)
  values (v_iss, 'Test: one bag short', v_admin) returning id into v_conf;
  insert into site_receipt_confirmation_lines (confirmation_id, issue_line_id, received_quantity)
  select v_conf, l.id, greatest(l.quantity - 1, 0) from stock_issue_lines l where l.issue_id = v_iss;

  -- 8. Labour: daily wages on the working stage for the last ten days, and piece-work on a done one.
  select array_agg(id) into v_logs from (
    select w.id from site_stages s join work_items w on w.group_id = s.work_group_id and w.is_active
     where s.plot_id = v_plot and s.status = 'working' order by w.code limit 1) x;
  for v_n in 1 .. 10 loop
    insert into labour_logs (plot_id, work_item_id, contractor_id, log_date, kind, masons, helpers, created_by, updated_by)
    values (v_plot, v_logs[1], v_contractors[1], current_date - v_n, 'nmr', 2 + v_n % 3, 3, v_admin, v_admin);
  end loop;
  insert into labour_logs (plot_id, work_item_id, contractor_id, log_date, kind, quantity, uom, created_by, updated_by)
  select v_plot, l.work_item_id, v_contractors[2], current_date - 30, 'pw_qty', round(l.qty * 0.6, 2), wi.uom, v_admin, v_admin
    from estimator_estimate_lines l join estimator_work_info wi on wi.work_item_id = l.work_item_id and wi.uom is not null
   where l.estimate_id = v_official order by l.created_at limit 2;

  -- 9. A checklist half done on the working stage, if one inspects it, else on any template.
  insert into site_checklists (plot_id, template_id, location, started_on, work_group_id, created_by, updated_by)
  select v_plot, t.id, 'Ground floor', current_date - 2,
         (select work_group_id from site_stages where plot_id = v_plot and status = 'working' limit 1), v_admin, v_admin
    from checklist_templates t where t.is_active
   order by exists (select 1 from checklist_template_groups g where g.template_id = t.id
                     and g.work_group_id = (select work_group_id from site_stages where plot_id = v_plot and status = 'working' limit 1)) desc,
            t.sort_order
   limit 1
  returning id into v_chk;
  insert into site_checklist_items (checklist_id, template_item_id, status, remarks, created_by, updated_by)
  select v_chk, i.id,
         case when row_number() over (order by i.sort_order) <= 4 then 'pass'
              when row_number() over (order by i.sort_order) = 5 then 'fail' else 'not_checked' end,
         case when row_number() over (order by i.sort_order) = 5 then 'Test: cover blocks missing' end,
         v_admin, v_admin
    from checklist_template_items i
   where i.template_id = (select template_id from site_checklists where id = v_chk) and i.is_active;

  -- 10. Drawings: three released revisions with dummy WorkDrive links and sheets, tied to the estimate's works; a transmittal.
  for v_work in
    select ds.id, ds.name, ds.design_stage_id, row_number() over (order by ds.name) as k
      from (select distinct on (name) id, name, design_stage_id from drawing_sets
             where is_active and name in ('Foundation Layout', 'Architecture GFC', 'Electrical & Plumbing Sleeve Details')
             order by name, created_at) ds
  loop
    insert into drawing_revisions (unit_id, drawing_set_id, revision_no, note, status, drawings_url, created_by)
    values (v_unit, v_work.id, 0, 'Test drawings', 'draft',
            'https://workdrive.zohoexternal.com/external/testdummy' || replace(gen_random_uuid()::text, '-', ''), v_admin)
    returning id into v_rev;
    insert into drawing_revision_folder_sheets (drawing_revision_id, workdrive_id, name, sort_order, created_by)
    select v_rev, 'test-' || v_work.k || '-' || n, format('TV1-%s-%s R0.pdf', upper(left(v_work.name, 3)), lpad(n::text, 2, '0')), n, v_admin
      from generate_series(1, 4) n;
    insert into drawing_revision_works (drawing_revision_id, work_item_id, created_by)
    select v_rev, l.work_item_id, v_admin from estimator_estimate_lines l
     where l.estimate_id = v_official order by l.created_at offset (v_work.k - 1) * 4 limit 4;
    update drawing_revisions set status = 'released', released_at = now(), released_by = v_admin where id = v_rev;
  end loop;
  insert into transmittals (unit_id, design_stage_id, note, created_by)
  select v_unit, design_stage_id, 'Test transmittal', v_admin from drawing_sets
   where id = (select drawing_set_id from drawing_revisions where unit_id = v_unit order by created_at limit 1)
  returning id into v_tx;
  insert into transmittal_lines (transmittal_id, unit_id, drawing_revision_id, sort_order, created_by)
  select v_tx, v_unit, r.id, row_number() over (order by r.created_at), v_admin
    from drawing_revisions r join drawing_sets ds on ds.id = r.drawing_set_id
   where r.unit_id = v_unit and ds.design_stage_id = (select design_stage_id from transmittals where id = v_tx);
  perform issue_transmittal(v_tx);

  -- 11. Money: a work order, the first PO billed, and two weeks of wages sent to a bill.
  insert into labour_contracts (vendor_id, project_id, unit_id, description, contract_value, created_by, updated_by)
  values (v_contractors[1], v_project, v_unit, 'Test work order', 1, v_admin, v_admin) returning id into v_wo;
  insert into labour_contract_lines (contract_id, work_item_id, description, uom, quantity, rate, created_by, updated_by)
  select v_wo, l.work_item_id, 'Test line', wi.uom, l.qty, wi.labour_rate, v_admin, v_admin
    from estimator_estimate_lines l join estimator_work_info wi on wi.work_item_id = l.work_item_id
   where l.estimate_id = v_official and wi.uom is not null and wi.labour_rate is not null order by l.created_at limit 3;
  update labour_contracts set status = 'approved', approved_by = v_admin, approved_at = now() where id = v_wo;
  select id into v_po from purchase_orders where project_id = v_project and status <> 'draft' order by po_no limit 1;
  v_bill := create_bill(v_po, null, 'TEST-INV-1', current_date - 10,
    (select round(sum(quantity * rate), 2) from purchase_order_lines where po_id = v_po),
    (select round(sum(quantity * rate * gst_pct / 100), 2) from purchase_order_lines where po_id = v_po),
    (select round(sum(quantity * rate * (1 + gst_pct / 100)), 2) from purchase_order_lines where po_id = v_po),
    'Test bill');
  insert into bill_lines (bill_id, line_kind, po_line_id, item_id, description, uom, quantity, rate, gst_pct, created_by, updated_by)
  select v_bill, 'material', pl.id, pl.item_id, i.name, pl.uom, pl.quantity, pl.rate, pl.gst_pct, v_admin, v_admin
    from purchase_order_lines pl join items i on i.id = pl.item_id where pl.po_id = v_po;
  select array_agg(id) into v_logs from labour_logs where plot_id = v_plot and kind = 'nmr' and log_date < current_date - 5;
  perform send_labour_logs_to_bill(v_logs, null, 'TEST-MR-1', current_date - 4,
    '{"mason": 1000, "helper": 800, "gst_pct": 0}'::jsonb, null, null, 'Test wages');

  -- 12. Design Management's board: the villa at its working drawings, a designer on it.
  perform design_set_where(v_unit, (select id from design_stages where name = 'Working Drawings'),
    array(select ua.user_id from user_apps ua join profiles p on p.id = ua.user_id and p.is_active
           where ua.app = '/design-management' order by p.full_name limit 1));

  if v_added_approver then delete from indent_approvers where user_id = v_admin; end if;
  if v_added_bill_approver then delete from bill_approvers where user_id = v_admin; end if;
  delete from auth_verified_sessions where session_id = v_session;
  raise notice 'SEEDED: % with %', v_official, v_ref;
end $seed$;
