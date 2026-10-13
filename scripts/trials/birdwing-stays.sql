-- Behaviour trial for 0115 — Birdwing Stays. Runs inside the dry-run
-- transaction; always rolled back.
--
-- Everything after the setup runs UNDER ROW-LEVEL SECURITY (set local
-- role authenticated): as the staff Siddharth account holding /birdwing
-- and nothing else, as the admin for the one Settings step, and as the
-- probe (no /birdwing) for the refusals. A trial run as the database
-- owner bypasses every policy (BUGCATCHER #19).
--
--   npx tsx scripts/dry-run-migrations.ts --project ipstebqawrvhkyntctrv \
--     supabase/migrations/0115_*.sql --trial scripts/trials/birdwing-stays.sql
do $trial$
declare
  v_staff uuid := (select id from auth.users where email = 'siddharth.cyriac.99@gmail.com');
  v_admin uuid := (select id from auth.users where email = 'siddharth@goodearthkannur.org');
  v_probe uuid := (select id from auth.users where email = 'siddharth.cyriac.99+probe@gmail.com');
  v_company uuid;
  v_r2 uuid;
  v_guest uuid;
  v_stay uuid;
  v_stay2 uuid;
  v_block uuid;
  v_ref text;
  v_month date;
  v_number text;
  v_again text;
  v_next text;
  v_amount numeric;
  v_count int;
  v_refused boolean;
  v_fri date := date '2026-11-06';
begin
  if v_staff is null or v_admin is null or v_probe is null then
    raise exception 'TRIAL SETUP: the staff, admin or probe account is missing on staging';
  end if;

  -- Setup, as the owner: a company to print under, and the staff account
  -- holding /birdwing alone.
  insert into companies (name, legal_name, gstin, state)
  values ('Trial Maloor', 'TRIAL MALOOR ECO FARMS', '32AAAAA0000A1Z1', 'Kerala')
  returning id into v_company;
  update profiles set role_id = null where id = v_staff;
  delete from user_apps where user_id = v_staff;
  insert into user_apps (user_id, app) values (v_staff, '/birdwing');

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- 1. The grant reads the masters but cannot change them.
  select id into v_r2 from birdwing_rooms where code = 'R2';
  if v_r2 is null then raise exception 'TRIAL 1 FAILED: staff cannot see R2'; end if;
  select count(*) into v_count from birdwing_rate_card;
  if v_count < 13 then raise exception 'TRIAL 1 FAILED: staff sees % rate card rows', v_count; end if;
  v_refused := false;
  begin
    insert into birdwing_rooms (code, name) values ('R9', 'Trial room');
  exception when insufficient_privilege then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 1 FAILED: staff made a room'; end if;

  -- 2. A stay in R2, Friday to Sunday: a reference minted, the month set.
  insert into birdwing_guests (name, phone, created_by) values ('Trial Guest', '9999999999', v_staff)
  returning id into v_guest;
  insert into birdwing_stays (guest_id, use, channel, status, arrival, departure, adults, created_by)
  values (v_guest, 'guest', 'direct', 'confirmed', v_fri, v_fri + 2, 2, v_staff)
  returning id, ref, accounting_month into v_stay, v_ref, v_month;
  if v_ref !~ '^BW-[0-9]{4,}$' then raise exception 'TRIAL 2 FAILED: ref is %', v_ref; end if;
  if v_month <> date '2026-11-01' then raise exception 'TRIAL 2 FAILED: month is %', v_month; end if;
  insert into birdwing_stay_rooms (stay_id, room_id, from_date, to_date, created_by)
  values (v_stay, v_r2, v_fri, v_fri + 2, v_staff);

  -- 3. R2 on the Saturday, for somebody else: refused by the database.
  insert into birdwing_stays (guest_id, use, status, arrival, departure, created_by)
  values (v_guest, 'client', 'confirmed', v_fri + 1, v_fri + 3, v_staff)
  returning id into v_stay2;
  v_refused := false;
  begin
    insert into birdwing_stay_rooms (stay_id, room_id, from_date, to_date, created_by)
    values (v_stay2, v_r2, v_fri + 1, v_fri + 3, v_staff);
  exception when exclusion_violation then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 3 FAILED: R2 was double-booked'; end if;

  -- 4. …but the Sunday it is vacated is free (a departure morning is the
  -- next arrival's afternoon).
  insert into birdwing_stay_rooms (stay_id, room_id, from_date, to_date, created_by)
  values (v_stay2, v_r2, v_fri + 2, v_fri + 3, v_staff);

  -- …and a room cannot be booked outside its stay's own dates.
  v_refused := false;
  begin
    insert into birdwing_stay_rooms (stay_id, room_id, from_date, to_date, created_by)
    values (v_stay, (select id from birdwing_rooms where code = 'R3'), v_fri, v_fri + 5, v_staff);
  exception when raise_exception then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 4 FAILED: a room ran past the stay'; end if;

  -- 5. Charges: two nights at ₹3,800 + 5% is ₹7,980; two dinners at ₹500
  -- + 5% is ₹1,050; an OTA figure taken GST-inclusive stays as typed.
  insert into birdwing_stay_charges (stay_id, head, kind, qty, rate, gst_pct, sac, created_by)
  values (v_stay, 'Room rent', 'room', 2, 3800, 5, '996311', v_staff),
         (v_stay, 'Dinner', 'food', 2, 500, 5, '996336', v_staff);
  insert into birdwing_stay_charges (stay_id, head, kind, qty, rate, gst_pct, rate_includes_gst, created_by)
  values (v_stay, 'Massage', 'experience', 1, 2124, 18, true, v_staff);
  select sum(amount) into v_amount from birdwing_stay_charges where stay_id = v_stay;
  if v_amount <> 7980 + 1050 + 2124 then
    raise exception 'TRIAL 5 FAILED: charges sum to %', v_amount;
  end if;

  -- 6. Issuing needs the invoicing company; staff cannot set it.
  v_refused := false;
  begin
    perform birdwing_issue_invoice(v_stay, 'Trial Guest');
  exception when raise_exception then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 6 FAILED: issued with no company'; end if;
  update birdwing_settings set company_id = v_company where id;
  if (select company_id from birdwing_settings) is not null then
    raise exception 'TRIAL 6 FAILED: staff set the invoicing company';
  end if;

  reset role;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update birdwing_settings set company_id = v_company, upi_id = 'trial@upi', updated_by = v_admin where id;
  if (select company_id from birdwing_settings) is distinct from v_company then
    raise exception 'TRIAL 6 FAILED: the admin could not set the company';
  end if;

  reset role;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- 7. Issue: the number is minted at 133 onward; pressing again returns
  -- the same invoice; the GST halves and the total add up to the paisa.
  v_number := birdwing_issue_invoice(v_stay, 'Trial Guest');
  if v_number <> 'MEF/GH/' || (select last_no from birdwing_counters where scope = 'invoice') then
    raise exception 'TRIAL 7 FAILED: issued % against the counter', v_number;
  end if;
  if substring(v_number from 8)::int < 133 then
    raise exception 'TRIAL 7 FAILED: % is at or below the reserved 132', v_number;
  end if;
  v_again := birdwing_issue_invoice(v_stay, 'Someone else');
  if v_again <> v_number then raise exception 'TRIAL 7 FAILED: a second press gave %', v_again; end if;
  select count(*) into v_count from birdwing_invoices where stay_id = v_stay;
  if v_count <> 1 then raise exception 'TRIAL 7 FAILED: % invoices on one stay', v_count; end if;
  if exists (
    select 1 from birdwing_invoices
    where stay_id = v_stay and (taxable + cgst + sgst <> total or total <> v_amount or payable <> total)
  ) then
    raise exception 'TRIAL 7 FAILED: the invoice totals do not add up';
  end if;
  if (select snapshot->'company'->>'legal_name' from birdwing_invoices where stay_id = v_stay)
     <> 'TRIAL MALOOR ECO FARMS' then
    raise exception 'TRIAL 7 FAILED: the letterhead was not snapshotted';
  end if;

  -- 8. Issued means frozen: no charge added, changed or removed.
  v_refused := false;
  begin
    insert into birdwing_stay_charges (stay_id, head, qty, rate, created_by)
    values (v_stay, 'Late add', 1, 100, v_staff);
  exception when raise_exception then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 8 FAILED: a charge was added after issue'; end if;
  v_refused := false;
  begin
    update birdwing_invoices set bill_to_name = 'Edited' where stay_id = v_stay;
  exception when raise_exception then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 8 FAILED: an issued invoice was edited'; end if;

  -- 9. A receipt against the invoice; nobody edits it in place.
  insert into birdwing_receipts (stay_id, invoice_id, amount, mode, reference, created_by)
  select v_stay, id, 5000, 'upi', 'UTR123', v_staff from birdwing_invoices where stay_id = v_stay;
  update birdwing_receipts set amount = 1 where stay_id = v_stay;
  if (select amount from birdwing_receipts where stay_id = v_stay) <> 5000 then
    raise exception 'TRIAL 9 FAILED: a receipt was edited in place';
  end if;
  -- A receipt cannot point at another stay's invoice.
  v_refused := false;
  begin
    insert into birdwing_receipts (stay_id, invoice_id, amount, created_by)
    select v_stay2, id, 10, v_staff from birdwing_invoices where stay_id = v_stay;
  exception when foreign_key_violation then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 9 FAILED: a receipt crossed stays'; end if;

  -- 10. Cancel the invoice (a reason is required), and the charges open;
  -- issue again and the next number comes.
  v_refused := false;
  begin
    update birdwing_invoices set status = 'cancelled', cancelled_at = now() where stay_id = v_stay;
  exception when check_violation then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 10 FAILED: cancelled without a reason'; end if;
  update birdwing_invoices
  set status = 'cancelled', cancelled_at = now(), cancelled_by = v_staff, cancel_reason = 'Wrong name'
  where stay_id = v_stay and status = 'issued';
  insert into birdwing_stay_charges (stay_id, head, qty, rate, created_by)
  values (v_stay, 'Refreshments', 2, 100, v_staff);
  v_next := birdwing_issue_invoice(v_stay, 'Trial Guest (corrected)');
  if substring(v_next from 8)::int <> substring(v_number from 8)::int + 1 then
    raise exception 'TRIAL 10 FAILED: re-issue gave % after %', v_next, v_number;
  end if;
  v_refused := false;
  begin
    update birdwing_invoices set status = 'issued', cancelled_at = null, cancel_reason = null
    where number = v_number;
  exception when raise_exception then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 10 FAILED: a cancelled invoice came back'; end if;

  -- 11. The status machine: confirmed → checked in → out; nothing jumps.
  v_refused := false;
  begin
    update birdwing_stays set status = 'checked_out' where id = v_stay2;
  exception when raise_exception then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 11 FAILED: confirmed jumped to checked out'; end if;
  update birdwing_stays set status = 'checked_in' where id = v_stay;
  update birdwing_stays set status = 'checked_out' where id = v_stay;
  if (select checkout_at from birdwing_stays where id = v_stay) is null then
    raise exception 'TRIAL 11 FAILED: check-out time not stamped';
  end if;
  -- A checked-out stay's rooms are its record.
  v_refused := false;
  begin
    delete from birdwing_stay_rooms where stay_id = v_stay;
  exception when raise_exception then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 11 FAILED: a checked-out room was removed'; end if;

  -- 12. Cancelling releases the rooms, and the nights are bookable again;
  -- a cancelled stay never comes back.
  update birdwing_stays set status = 'cancelled', cancel_reason = 'Trial' where id = v_stay2;
  if exists (select 1 from birdwing_stay_rooms where stay_id = v_stay2 and released_at is null) then
    raise exception 'TRIAL 12 FAILED: a cancelled stay kept its room';
  end if;
  insert into birdwing_stays (guest_id, use, status, arrival, departure, created_by)
  values (v_guest, 'team', 'confirmed', v_fri + 2, v_fri + 3, v_staff)
  returning id into v_stay2;
  insert into birdwing_stay_rooms (stay_id, room_id, from_date, to_date, created_by)
  values (v_stay2, v_r2, v_fri + 2, v_fri + 3, v_staff);
  v_refused := false;
  begin
    update birdwing_stays set status = 'confirmed'
    where id = (select id from birdwing_stays where status = 'cancelled' and guest_id = v_guest limit 1);
  exception when raise_exception then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 12 FAILED: a cancelled stay came back'; end if;

  -- 13. A room block holds rooms and nothing else.
  insert into birdwing_stays (is_block, status, arrival, departure, notes, created_by)
  values (true, 'blocked', v_fri + 10, v_fri + 12, 'Painting', v_staff)
  returning id into v_block;
  insert into birdwing_stay_rooms (stay_id, room_id, from_date, to_date, created_by)
  values (v_block, v_r2, v_fri + 10, v_fri + 12, v_staff);
  v_refused := false;
  begin
    insert into birdwing_stay_charges (stay_id, head, qty, rate, created_by)
    values (v_block, 'Room rent', 1, 3800, v_staff);
  exception when foreign_key_violation then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 13 FAILED: a block took a charge'; end if;

  -- 14. A cross-charge needs a cost centre; a write-off does not.
  v_refused := false;
  begin
    insert into birdwing_cross_charges (stay_id, kind, amount, charged_month, created_by)
    values (v_stay2, 'cross_charge', 100, date '2026-11-01', v_staff);
  exception when check_violation then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 14 FAILED: a cross-charge without a cost centre'; end if;
  insert into birdwing_cross_charges (stay_id, kind, cost_centre_id, amount, charged_month, created_by)
  values (v_stay2, 'cross_charge', (select id from birdwing_cost_centres where name = 'Marketing'),
          100, date '2026-11-01', v_staff);

  -- 15. Nothing is deleted that should be cancelled.
  delete from birdwing_stays where id = v_stay;
  delete from birdwing_invoices where stay_id = v_stay;
  if not exists (select 1 from birdwing_stays where id = v_stay)
     or (select count(*) from birdwing_invoices where stay_id = v_stay) <> 2 then
    raise exception 'TRIAL 15 FAILED: a stay or an invoice was deleted';
  end if;

  -- 16. Without the grant: nothing to see, nothing to write.
  reset role;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_probe, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_count from birdwing_stays;
  if v_count <> 0 then raise exception 'TRIAL 16 FAILED: the probe sees % stays', v_count; end if;
  select count(*) into v_count from birdwing_guests;
  if v_count <> 0 then raise exception 'TRIAL 16 FAILED: the probe sees % guests', v_count; end if;
  v_refused := false;
  begin
    insert into birdwing_guests (name) values ('Probe guest');
  exception when insufficient_privilege then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 16 FAILED: the probe made a guest'; end if;
  v_refused := false;
  begin
    perform birdwing_issue_invoice(v_stay2, 'Probe');
  exception when raise_exception then v_refused := true;
  end;
  if not v_refused then raise exception 'TRIAL 16 FAILED: the probe issued an invoice'; end if;

  reset role;
  raise exception 'ALL TRIALS PASSED';
end $trial$;
