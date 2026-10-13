-- 0117 — Birdwing's money, for Financial Management and Reporter
--
-- FOUNDER, 2026-10-13 — the Birdwing build plan (plan.md, _Birdwing_),
-- Phase 4: the consolidated page (birdwing-consolidated.html) becomes a
-- Birdwing tab in Financial Management, live, and Reporter gets Birdwing's
-- stays and expenses as datasets. The HTML page is never updated again.
--
-- THREE OWNER VIEWS, the crm_*_facts shape (0056/0058): owned by postgres,
-- so they read past Birdwing's RLS, and their WHERE and column lists ARE
-- the boundary — readable by /financial-management or /reporter, the two
-- grants that read the company's money by founder decision (SECURITY.md),
-- and by nobody else. Not by /birdwing or /birdwing-books: the caretaker
-- does not need the expenses, accounts does not need the guests.
--
--   * birdwing_stay_facts — one row per stay (room blocks left out): who
--     it was for (a name, NEVER a phone, email or ID), when, the room-
--     nights, and the money: charged, billed, collected, closed, pending.
--   * birdwing_expense_facts — one row per expense line, with its head.
--   * birdwing_month_facts — the month's totals the consolidated page
--     showed, from the two above plus the rooms in use.
--
-- Instead of the build plan's "widen the Birdwing tables' quals": a wider
-- qual would hand Financial Management and Reporter every guest's phone
-- number through the table. A view hands over exactly its columns.
--
-- Money is reckoned as Stays reckons it (lib/birdwing/money.ts):
--   billed = Σ charges − OTA commission − discount;
--   pending = billed − collected − cross-charged − written off.
-- A cancelled stay keeps its money (a retained advance) and loses its
-- nights. Room-nights come from the rooms booked; a stay imported from
-- the old sheet, which never named rooms, counts its room count × nights,
-- and says so (room_nights_estimated).
--
-- Every view: security_barrier, write grants revoked by name (BUGCATCHER
-- #3), pinned in scripts/view-manifest.ts. Re-runnable.

-- ---------------------------------------------------------------------
-- 1. birdwing_stay_facts
-- ---------------------------------------------------------------------

create or replace view birdwing_stay_facts
with (security_barrier = true) as
with base as (
  select
    s.id,
    s.ref,
    s.accounting_month,
    g.name as guest_name,
    s.use,
    s.channel,
    s.status,
    cc.name as cost_centre,
    s.arrival,
    s.departure,
    case when s.status = 'cancelled' then 0 else s.departure - s.arrival end as nights,
    s.adults + s.children as guests,
    s.legacy_room_count,
    s.ota_commission,
    s.discount,
    s.source_key is not null as imported,
    coalesce((select sum(c.amount) from birdwing_stay_charges c where c.stay_id = s.id), 0)
      as charged,
    coalesce((select sum(c.amount) from birdwing_stay_charges c
              where c.stay_id = s.id and c.kind = 'room'), 0) as room_revenue,
    coalesce((select sum(r.amount) from birdwing_receipts r where r.stay_id = s.id), 0)
      as collected,
    coalesce((select sum(x.amount) from birdwing_cross_charges x
              where x.stay_id = s.id and x.kind = 'cross_charge'), 0) as cross_charged,
    coalesce((select sum(x.amount) from birdwing_cross_charges x
              where x.stay_id = s.id and x.kind = 'write_off'), 0) as written_off,
    (select sum(r.to_date - r.from_date) from birdwing_stay_rooms r
      where r.stay_id = s.id and r.released_at is null) as booked_room_nights,
    (select i.number from birdwing_invoices i
      where i.stay_id = s.id and i.status = 'issued') as invoice_number
  from birdwing_stays s
  left join birdwing_guests g on g.id = s.guest_id
  left join birdwing_cost_centres cc on cc.id = s.cost_centre_id
  where not s.is_block
)
select
  id as stay_id,
  ref,
  accounting_month as month,
  guest_name,
  use,
  case when use = 'guest' then 'guest' else 'internal' end as segment,
  channel,
  status,
  cost_centre,
  arrival,
  departure,
  nights,
  case
    when status = 'cancelled' then 0
    when booked_room_nights is not null then booked_room_nights
    else round(coalesce(legacy_room_count, 0) * nights, 2)
  end::numeric as room_nights,
  status <> 'cancelled' and booked_room_nights is null and coalesce(legacy_room_count, 0) > 0
    as room_nights_estimated,
  guests,
  room_revenue,
  charged,
  ota_commission,
  discount,
  charged - ota_commission - discount as billed,
  collected,
  cross_charged,
  written_off,
  charged - ota_commission - discount - collected - cross_charged - written_off as pending,
  invoice_number,
  imported
from base
where has_app('/financial-management') or has_app('/reporter');

revoke insert, update, delete, truncate on birdwing_stay_facts from anon, authenticated;
grant select on birdwing_stay_facts to authenticated;

-- ---------------------------------------------------------------------
-- 2. birdwing_expense_facts
-- ---------------------------------------------------------------------

create or replace view birdwing_expense_facts
with (security_barrier = true) as
select
  e.id as expense_id,
  e.accounting_month as month,
  h.name as head,
  h.is_salary,
  e.description,
  e.spent_on,
  e.amount,
  coalesce(v.name, e.payee) as paid_to,
  e.status,
  exists (select 1 from birdwing_expense_files f where f.expense_id = e.id) as has_bill
from birdwing_expenses e
join birdwing_expense_heads h on h.id = e.head_id
left join vendors v on v.id = e.vendor_id
where has_app('/financial-management') or has_app('/reporter');

revoke insert, update, delete, truncate on birdwing_expense_facts from anon, authenticated;
grant select on birdwing_expense_facts to authenticated;

-- ---------------------------------------------------------------------
-- 3. birdwing_month_facts
-- ---------------------------------------------------------------------
-- Reads the two views above, so their WHERE applies again underneath; its
-- own WHERE says the same out loud. `rooms` is how many rooms are in use
-- now — the occupancy denominator the consolidated page used (4).

create or replace view birdwing_month_facts
with (security_barrier = true) as
with stays as (
  select
    month,
    count(*) filter (where status <> 'cancelled') as stays,
    count(*) filter (where status <> 'cancelled' and segment = 'guest') as guest_stays,
    count(*) filter (where status <> 'cancelled' and segment = 'internal') as internal_stays,
    sum(room_nights) as room_nights,
    bool_or(room_nights_estimated) as room_nights_estimated,
    sum(nights * guests) as guest_nights,
    sum(room_revenue) filter (where room_nights > 0) as room_revenue,
    sum(charged) as charged,
    sum(ota_commission) as ota_commission,
    sum(discount) as discount,
    sum(billed) as billed,
    sum(billed) filter (where segment = 'guest') as billed_guest,
    sum(billed) filter (where segment = 'internal') as billed_internal,
    sum(collected) as collected,
    sum(cross_charged) as cross_charged,
    sum(written_off) as written_off,
    sum(pending) as pending,
    sum(pending) filter (where segment = 'guest') as pending_guest,
    sum(pending) filter (where segment = 'internal') as pending_internal
  from birdwing_stay_facts
  group by month
),
spend as (
  select
    month,
    sum(amount) as expenses,
    sum(amount) filter (where is_salary) as salary_expenses
  from birdwing_expense_facts
  group by month
)
select
  coalesce(s.month, x.month) as month,
  extract(day from (date_trunc('month', coalesce(s.month, x.month)) + interval '1 month - 1 day'))::int
    as days_in_month,
  (select count(*) from birdwing_rooms where is_active)::int as rooms,
  coalesce(s.stays, 0)::int as stays,
  coalesce(s.guest_stays, 0)::int as guest_stays,
  coalesce(s.internal_stays, 0)::int as internal_stays,
  coalesce(s.room_nights, 0) as room_nights,
  coalesce(s.room_nights_estimated, false) as room_nights_estimated,
  coalesce(s.guest_nights, 0)::int as guest_nights,
  coalesce(s.room_revenue, 0) as room_revenue,
  coalesce(s.charged, 0) as charged,
  coalesce(s.ota_commission, 0) as ota_commission,
  coalesce(s.discount, 0) as discount,
  coalesce(s.billed, 0) as billed,
  coalesce(s.billed_guest, 0) as billed_guest,
  coalesce(s.billed_internal, 0) as billed_internal,
  coalesce(s.collected, 0) as collected,
  coalesce(s.cross_charged, 0) as cross_charged,
  coalesce(s.written_off, 0) as written_off,
  coalesce(s.pending, 0) as pending,
  coalesce(s.pending_guest, 0) as pending_guest,
  coalesce(s.pending_internal, 0) as pending_internal,
  coalesce(x.expenses, 0) as expenses,
  coalesce(x.salary_expenses, 0) as salary_expenses
from stays s
full join spend x on x.month = s.month
where has_app('/financial-management') or has_app('/reporter');

revoke insert, update, delete, truncate on birdwing_month_facts from anon, authenticated;
grant select on birdwing_month_facts to authenticated;

-- ---------------------------------------------------------------------
-- 4. Prove it
-- ---------------------------------------------------------------------

do $$
declare
  v text;
begin
  foreach v in array array['birdwing_stay_facts', 'birdwing_expense_facts', 'birdwing_month_facts']
  loop
    if exists (
      select 1 from information_schema.table_privileges
      where table_schema = 'public' and table_name = v
        and grantee in ('anon', 'authenticated')
        and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
    ) then
      raise exception '0117: % is writable', v;
    end if;
    if pg_get_viewdef(v::regclass) not like '%has_app(''/financial-management''::text)%'
       or pg_get_viewdef(v::regclass) not like '%has_app(''/reporter''::text)%' then
      raise exception '0117: % lost its gate', v;
    end if;
  end loop;

  -- No contact detail ever leaves through the stay view.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'birdwing_stay_facts'
      and column_name in ('phone', 'email', 'guest_phone', 'id_last4', 'id_type', 'notes')
  ) then
    raise exception '0117: birdwing_stay_facts carries a contact or ID column';
  end if;
end $$;
