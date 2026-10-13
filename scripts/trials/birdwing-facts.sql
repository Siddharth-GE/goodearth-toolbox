-- Behaviour trial for 0117 — Birdwing's money for Financial Management and
-- Reporter. Runs inside the dry-run transaction, after 0115–0116; always
-- rolled back. Under RLS after the setup (BUGCATCHER #19): the staff
-- account holding /financial-management alone, then /birdwing alone,
-- then the probe.
--
--   npx tsx scripts/dry-run-migrations.ts --project ipstebqawrvhkyntctrv \
--     supabase/migrations/0117_*.sql --trial scripts/trials/birdwing-facts.sql
do $trial$
declare
  v_staff uuid := (select id from auth.users where email = 'siddharth.cyriac.99@gmail.com');
  v_probe uuid := (select id from auth.users where email = 'siddharth.cyriac.99+probe@gmail.com');
  v_guest uuid;
  v_paying uuid;
  v_internal uuid;
  v_cancelled uuid;
  v_imported uuid;
  v_block uuid;
  v_marketing uuid := (select id from birdwing_cost_centres where name = 'Marketing');
  v_food uuid := (select id from birdwing_expense_heads where name = 'Food Supplies');
  v_salary uuid := (select id from birdwing_expense_heads where is_salary);
  v_month date := date '2031-03-01';
  f record;
  v_count int;
begin
  if v_staff is null or v_probe is null then
    raise exception 'TRIAL SETUP: the staff or probe account is missing on staging';
  end if;

  -- Setup, as the owner, in a month nothing real will ever touch.
  insert into birdwing_guests (name, phone) values ('Trial Facts Guest', '9000000000')
  returning id into v_guest;

  -- A paying guest: R1 for two nights, ₹7,980 room + ₹1,050 dinner,
  -- ₹500 OTA commission, ₹5,000 received.
  insert into birdwing_stays (guest_id, use, channel, status, arrival, departure, adults,
                              ota_commission)
  values (v_guest, 'guest', 'airbnb', 'confirmed', date '2031-03-06', date '2031-03-08', 2, 500)
  returning id into v_paying;
  insert into birdwing_stay_rooms (stay_id, room_id, from_date, to_date)
  select v_paying, id, date '2031-03-06', date '2031-03-08' from birdwing_rooms where code = 'R1';
  insert into birdwing_stay_charges (stay_id, head, kind, qty, rate, gst_pct)
  values (v_paying, 'Room rent', 'room', 2, 3800, 5), (v_paying, 'Dinner', 'food', 2, 500, 5);
  insert into birdwing_receipts (stay_id, amount, received_on, mode)
  values (v_paying, 5000, date '2031-03-08', 'upi');

  -- A Goodearth prospect: ₹4,000, closed to Marketing.
  insert into birdwing_stays (guest_id, use, status, arrival, departure, adults, cost_centre_id)
  values (v_guest, 'prospect', 'confirmed', date '2031-03-10', date '2031-03-11', 2, v_marketing)
  returning id into v_internal;
  insert into birdwing_stay_rooms (stay_id, room_id, from_date, to_date)
  select v_internal, id, date '2031-03-10', date '2031-03-11' from birdwing_rooms where code = 'R2';
  insert into birdwing_stay_charges (stay_id, head, kind, qty, rate, gst_pct, rate_includes_gst)
  values (v_internal, 'Room rent', 'room', 1, 4000, 5, true);
  insert into birdwing_cross_charges (stay_id, kind, cost_centre_id, amount, charged_month)
  values (v_internal, 'cross_charge', v_marketing, 4000, v_month);

  -- Cancelled with a ₹1,000 advance kept: the money stays, the night goes.
  insert into birdwing_stays (guest_id, use, status, arrival, departure, adults)
  values (v_guest, 'guest', 'confirmed', date '2031-03-20', date '2031-03-21', 2)
  returning id into v_cancelled;
  insert into birdwing_stay_rooms (stay_id, room_id, from_date, to_date)
  select v_cancelled, id, date '2031-03-20', date '2031-03-21' from birdwing_rooms where code = 'R3';
  insert into birdwing_stay_charges (stay_id, head, kind, qty, rate, gst_pct, rate_includes_gst)
  values (v_cancelled, 'Cancellation charge', 'other', 1, 1000, 0, true);
  insert into birdwing_receipts (stay_id, amount, received_on, mode)
  values (v_cancelled, 1000, date '2031-03-01', 'upi');
  update birdwing_stays set status = 'cancelled', cancel_reason = 'Trial' where id = v_cancelled;

  -- From the old sheet: two rooms, never named, for three nights.
  insert into birdwing_stays (guest_id, use, status, arrival, departure, adults, legacy_room_count,
                              source_key)
  values (v_guest, 'team', 'checked_out', date '2031-03-24', date '2031-03-27', 3, 2,
          'Trial facts!1')
  returning id into v_imported;
  insert into birdwing_stay_charges (stay_id, head, kind, qty, rate, gst_pct, rate_includes_gst)
  values (v_imported, 'Room rent', 'room', 1, 12000, 5, true);

  -- A room block: no stay, no money, no row.
  insert into birdwing_stays (is_block, status, arrival, departure, notes)
  values (true, 'blocked', date '2031-03-28', date '2031-03-30', 'Trial painting')
  returning id into v_block;
  insert into birdwing_stay_rooms (stay_id, room_id, from_date, to_date)
  select v_block, id, date '2031-03-28', date '2031-03-30' from birdwing_rooms where code = 'R4';

  insert into birdwing_expenses (accounting_month, head_id, description, amount)
  values (v_month, v_food, 'Trial groceries', 1500), (v_month, v_salary, 'Trial salary', 15000);

  update profiles set role_id = null where id = v_staff;
  delete from user_apps where user_id = v_staff;
  insert into user_apps (user_id, app) values (v_staff, '/financial-management');
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- 1. Financial Management sees each stay's money, and no block.
  select count(*) into v_count from birdwing_stay_facts where month = v_month;
  if v_count <> 4 then raise exception 'TRIAL 1 FAILED: % stays in the month, expected 4', v_count; end if;
  select * into f from birdwing_stay_facts where stay_id = v_paying;
  if f.charged <> 9030 or f.billed <> 8530 or f.collected <> 5000 or f.pending <> 3530
     or f.room_nights <> 2 or f.segment <> 'guest' or f.room_nights_estimated then
    raise exception 'TRIAL 1 FAILED: the paying stay reads %', row_to_json(f);
  end if;
  select * into f from birdwing_stay_facts where stay_id = v_internal;
  if f.pending <> 0 or f.cross_charged <> 4000 or f.segment <> 'internal' or f.cost_centre <> 'Marketing' then
    raise exception 'TRIAL 1 FAILED: the prospect stay reads %', row_to_json(f);
  end if;
  select * into f from birdwing_stay_facts where stay_id = v_cancelled;
  if f.nights <> 0 or f.room_nights <> 0 or f.billed <> 1000 or f.pending <> 0 then
    raise exception 'TRIAL 1 FAILED: the cancelled stay reads %', row_to_json(f);
  end if;
  select * into f from birdwing_stay_facts where stay_id = v_imported;
  if f.room_nights <> 6 or not f.room_nights_estimated or not f.imported then
    raise exception 'TRIAL 1 FAILED: the imported stay reads %', row_to_json(f);
  end if;

  -- 2. The month adds up as the consolidated page did.
  select * into f from birdwing_month_facts where month = v_month;
  if f.stays <> 3 or f.guest_stays <> 1 or f.internal_stays <> 2
     or f.room_nights <> 9 or not f.room_nights_estimated
     or f.billed <> 8530 + 4000 + 1000 + 12000
     or f.collected <> 6000 or f.cross_charged <> 4000
     or f.pending <> 3530 + 12000 or f.pending_guest <> 3530 or f.pending_internal <> 12000
     or f.expenses <> 16500 or f.salary_expenses <> 15000
     or f.days_in_month <> 31 or f.rooms < 4 then
    raise exception 'TRIAL 2 FAILED: the month reads %', row_to_json(f);
  end if;
  select count(*) into v_count from birdwing_expense_facts where month = v_month;
  if v_count <> 2 then raise exception 'TRIAL 2 FAILED: % expense lines', v_count; end if;

  -- 3. /birdwing alone sees none of it (expenses are not the caretaker's)…
  reset role;
  delete from user_apps where user_id = v_staff;
  insert into user_apps (user_id, app) values (v_staff, '/birdwing');
  set local role authenticated;
  select count(*) into v_count from birdwing_month_facts;
  if v_count <> 0 then raise exception 'TRIAL 3 FAILED: /birdwing sees % months', v_count; end if;
  select count(*) into v_count from birdwing_expense_facts;
  if v_count <> 0 then raise exception 'TRIAL 3 FAILED: /birdwing sees % expense lines', v_count; end if;

  -- 4. …nor does the probe.
  reset role;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_probe, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_count from birdwing_stay_facts;
  if v_count <> 0 then raise exception 'TRIAL 4 FAILED: the probe sees % stays', v_count; end if;

  reset role;
  raise exception 'ALL TRIALS PASSED';
end $trial$;
