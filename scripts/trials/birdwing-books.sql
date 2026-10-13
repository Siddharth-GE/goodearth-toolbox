-- Behaviour trial for 0116 — Birdwing Books. Runs inside the dry-run
-- transaction, after 0115; always rolled back.
--
-- Under ROW-LEVEL SECURITY throughout after the setup: the staff
-- Siddharth account holding /birdwing-books and nothing else, the admin
-- for the masters, and the probe (neither Birdwing grant) for the
-- refusals (BUGCATCHER #19).
--
--   npx tsx scripts/dry-run-migrations.ts --project ipstebqawrvhkyntctrv \
--     supabase/migrations/0115_*.sql supabase/migrations/0116_*.sql \
--     --trial scripts/trials/birdwing-books.sql
do $trial$
declare
  v_staff uuid := (select id from auth.users where email = 'siddharth.cyriac.99@gmail.com');
  v_admin uuid := (select id from auth.users where email = 'siddharth@goodearthkannur.org');
  v_probe uuid := (select id from auth.users where email = 'siddharth.cyriac.99+probe@gmail.com');
  v_guest uuid;
  v_stay uuid;
  v_person uuid;
  v_food uuid;
  v_line uuid;
  v_run uuid;
  v_again uuid;
  v_count int;
  v_rooms int;
  v_guests int;
  v_refused boolean;
  v_month date := date '2026-11-01';
begin
  if v_staff is null or v_admin is null or v_probe is null then
    raise exception 'TRIAL SETUP: the staff, admin or probe account is missing on staging';
  end if;

  -- Setup, as the owner: a two-room, three-guest stay on 2–4 November,
  -- and the staff account holding /birdwing-books alone.
  insert into birdwing_guests (name) values ('Trial Guest') returning id into v_guest;
  insert into birdwing_stays (guest_id, use, status, arrival, departure, adults, children)
  values (v_guest, 'guest', 'confirmed', date '2026-11-02', date '2026-11-04', 2, 1)
  returning id into v_stay;
  insert into birdwing_stay_rooms (stay_id, room_id, from_date, to_date)
  select v_stay, id, date '2026-11-02', date '2026-11-04' from birdwing_rooms where code in ('R1', 'R2');
  update profiles set role_id = null where id = v_staff;
  delete from user_apps where user_id = v_staff;
  insert into user_apps (user_id, app) values (v_staff, '/birdwing-books');

  -- 1. The admin makes the person and their pay rule.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into birdwing_staff (name, created_by) values ('Trial Sajna', v_admin) returning id into v_person;
  insert into birdwing_pay_rules (staff_id, effective_from, base_salary, shift_start, shift_end,
                                  ot_rate_per_hr, room_day_rate, guest_day_rate, created_by)
  values (v_person, date '2026-01-01', 15000, '08:30', '17:30', 80, 80, 0, v_admin);

  -- 2. The grant reads the masters but cannot change them.
  reset role;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_count from birdwing_expense_heads;
  if v_count < 9 then raise exception 'TRIAL 2 FAILED: staff sees % heads', v_count; end if;
  v_refused := false;
  begin
    insert into birdwing_staff (name) values ('Staff-made person');
  exception when insufficient_privilege then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 2 FAILED: staff made a person'; end if;
  update birdwing_pay_rules set base_salary = 99999 where staff_id = v_person;
  if (select base_salary from birdwing_pay_rules where staff_id = v_person) <> 15000 then
    raise exception 'TRIAL 2 FAILED: staff changed a pay rule';
  end if;

  -- 3. An expense line, and the repeat-upload key holds.
  select id into v_food from birdwing_expense_heads where name = 'Food Supplies';
  insert into birdwing_expenses (accounting_month, head_id, description, amount, source_key, created_by)
  values (v_month, v_food, 'Groceries', 1234.50, 'Trial!A1', v_staff)
  returning id into v_line;
  v_refused := false;
  begin
    insert into birdwing_expenses (accounting_month, head_id, description, amount, source_key, created_by)
    values (v_month, v_food, 'Groceries again', 1234.50, 'Trial!A1', v_staff);
  exception when unique_violation then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 3 FAILED: the same source line went in twice'; end if;

  -- 4. Confirmed is settled: no edit until it is recorded again.
  update birdwing_expenses set status = 'confirmed' where id = v_line;
  v_refused := false;
  begin
    update birdwing_expenses set amount = 1 where id = v_line;
  exception when raise_exception then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 4 FAILED: a confirmed line was edited'; end if;
  update birdwing_expenses set status = 'recorded' where id = v_line;
  update birdwing_expenses set amount = 1300 where id = v_line;

  -- 5. Occupancy reaches Books as counts only: 2 rooms, 3 guests on the
  -- 2nd and 3rd, nothing on the 4th (they left that morning).
  select rooms_occupied, guests_in_house into v_rooms, v_guests
  from birdwing_occupancy_facts where on_date = date '2026-11-03';
  if v_rooms <> 2 or v_guests <> 3 then
    raise exception 'TRIAL 5 FAILED: the 3rd shows % rooms, % guests', v_rooms, v_guests;
  end if;
  if exists (select 1 from birdwing_occupancy_facts where on_date = date '2026-11-04') then
    raise exception 'TRIAL 5 FAILED: the departure morning counted as a night';
  end if;
  -- …and Books cannot read the stay behind the counts.
  select count(*) into v_count from birdwing_stays;
  if v_count <> 0 then raise exception 'TRIAL 5 FAILED: Books reads % stays', v_count; end if;

  -- 6. Attendance for three days.
  insert into birdwing_attendance (staff_id, on_date, status, in_at, out_at, created_by)
  values (v_person, date '2026-11-02', 'present', '07:30', '18:30', v_staff),
         (v_person, date '2026-11-03', 'present', '08:30', '17:30', v_staff),
         (v_person, date '2026-11-04', 'leave', null, null, v_staff);

  -- 7. Confirm the month: one run, one salary line in the salary head,
  -- confirmed; pressing again changes nothing.
  v_run := birdwing_confirm_salary(v_person, v_month, 15000, 2, 160, 4, 320, 0, 0, 500, 100, 'Trial');
  v_again := birdwing_confirm_salary(v_person, v_month, 99999, 0, 0, 0, 0, 0, 0, 0, 0, 'Again');
  if v_again <> v_run then raise exception 'TRIAL 7 FAILED: a second press made a second run'; end if;
  select count(*) into v_count from birdwing_expenses where salary_run_id = v_run;
  if v_count <> 1 then raise exception 'TRIAL 7 FAILED: % salary lines', v_count; end if;
  if (select amount from birdwing_expenses where salary_run_id = v_run) <> 15880 then
    raise exception 'TRIAL 7 FAILED: the salary line is %',
      (select amount from birdwing_expenses where salary_run_id = v_run);
  end if;
  if not exists (
    select 1 from birdwing_expenses e join birdwing_expense_heads h on h.id = e.head_id
    where e.salary_run_id = v_run and h.is_salary and e.status = 'confirmed'
  ) then
    raise exception 'TRIAL 7 FAILED: the salary line is not a confirmed salary';
  end if;

  -- 8. The run and its line are locked; so is that month's attendance.
  update birdwing_salary_runs set total = 1, base = 1 where id = v_run;
  if (select total from birdwing_salary_runs where id = v_run) <> 15880 then
    raise exception 'TRIAL 8 FAILED: a run was edited';
  end if;
  v_refused := false;
  begin
    update birdwing_expenses set status = 'recorded' where salary_run_id = v_run;
  exception when raise_exception then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 8 FAILED: a salary line was reopened'; end if;
  v_refused := false;
  begin
    delete from birdwing_expenses where salary_run_id = v_run;
  exception when raise_exception then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 8 FAILED: a salary line was removed'; end if;
  v_refused := false;
  begin
    update birdwing_attendance set status = 'absent' where staff_id = v_person and on_date = date '2026-11-03';
  exception when raise_exception then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 8 FAILED: a closed month''s attendance changed'; end if;
  v_refused := false;
  begin
    insert into birdwing_attendance (staff_id, on_date, status) values (v_person, date '2026-11-20', 'present');
  exception when raise_exception then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 8 FAILED: a day was added to a closed month'; end if;
  -- December is still open.
  insert into birdwing_attendance (staff_id, on_date, status) values (v_person, date '2026-12-01', 'present');

  -- 9. Without a Birdwing grant: nothing seen, nothing written.
  reset role;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_probe, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_count from birdwing_expenses;
  if v_count <> 0 then raise exception 'TRIAL 9 FAILED: the probe sees % expenses', v_count; end if;
  select count(*) into v_count from birdwing_occupancy_facts;
  if v_count <> 0 then raise exception 'TRIAL 9 FAILED: the probe sees % occupancy days', v_count; end if;
  select count(*) into v_count from birdwing_staff;
  if v_count <> 0 then raise exception 'TRIAL 9 FAILED: the probe sees % staff', v_count; end if;
  v_refused := false;
  begin
    insert into birdwing_expenses (accounting_month, head_id, description, amount)
    values (v_month, v_food, 'Probe', 1);
  exception when insufficient_privilege then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 9 FAILED: the probe recorded an expense'; end if;
  v_refused := false;
  begin
    perform birdwing_confirm_salary(v_person, date '2026-12-01', 1, 0, 0, 0, 0, 0, 0, 0, 0);
  exception when raise_exception or insufficient_privilege then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 9 FAILED: the probe confirmed a salary'; end if;

  reset role;
  raise exception 'ALL TRIALS PASSED';
end $trial$;
