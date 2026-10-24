-- Behaviour trial for 0150 — a master nothing uses is deleted by an admin; anything used, or anyone else, is refused.
-- Runs inside the dry-run transaction; always rolled back, UNDER ROW-LEVEL SECURITY (BUGCATCHER #19), as the staff
-- account holding /masters, first as staff and then made an admin.
--
--   npx tsx scripts/dry-run-migrations.ts --project ipstebqawrvhkyntctrv \
--     supabase/migrations/0150_*.sql --trial scripts/trials/masters-delete-unused.sql
do $trial$
declare
  v_user uuid := (select id from auth.users where email = 'siddharth.cyriac.99@gmail.com');
  s_user uuid := gen_random_uuid();
  v_item_like items%rowtype;
  v_unit_type text := (select unit_type from units order by id limit 1);
  v_project_type text := (select project_type from projects order by id limit 1);
  p_free uuid;
  p_store uuid;
  pl_free uuid;
  p_bare uuid;
  p_planned uuid;
  pl_bare uuid;
  u_filled uuid;
  pl_other uuid;
  u_free uuid;
  u_sold uuid;
  u_schedule uuid;
  u_receipt uuid;
  c_free uuid;
  b_free uuid;
  b_used uuid;
  i_free uuid;
  i_margin uuid;
  v_free uuid;
  v_banked uuid;
  v_text text;
  v_state text;
begin
  select * into v_item_like from items order by id limit 1;
  if v_user is null or v_unit_type is null or v_project_type is null or v_item_like.id is null then
    raise exception 'TRIAL SETUP: staging is missing the staff account, a unit, a project or an item';
  end if;

  update profiles set role_id = null, role = 'staff' where id = v_user;
  delete from user_apps where user_id = v_user;
  delete from tool_leads where user_id = v_user;
  insert into user_apps (user_id, app) values (v_user, '/masters');

  -- Setup as a script: a project holding a free plot and villas, and one project with a store.
  insert into projects (name, project_type) values ('Trial 0150 project', v_project_type) returning id into p_free;
  insert into projects (name, project_type) values ('Trial 0150 stored', v_project_type) returning id into p_store;
  insert into stores (name, project_id) values ('Trial 0150 store', p_store);
  insert into plots (name, project_id) values ('T0150-A', p_free) returning id into pl_free;
  insert into units (name, plot_id, project_id, unit_type) values ('T0150 free', pl_free, p_free, v_unit_type)
  returning id into u_free;
  insert into clients (name) values ('Trial 0150 client') returning id into c_free;
  insert into plots (name, project_id) values ('T0150-B', p_free) returning id into pl_free;
  insert into units (name, plot_id, project_id, unit_type, client_id)
  values ('T0150 sold', pl_free, p_free, v_unit_type, c_free) returning id into u_sold;
  insert into plots (name, project_id) values ('T0150-C', p_free) returning id into pl_other;
  insert into units (name, plot_id, project_id, unit_type) values ('T0150 schedule', pl_other, p_free, v_unit_type)
  returning id into u_schedule;
  -- Changed since seeded: created five minutes ago, updated now (one transaction shares one now()).
  update client_payment_milestones set due_amount = 100000, created_at = now() - interval '5 minutes'
   where stage = 'booking' and engagement_id = (select id from client_engagements where unit_id = u_schedule);
  insert into plots (name, project_id) values ('T0150-E', p_free) returning id into pl_other;
  insert into units (name, plot_id, project_id, unit_type) values ('T0150 filled', pl_other, p_free, v_unit_type)
  returning id into u_filled;
  update client_engagements set plot_value = 4500000, created_at = now() - interval '5 minutes'
   where unit_id = u_filled;
  -- A bare project and a bare plot; and a project whose Relay plan someone set.
  insert into projects (name, project_type) values ('Trial 0150 bare', v_project_type) returning id into p_bare;
  insert into plots (name, project_id) values ('T0150-F', p_store) returning id into pl_bare;
  insert into projects (name, project_type) values ('Trial 0150 planned', v_project_type) returning id into p_planned;
  update pusher_project_plans set start_date = current_date + 30, created_at = now() - interval '5 minutes'
   where project_id = p_planned;
  insert into plots (name, project_id) values ('T0150-D', p_free) returning id into pl_other;
  insert into units (name, plot_id, project_id, unit_type) values ('T0150 receipt', pl_other, p_free, v_unit_type)
  returning id into u_receipt;
  insert into client_receipts (engagement_id, amount, received_on, mode)
  select id, 1, current_date, 'bank' from client_engagements where unit_id = u_receipt;
  insert into brands (name) values ('Trial 0150 free brand') returning id into b_free;
  insert into brands (name) values ('Trial 0150 used brand') returning id into b_used;
  insert into items (name, category_id, default_uom, kind, brand_id)
  values ('Trial 0150 branded', v_item_like.category_id, v_item_like.default_uom, v_item_like.kind, b_used);
  insert into items (name, category_id, default_uom, kind)
  values ('Trial 0150 free item', v_item_like.category_id, v_item_like.default_uom, v_item_like.kind)
  returning id into i_free;
  insert into items (name, category_id, default_uom, kind)
  values ('Trial 0150 margin item', v_item_like.category_id, v_item_like.default_uom, v_item_like.kind)
  returning id into i_margin;
  insert into item_margins (item_id, margin_pct) values (i_margin, 10);
  insert into vendors (name) values ('Trial 0150 free vendor') returning id into v_free;
  insert into vendors (name) values ('Trial 0150 banked vendor') returning id into v_banked;
  insert into vendor_payment_details (vendor_id) values (v_banked);

  insert into auth_verified_sessions (session_id, user_id, method) values (s_user, v_user, 'otp');
  perform set_config('request.jwt.claims', json_build_object('sub', v_user,
    'role', 'authenticated', 'session_id', s_user)::text, true);
  set local role authenticated;

  -- 1. A Masters holder who is not an admin deletes nothing, not even an unused brand.
  delete from brands where id = b_free;
  delete from vendors where id = v_free;
  reset role;
  if (select count(*) from brands where id = b_free) + (select count(*) from vendors where id = v_free) <> 2 then
    raise exception 'TRIAL 1 FAILED: a non-admin deleted a master';
  end if;

  perform set_config('request.jwt.claims', '', true);
  update profiles set role = 'admin' where id = v_user;
  perform set_config('request.jwt.claims', json_build_object('sub', v_user,
    'role', 'authenticated', 'session_id', s_user)::text, true);
  set local role authenticated;

  -- 2. An admin deletes what nothing uses: a unit with its seeded Client Relations record, a project with its
  --    seeded Relay plan and stages, a bare plot.
  delete from brands where id = b_free;
  delete from vendors where id = v_free;
  delete from items where id = i_free;
  delete from units where id = u_free;
  delete from plots where id = pl_bare;
  delete from projects where id = p_bare;
  reset role;
  if exists (select 1 from brands where id = b_free) or exists (select 1 from vendors where id = v_free)
     or exists (select 1 from items where id = i_free) or exists (select 1 from units where id = u_free)
     or exists (select 1 from client_engagements where unit_id = u_free)
     or exists (select 1 from plots where id = pl_bare) or exists (select 1 from projects where id = p_bare)
     or exists (select 1 from pusher_project_plans where project_id = p_bare)
     or exists (select 1 from project_stages where project_id = p_bare) then
    raise exception 'TRIAL 2 FAILED: an admin could not delete an unused master';
  end if;
  set local role authenticated;

  -- 3. The links that would blank or take rows with them are refused by the guard, in words.
  v_text := null;
  begin delete from brands where id = b_used; exception when others then v_text := sqlerrm; end;
  if v_text is distinct from 'Items use this brand, so it cannot be deleted' then
    raise exception 'TRIAL 3a FAILED: deleting a used brand gave %', coalesce(v_text, 'no refusal');
  end if;
  v_text := null;
  begin delete from clients where id = c_free; exception when others then v_text := sqlerrm; end;
  if v_text is distinct from 'Units use this client, so it cannot be deleted' then
    raise exception 'TRIAL 3b FAILED: deleting a client with a villa gave %', coalesce(v_text, 'no refusal');
  end if;
  v_text := null;
  begin delete from projects where id = p_store; exception when others then v_text := sqlerrm; end;
  if v_text is distinct from 'Stores use this project, so it cannot be deleted' then
    raise exception 'TRIAL 3c FAILED: deleting a project with a store gave %', coalesce(v_text, 'no refusal');
  end if;
  v_text := null;
  begin delete from items where id = i_margin; exception when others then v_text := sqlerrm; end;
  if v_text is distinct from 'Budget margins use this item, so it cannot be deleted' then
    raise exception 'TRIAL 3d FAILED: deleting an item with a margin gave %', coalesce(v_text, 'no refusal');
  end if;

  v_text := null;
  begin delete from projects where id = p_planned; exception when others then v_text := sqlerrm; end;
  if v_text is distinct from 'Relay has a schedule on this project, so it cannot be deleted' then
    raise exception 'TRIAL 3e FAILED: deleting a project with a set Relay plan gave %', coalesce(v_text, 'no refusal');
  end if;

  -- 4. A unit with a buyer, or Client Relations details, is refused; one with a receipt is refused by its key.
  v_text := null;
  begin delete from units where id = u_sold; exception when others then v_text := sqlerrm; end;
  if v_text is distinct from 'This unit is reserved or sold, so it cannot be deleted' then
    raise exception 'TRIAL 4a FAILED: deleting a sold villa gave %', coalesce(v_text, 'no refusal');
  end if;
  v_text := null;
  begin delete from units where id = u_schedule; exception when others then v_text := sqlerrm; end;
  if v_text is distinct from 'Client Relations has details on this unit, so it cannot be deleted' then
    raise exception 'TRIAL 4b FAILED: deleting a unit with a schedule gave %', coalesce(v_text, 'no refusal');
  end if;
  v_text := null;
  begin delete from units where id = u_filled; exception when others then v_text := sqlerrm; end;
  if v_text is distinct from 'Client Relations has details on this unit, so it cannot be deleted' then
    raise exception 'TRIAL 4d FAILED: deleting a unit with a filled-in plot record gave %', coalesce(v_text, 'no refusal');
  end if;
  v_state := null;
  begin delete from units where id = u_receipt; exception when others then v_state := sqlstate; end;
  if v_state is distinct from '23503' then
    raise exception 'TRIAL 4c FAILED: deleting a villa with a receipt gave %', coalesce(v_state, 'no refusal');
  end if;

  -- 5. Any other use refuses by its key: bank details on a vendor, villas on a plot and project.
  foreach v_text in array array['vendor', 'plot', 'project'] loop
    v_state := null;
    begin
      if v_text = 'vendor' then delete from vendors where id = v_banked;
      elsif v_text = 'plot' then delete from plots where id = pl_free;
      else delete from projects where id = p_free;
      end if;
    exception when others then v_state := sqlstate;
    end;
    if v_state is distinct from '23503' then
      raise exception 'TRIAL 5 FAILED: deleting a used % gave %', v_text, coalesce(v_state, 'no refusal');
    end if;
  end loop;

  reset role;
  if (select count(*) from units where id in (u_sold, u_schedule, u_receipt, u_filled)) <> 4
     or (select count(*) from client_engagements where unit_id in (u_schedule, u_receipt, u_filled)) <> 3
     or not exists (select 1 from pusher_project_plans where project_id = p_free)
     or not exists (select 1 from pusher_project_plans where project_id = p_planned) then
    raise exception 'TRIAL 6 FAILED: a refused villa delete left something behind half done';
  end if;

  raise notice 'TRIAL 0150 OK — unused masters delete by an admin only, with their blank plot record; anything used is refused';
end $trial$;
