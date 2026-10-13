-- 0115 — Birdwing Stays: the guest house's bookings, rooms, invoices and money in
--
-- FOUNDER, 2026-10-13: "We need to build a new section a couple of tools
-- under it" — the Birdwing build plan (BIRDWING-BUILD-PLAN.md, Fable,
-- 2026-10-13), tweaked to this codebase (plan.md, _Birdwing_). Birdwing
-- Farmstay is a four-room guest house at Saarang run by Maloor Eco Farms
-- Pvt Ltd; today it runs on an income sheet, an expenses workbook and a
-- laptop app. This migration is the STAYS tool (`/birdwing`); Books
-- (`/birdwing-books`) is 0116.
--
--   * Rooms are their own master, NOT `units`: inserting into units fires
--     units_seed_engagement and makes a CRM record and a payment schedule.
--     Birdwing never touches projects or units.
--   * Every stay carries a `use` — a paying guest, or one of Goodearth's
--     own uses (client, prospect, team, architect, director, vendor).
--     Internal stays are CLOSED by a cross-charge to a cost centre, not
--     left as receivables: 59% of the billed value in the sheets was
--     Goodearth's own use, ₹6.45L of it never collected nor cross-charged.
--   * A room cannot be double-booked: an exclusion constraint on the
--     room's nights (btree_gist), so the overlap guard lives in the
--     database and no code path can get past it. A cancelled stay
--     releases its rooms (released_at), and a released row no longer
--     blocks anyone.
--   * Charges are GST-aware lines; `amount` (GST-inclusive) is generated.
--     The rate card's rates are BEFORE GST (₹3,800 room + 5% = ₹3,990,
--     the figure all over the sheet); a line may be entered GST-inclusive
--     (an OTA's payout) with the toggle.
--   * Invoice numbers are minted by the database AT ISSUE (MEF/GH/133
--     onward; 132 is reserved for the Kalidas draft), in the same
--     transaction that snapshots the lines and the letterhead. An issued
--     invoice freezes the stay's charges; a correction is cancel and
--     re-issue (credit notes are out of scope).
--   * Receipts are their own table — date, mode, reference, amount — so a
--     collection is never an undated number. OTA commission and a guest
--     discount are two fields on the stay, never one column.
--   * The letterhead is a Masters company (0101, PRODUCT.md): chosen once
--     in Birdwing → Settings, never typed into this tool. Bank, UPI and
--     the cancellation policy are typed there once, never seeded.
--
-- Multi-statement operations are SECURITY INVOKER (the issue_transmittal
-- shape, 0091): RLS stays the boundary, so no function body carries a
-- grant check of its own and none is reachable around /birdwing.
--
-- Derived, never stored: billed = Σ charges − OTA commission − discount;
-- collected = Σ receipts; settled = Σ cross-charges and write-offs;
-- pending = billed − collected − settled.
--
-- Re-runnable throughout.

-- ---------------------------------------------------------------------
-- 1. '/birdwing' and '/birdwing-books' become grantable apps
-- ---------------------------------------------------------------------
-- Both CHECKs, restated in full and identically — granting fails at the
-- database if only one moves. The list is 0095's plus the two slugs.

alter table user_apps drop constraint if exists user_apps_app_known;
alter table user_apps add constraint user_apps_app_known check (
  app in (
    '/marathon', '/settings', '/masters', '/selections', '/budgets',
    '/indents', '/purchase-orders', '/inventory', '/bills', '/directory',
    '/training', '/management-dashboard', '/project-management',
    '/design-management', '/client-relations', '/financial-management',
    '/business-planning', '/pusher', '/relay', '/reporter', '/estimator',
    '/supervisors', '/dexter', '/birdwing', '/birdwing-books'
  )
);

alter table role_apps drop constraint if exists role_apps_app_known;
alter table role_apps add constraint role_apps_app_known check (
  app in (
    '/marathon', '/settings', '/masters', '/selections', '/budgets',
    '/indents', '/purchase-orders', '/inventory', '/bills', '/directory',
    '/training', '/management-dashboard', '/project-management',
    '/design-management', '/client-relations', '/financial-management',
    '/business-planning', '/pusher', '/relay', '/reporter', '/estimator',
    '/supervisors', '/dexter', '/birdwing', '/birdwing-books'
  )
);

-- The exclusion constraint needs equality on a uuid inside a GiST index.
create extension if not exists btree_gist with schema extensions;

-- ---------------------------------------------------------------------
-- 2. The masters: rooms, rate card, cost centres, settings
-- ---------------------------------------------------------------------
-- Read by /birdwing, written by admins only (Birdwing → Settings is an
-- admin screen). Switched off, never deleted: stays name them.

create table if not exists birdwing_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null check (length(trim(code)) between 1 and 12),
  name text not null check (length(trim(name)) > 0),
  -- Not set until someone says; a capacity is never guessed.
  max_guests int check (max_guests > 0),
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists birdwing_rooms_code_key on birdwing_rooms (lower(trim(code)));

create table if not exists birdwing_rate_card (
  id uuid primary key default gen_random_uuid(),
  head text not null check (length(trim(head)) > 0),
  kind text not null check (kind in ('room', 'food', 'experience', 'addon', 'other')),
  -- Before GST. 0 is a real "price on the day" placeholder (a walk, other
  -- services), and the line takes whatever rate is typed.
  default_rate numeric(12, 2) not null default 0 check (default_rate >= 0),
  gst_pct numeric(5, 2) not null default 0 check (gst_pct between 0 and 28),
  sac text,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists birdwing_rate_card_head_key on birdwing_rate_card (lower(trim(head)));

create table if not exists birdwing_cost_centres (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists birdwing_cost_centres_name_key
  on birdwing_cost_centres (lower(trim(name)));

-- One row, always (the seed below). Everything here is typed by a person
-- in Settings; nothing is seeded but the row itself.
create table if not exists birdwing_settings (
  id boolean primary key default true check (id),
  -- The letterhead: a Masters company (0101), never typed here.
  company_id uuid references companies (id),
  place_of_supply text,
  bank_details text,
  upi_id text,
  -- The cancellation policy and anything else printed under an invoice.
  invoice_terms text,
  checkin_time text,
  checkout_time text,
  updated_by uuid references profiles (id),
  updated_at timestamptz not null default now()
);
insert into birdwing_settings (id) values (true) on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 3. Guests
-- ---------------------------------------------------------------------
-- A person's ID is never a column: its type and last four characters
-- only. A photo of it is a stay document in the private bucket (§9).

create table if not exists birdwing_guests (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  phone text,
  email text,
  city text,
  id_type text check (id_type in ('aadhaar', 'passport', 'driving_licence', 'voter_id', 'other')),
  id_last4 text check (id_last4 ~ '^[A-Za-z0-9]{1,4}$'),
  notes text,
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists birdwing_guests_name_idx on birdwing_guests (lower(name));
create index if not exists birdwing_guests_phone_idx on birdwing_guests (phone);

-- ---------------------------------------------------------------------
-- 4. The counters — stay references and invoice numbers
-- ---------------------------------------------------------------------
-- 'stay' mints BW-0001…; 'invoice' mints MEF/GH/133… — seeded at 132 so
-- the next issue is 133 (132 stays reserved for the Kalidas draft).

create table if not exists birdwing_counters (
  scope text primary key check (scope in ('stay', 'invoice')),
  last_no int not null default 0 check (last_no >= 0)
);
insert into birdwing_counters (scope, last_no) values ('stay', 0), ('invoice', 132)
on conflict (scope) do nothing;

-- ---------------------------------------------------------------------
-- 5. Stays
-- ---------------------------------------------------------------------

create table if not exists birdwing_stays (
  id uuid primary key default gen_random_uuid(),
  -- BW-0001, minted on insert by birdwing_stays_guard (§7).
  ref text not null unique,
  -- A room block (maintenance, the owner's own use) has no guest and no
  -- use; it holds rooms and nothing else.
  is_block boolean not null default false,
  guest_id uuid references birdwing_guests (id),
  use text check (use in ('guest', 'client', 'prospect', 'team', 'architect', 'director', 'vendor')),
  channel text not null default 'direct'
    check (channel in ('direct', 'airbnb', 'booking', 'mmt', 'other')),
  -- Who carries an internal stay. Nullable: an enquiry may not know yet,
  -- and the import leaves it for the founder's bulk assignment. The
  -- cross-charge (§6) is what needs one.
  cost_centre_id uuid references birdwing_cost_centres (id),
  referred_by text,
  status text not null default 'confirmed'
    check (status in ('enquiry', 'confirmed', 'checked_in', 'checked_out', 'cancelled', 'blocked')),
  arrival date not null,
  -- Equal to arrival for a day visit (a meal, an event): no room-night.
  departure date not null,
  adults int not null default 0 check (adults >= 0),
  children int not null default 0 check (children >= 0),
  pets int not null default 0 check (pets >= 0),
  -- The month the money is counted in. Defaults to the arrival's month.
  accounting_month date not null check (extract(day from accounting_month) = 1),
  ota_commission numeric(12, 2) not null default 0 check (ota_commission >= 0),
  discount numeric(12, 2) not null default 0 check (discount >= 0),
  notes text,
  -- Check-in details, entered by staff (the guest form waits — plan.md).
  guest_names text,
  food_preferences text,
  allergies text,
  requirements text,
  id_verified boolean not null default false,
  checkin_at timestamptz,
  checkout_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  -- History from the income sheet: the row it came from (the repeat-
  -- import key), the room count it claimed (rooms were never named — the
  -- occupancy of imported months stays an estimate), and what the import
  -- could not decide, until a person marks it reviewed.
  source_key text unique,
  legacy_room_count numeric(6, 2) check (legacy_room_count >= 0),
  review_flags text[] not null default '{}',
  reviewed_at timestamptz,
  reviewed_by uuid references profiles (id),
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Target of the children's composite keys.
  unique (id, is_block),
  constraint birdwing_stays_dates check (departure >= arrival),
  constraint birdwing_stays_block_shape check (
    is_block = (guest_id is null)
    and is_block = (use is null)
    and (status = 'blocked') <= is_block
    and (not is_block or status in ('blocked', 'cancelled'))
  )
);

create index if not exists birdwing_stays_arrival_idx on birdwing_stays (arrival);
create index if not exists birdwing_stays_month_idx on birdwing_stays (accounting_month);
create index if not exists birdwing_stays_guest_idx on birdwing_stays (guest_id);
create index if not exists birdwing_stays_status_idx on birdwing_stays (status);

-- The rooms a stay holds, each with its own nights (a party may take R1
-- for three nights and R2 for the last one).
create table if not exists birdwing_stay_rooms (
  id uuid primary key default gen_random_uuid(),
  stay_id uuid not null references birdwing_stays (id),
  room_id uuid not null references birdwing_rooms (id),
  -- The first night and the morning they leave: [from_date, to_date).
  -- A departure morning is the next arrival's afternoon, never a clash.
  from_date date not null,
  to_date date not null,
  extra_beds int not null default 0 check (extra_beds >= 0),
  -- Set when the stay is cancelled; a released row blocks nobody.
  released_at timestamptz,
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint birdwing_stay_rooms_nights check (to_date > from_date),
  -- THE double-booking guard.
  constraint birdwing_stay_rooms_no_overlap exclude using gist (
    room_id with =,
    daterange(from_date, to_date, '[)') with &&
  ) where (released_at is null)
);
create index if not exists birdwing_stay_rooms_stay_idx on birdwing_stay_rooms (stay_id);

-- The charge lines. `rate_card_id` points at the head it came from, but
-- head, kind, GST and SAC are COPIED onto the line: a rate card edited
-- next year must not rewrite this year's invoices.
create table if not exists birdwing_stay_charges (
  id uuid primary key default gen_random_uuid(),
  stay_id uuid not null,
  is_block boolean not null default false check (not is_block),
  rate_card_id uuid references birdwing_rate_card (id),
  head text not null check (length(trim(head)) > 0),
  kind text not null default 'other' check (kind in ('room', 'food', 'experience', 'addon', 'other')),
  description text,
  qty numeric(10, 2) not null check (qty > 0),
  rate numeric(12, 2) not null check (rate >= 0),
  gst_pct numeric(5, 2) not null default 0 check (gst_pct between 0 and 28),
  -- false: the rate is before GST (the rate card's way); true: the rate
  -- already includes it (an OTA's figure, or history from the sheet).
  rate_includes_gst boolean not null default false,
  sac text,
  -- GST-inclusive, to the paisa. Generated, so every reader agrees.
  amount numeric(12, 2) generated always as (
    round(
      case when rate_includes_gst then qty * rate else qty * rate * (1 + gst_pct / 100) end,
      2
    )
  ) stored,
  sort_order int not null default 0,
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A room block can carry no charge: the composite key makes it so.
  foreign key (stay_id, is_block) references birdwing_stays (id, is_block)
);
create index if not exists birdwing_stay_charges_stay_idx on birdwing_stay_charges (stay_id, sort_order);

-- ---------------------------------------------------------------------
-- 6. Invoices, receipts, cross-charges
-- ---------------------------------------------------------------------

create table if not exists birdwing_invoices (
  id uuid primary key default gen_random_uuid(),
  stay_id uuid not null references birdwing_stays (id),
  -- MEF/GH/133. Minted by birdwing_issue_invoice(); an invoice row exists
  -- only once issued — a draft is the stay's charges, previewed.
  number text not null,
  -- Imported from the sheet, whose references repeat (#19, MEF/GH/49 …):
  -- history keeps its number but is excluded from the uniqueness rule.
  historic boolean not null default false,
  issued_on date not null default current_date,
  issued_by uuid references profiles (id),
  bill_to_name text not null check (length(trim(bill_to_name)) > 0),
  bill_to_gstin text,
  bill_to_address text,
  -- Before GST, the two halves, and the GST-inclusive sum of the lines;
  -- the stay's discount, and what the guest is asked to pay.
  taxable numeric(12, 2) not null,
  cgst numeric(12, 2) not null,
  sgst numeric(12, 2) not null,
  total numeric(12, 2) not null,
  discount numeric(12, 2) not null default 0,
  payable numeric(12, 2) not null,
  -- Lines, letterhead, bank and terms as printed — so a reprint next
  -- year reads exactly as the one handed over.
  snapshot jsonb not null,
  status text not null default 'issued' check (status in ('issued', 'cancelled')),
  cancelled_at timestamptz,
  cancelled_by uuid references profiles (id),
  cancel_reason text,
  source_key text unique,
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, stay_id),
  constraint birdwing_invoices_cancel_shape check (
    (status = 'cancelled') = (cancelled_at is not null)
    and (status <> 'cancelled' or length(trim(coalesce(cancel_reason, ''))) > 0)
  )
);
create unique index if not exists birdwing_invoices_number_key
  on birdwing_invoices (number) where not historic;
-- One live invoice per stay.
create unique index if not exists birdwing_invoices_one_issued
  on birdwing_invoices (stay_id) where status = 'issued';

create table if not exists birdwing_receipts (
  id uuid primary key default gen_random_uuid(),
  stay_id uuid not null references birdwing_stays (id),
  invoice_id uuid,
  amount numeric(12, 2) not null check (amount > 0),
  received_on date not null default current_date,
  mode text not null default 'upi'
    check (mode in ('bank', 'cheque', 'upi', 'cash', 'ota', 'other')),
  reference text,
  note text,
  source_key text unique,
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A receipt against an invoice is against THAT stay's invoice.
  foreign key (invoice_id, stay_id) references birdwing_invoices (id, stay_id)
);
create index if not exists birdwing_receipts_stay_idx on birdwing_receipts (stay_id, received_on);

-- Closing what nobody will pay: an internal stay's balance carried by a
-- Goodearth cost centre (a transfer, not income), or a guest balance
-- written off. Financial Management reads both apart from receipts.
create table if not exists birdwing_cross_charges (
  id uuid primary key default gen_random_uuid(),
  stay_id uuid not null references birdwing_stays (id),
  kind text not null default 'cross_charge' check (kind in ('cross_charge', 'write_off')),
  cost_centre_id uuid references birdwing_cost_centres (id),
  amount numeric(12, 2) not null check (amount > 0),
  -- The month it is counted in (first of the month).
  charged_month date not null check (extract(day from charged_month) = 1),
  note text,
  source_key text unique,
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint birdwing_cross_charges_centre check (kind = 'write_off' or cost_centre_id is not null)
);
create index if not exists birdwing_cross_charges_stay_idx on birdwing_cross_charges (stay_id);

-- ---------------------------------------------------------------------
-- 7. Guards — the rules RLS cannot express
-- ---------------------------------------------------------------------
-- Invoker throughout, each on a direct write path in this tool only — no
-- cross-tool trigger reaches them (BUGCATCHER #11 does not apply). The
-- messages are written for the caretaker to read. The status machine is
-- mirrored, for buttons only, by lib/birdwing/workflow.ts.

create or replace function birdwing_mint(p_scope text)
returns int
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_no int;
begin
  insert into birdwing_counters (scope, last_no) values (p_scope, 1)
  on conflict (scope) do update set last_no = birdwing_counters.last_no + 1
  returning last_no into v_no;
  return v_no;
end $$;

create or replace function birdwing_stays_guard()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_no int;
begin
  if tg_op = 'INSERT' then
    v_no := birdwing_mint('stay');
    -- greatest(): lpad TRUNCATES a longer string (0019's lesson).
    new.ref := 'BW-' || lpad(v_no::text, greatest(4, length(v_no::text)), '0');
    if new.accounting_month is null then
      new.accounting_month := date_trunc('month', new.arrival)::date;
    end if;
    return new;
  end if;

  -- UPDATE. Identity never changes.
  if (new.ref, new.is_block, new.created_by, new.created_at, new.source_key)
     is distinct from (old.ref, old.is_block, old.created_by, old.created_at, old.source_key) then
    raise exception 'A stay''s reference and kind never change.';
  end if;

  if old.status = 'cancelled' then
    -- Only the record-keeping fields move on a cancelled stay.
    if (new.status, new.guest_id, new.use, new.arrival, new.departure, new.adults,
        new.children, new.pets, new.ota_commission, new.discount, new.channel)
       is distinct from
       (old.status, old.guest_id, old.use, old.arrival, old.departure, old.adults,
        old.children, old.pets, old.ota_commission, old.discount, old.channel) then
      raise exception '% is cancelled — make a new stay instead.', old.ref;
    end if;
    return new;
  end if;

  if new.status is distinct from old.status then
    if not (
      (old.status = 'enquiry' and new.status in ('confirmed', 'cancelled'))
      or (old.status = 'confirmed' and new.status in ('checked_in', 'cancelled'))
      or (old.status = 'checked_in' and new.status in ('checked_out', 'confirmed'))
      or (old.status = 'checked_out' and new.status = 'checked_in')
      or (old.status = 'blocked' and new.status = 'cancelled')
    ) then
      raise exception 'A stay cannot go from % to %.',
        replace(old.status, '_', ' '), replace(new.status, '_', ' ');
    end if;

    if new.status = 'checked_in' and old.status = 'confirmed' then
      new.checkin_at := coalesce(new.checkin_at, now());
    elsif new.status = 'confirmed' and old.status = 'checked_in' then
      new.checkin_at := null;
    elsif new.status = 'checked_out' then
      new.checkout_at := coalesce(new.checkout_at, now());
    elsif new.status = 'checked_in' and old.status = 'checked_out' then
      new.checkout_at := null;
    elsif new.status = 'cancelled' then
      new.cancelled_at := now();
    end if;
  end if;

  -- New dates must still hold every room booked on the stay.
  if (new.arrival, new.departure) is distinct from (old.arrival, old.departure)
     and exists (
       select 1 from birdwing_stay_rooms r
       where r.stay_id = new.id and r.released_at is null
         and (r.from_date < new.arrival or r.to_date > new.departure)
     ) then
    raise exception 'A room on this stay falls outside the new dates — change the room''s nights first.';
  end if;

  return new;
end $$;

drop trigger if exists birdwing_stays_guard on birdwing_stays;
create trigger birdwing_stays_guard
  before insert or update on birdwing_stays
  for each row execute function birdwing_stays_guard();

-- A cancelled stay lets go of its rooms, in the same transaction.
create or replace function birdwing_stays_release_rooms()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  update birdwing_stay_rooms
  set released_at = now(), updated_by = new.updated_by
  where stay_id = new.id and released_at is null;
  return null;
end $$;

drop trigger if exists birdwing_stays_release_rooms on birdwing_stays;
create trigger birdwing_stays_release_rooms
  after update of status on birdwing_stays
  for each row
  when (new.status = 'cancelled' and old.status is distinct from 'cancelled')
  execute function birdwing_stays_release_rooms();

create or replace function birdwing_stay_rooms_guard()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_stay record;
  v_row birdwing_stay_rooms;
begin
  if tg_op = 'DELETE' then
    v_row := old;
  else
    v_row := new;
  end if;

  select ref, status, arrival, departure into v_stay
  from birdwing_stays where id = v_row.stay_id;

  if tg_op = 'UPDATE' then
    if new.stay_id is distinct from old.stay_id then
      raise exception 'A room line never moves to another stay.';
    end if;
    -- Releasing is the cancel path's one move, allowed whatever the status.
    if old.released_at is not null and new.released_at is distinct from old.released_at then
      raise exception 'A released room stays released — book it again on a new stay.';
    end if;
    if old.released_at is null and new.released_at is not null
       and (new.room_id, new.from_date, new.to_date, new.extra_beds)
           is not distinct from (old.room_id, old.from_date, old.to_date, old.extra_beds) then
      return new;
    end if;
  end if;

  if v_stay.status in ('cancelled', 'checked_out') then
    raise exception '% is %; its rooms are its record now.', v_stay.ref, replace(v_stay.status, '_', ' ');
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  if new.released_at is not null then
    raise exception 'A room is booked live; cancelling the stay is what releases it.';
  end if;
  if new.from_date < v_stay.arrival or new.to_date > v_stay.departure then
    raise exception 'A room''s nights must fall within the stay (% to %).',
      to_char(v_stay.arrival, 'DD Mon'), to_char(v_stay.departure, 'DD Mon');
  end if;
  return new;
end $$;

drop trigger if exists birdwing_stay_rooms_guard on birdwing_stay_rooms;
create trigger birdwing_stay_rooms_guard
  before insert or update or delete on birdwing_stay_rooms
  for each row execute function birdwing_stay_rooms_guard();

-- An issued invoice freezes the stay's charges.
create or replace function birdwing_stay_charges_open_only()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_stay uuid;
  v_number text;
begin
  if tg_op = 'DELETE' then
    v_stay := old.stay_id;
  else
    v_stay := new.stay_id;
  end if;
  if tg_op = 'UPDATE' and new.stay_id is distinct from old.stay_id then
    raise exception 'A charge never moves to another stay.';
  end if;

  select number into v_number from birdwing_invoices
  where stay_id = v_stay and status = 'issued';
  if v_number is not null then
    raise exception 'Invoice % has been issued — cancel it first to change the charges.', v_number;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end $$;

drop trigger if exists birdwing_stay_charges_open_only on birdwing_stay_charges;
create trigger birdwing_stay_charges_open_only
  before insert or update or delete on birdwing_stay_charges
  for each row execute function birdwing_stay_charges_open_only();

-- An issued invoice never changes; cancelling it is its one move.
create or replace function birdwing_invoices_guard()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Invoice % stays on the record — cancel it instead.', old.number;
  end if;

  if (new.stay_id, new.number, new.historic, new.issued_on, new.issued_by, new.bill_to_name,
      new.bill_to_gstin, new.bill_to_address, new.taxable, new.cgst, new.sgst, new.total,
      new.discount, new.payable, new.snapshot, new.source_key, new.created_by, new.created_at)
     is distinct from
     (old.stay_id, old.number, old.historic, old.issued_on, old.issued_by, old.bill_to_name,
      old.bill_to_gstin, old.bill_to_address, old.taxable, old.cgst, old.sgst, old.total,
      old.discount, old.payable, old.snapshot, old.source_key, old.created_by, old.created_at) then
    raise exception 'Invoice % has been issued — an issued invoice never changes. Cancel it and issue again.',
      old.number;
  end if;
  if old.status = 'cancelled' and new.status is distinct from old.status then
    raise exception 'Invoice % is cancelled for good.', old.number;
  end if;
  if old.status = 'cancelled'
     and (new.cancelled_at, new.cancelled_by, new.cancel_reason)
         is distinct from (old.cancelled_at, old.cancelled_by, old.cancel_reason) then
    raise exception 'Invoice % is cancelled for good.', old.number;
  end if;
  return new;
end $$;

drop trigger if exists birdwing_invoices_guard on birdwing_invoices;
create trigger birdwing_invoices_guard
  before update or delete on birdwing_invoices
  for each row execute function birdwing_invoices_guard();

-- ---------------------------------------------------------------------
-- 8. Issuing an invoice — the one act that mints a number
-- ---------------------------------------------------------------------
-- Locks the stay, so two people pressing Issue at once serialise; the
-- second gets the first one's number back (pressing twice is not two
-- invoices). Lines, letterhead, bank and terms are snapshotted in the
-- same transaction as the mint.

create or replace function birdwing_issue_invoice(
  p_stay_id uuid,
  p_bill_to_name text,
  p_bill_to_gstin text default null,
  p_bill_to_address text default null
)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_stay record;
  v_existing text;
  v_settings record;
  v_company record;
  v_lines jsonb;
  v_total numeric;
  v_taxable numeric;
  v_gst numeric;
  v_no int;
  v_number text;
begin
  select s.id, s.ref, s.is_block, s.status, s.arrival, s.departure, s.discount,
         s.adults, s.children, g.name as guest_name, g.phone as guest_phone
    into v_stay
  from birdwing_stays s
  left join birdwing_guests g on g.id = s.guest_id
  where s.id = p_stay_id
  for update of s;

  if not found then
    raise exception 'That stay could not be found.';
  end if;
  if v_stay.is_block then
    raise exception 'A room block has nothing to invoice.';
  end if;

  select number into v_existing from birdwing_invoices
  where stay_id = p_stay_id and status = 'issued';
  if v_existing is not null then
    return v_existing;
  end if;

  if length(trim(coalesce(p_bill_to_name, ''))) = 0 then
    raise exception 'Say who the invoice is made out to.';
  end if;

  select * into v_settings from birdwing_settings where id;
  if v_settings.company_id is null then
    raise exception 'Choose the invoicing company in Birdwing → Settings before issuing an invoice.';
  end if;
  select id, name, legal_name, address, gstin, state, phone, email into v_company
  from companies where id = v_settings.company_id;

  select
    coalesce(jsonb_agg(jsonb_build_object(
      'head', c.head,
      'description', c.description,
      'sac', c.sac,
      'qty', c.qty,
      'rate', c.rate,
      'rate_includes_gst', c.rate_includes_gst,
      'gst_pct', c.gst_pct,
      'taxable', round(c.amount / (1 + c.gst_pct / 100), 2),
      'amount', c.amount
    ) order by c.sort_order, c.created_at), '[]'::jsonb),
    coalesce(sum(c.amount), 0),
    coalesce(sum(round(c.amount / (1 + c.gst_pct / 100), 2)), 0)
    into v_lines, v_total, v_taxable
  from birdwing_stay_charges c
  where c.stay_id = p_stay_id;

  if jsonb_array_length(v_lines) = 0 then
    raise exception 'Add at least one charge before issuing the invoice.';
  end if;
  if v_stay.discount > v_total then
    raise exception 'The discount is more than the charges.';
  end if;

  v_gst := v_total - v_taxable;
  v_no := birdwing_mint('invoice');
  -- The founder's series (Maloor Eco Farms, Guest House), unpadded as on
  -- the invoices already sent.
  v_number := 'MEF/GH/' || v_no::text;

  insert into birdwing_invoices (
    stay_id, number, issued_on, issued_by, bill_to_name, bill_to_gstin, bill_to_address,
    taxable, cgst, sgst, total, discount, payable, snapshot, created_by, updated_by
  ) values (
    p_stay_id, v_number, current_date, auth.uid(), trim(p_bill_to_name),
    nullif(trim(coalesce(p_bill_to_gstin, '')), ''),
    nullif(trim(coalesce(p_bill_to_address, '')), ''),
    v_taxable, round(v_gst / 2, 2), v_gst - round(v_gst / 2, 2), v_total,
    v_stay.discount, v_total - v_stay.discount,
    jsonb_build_object(
      'lines', v_lines,
      'company', to_jsonb(v_company),
      'place_of_supply', v_settings.place_of_supply,
      'bank_details', v_settings.bank_details,
      'upi_id', v_settings.upi_id,
      'terms', v_settings.invoice_terms,
      'stay', jsonb_build_object(
        'ref', v_stay.ref, 'arrival', v_stay.arrival, 'departure', v_stay.departure,
        'guests', v_stay.adults + v_stay.children,
        'guest_name', v_stay.guest_name, 'guest_phone', v_stay.guest_phone
      )
    ),
    auth.uid(), auth.uid()
  );

  return v_number;
end $$;

revoke execute on function birdwing_mint(text) from public, anon;
grant execute on function birdwing_mint(text) to authenticated;
revoke execute on function birdwing_issue_invoice(uuid, text, text, text) from public, anon;
grant execute on function birdwing_issue_invoice(uuid, text, text, text) to authenticated;
-- Trigger functions: no client role calls them directly.
revoke execute on function birdwing_stays_guard() from public, anon, authenticated;
revoke execute on function birdwing_stays_release_rooms() from public, anon, authenticated;
revoke execute on function birdwing_stay_rooms_guard() from public, anon, authenticated;
revoke execute on function birdwing_stay_charges_open_only() from public, anon, authenticated;
revoke execute on function birdwing_invoices_guard() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 9. Stay documents — the `birdwing-stays` bucket and its file rows
-- ---------------------------------------------------------------------
-- A photo of a guest's ID, a booking confirmation. PRIVATE: an ID at a
-- guessable URL is the worst leak this tool could have. 4 MB is the
-- server-action cap (next.config.ts), restated so the database refuses
-- what slips past the form.

create table if not exists birdwing_stay_files (
  id uuid primary key default gen_random_uuid(),
  stay_id uuid not null references birdwing_stays (id),
  kind text not null default 'other' check (kind in ('id', 'booking', 'other')),
  storage_path text not null unique,
  file_name text not null,
  content_type text not null,
  size_bytes int not null check (size_bytes > 0),
  created_by uuid references profiles (id),
  created_at timestamptz not null default now()
);
create index if not exists birdwing_stay_files_stay_idx on birdwing_stay_files (stay_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'birdwing-stays', 'birdwing-stays', false, 4194304,
  array['application/pdf', 'image/jpeg', 'image/png']
)
on conflict (id) do update
  set public = false,
      file_size_limit = 4194304,
      allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png'];

-- public.has_app FULLY QUALIFIED — storage policies do not run with
-- `public` on the search path, and an unqualified call fails at upload
-- time, not apply time (0010, 0061).
drop policy if exists "birdwing-stays readable by birdwing app" on storage.objects;
create policy "birdwing-stays readable by birdwing app"
  on storage.objects for select to authenticated
  using (bucket_id = 'birdwing-stays' and public.has_app('/birdwing'));

drop policy if exists "birdwing-stays writable by birdwing app" on storage.objects;
create policy "birdwing-stays writable by birdwing app"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'birdwing-stays' and public.has_app('/birdwing'));

drop policy if exists "birdwing-stays deletable by birdwing app" on storage.objects;
create policy "birdwing-stays deletable by birdwing app"
  on storage.objects for delete to authenticated
  using (bucket_id = 'birdwing-stays' and public.has_app('/birdwing'));

-- ---------------------------------------------------------------------
-- 10. Audit, updated_at, RLS
-- ---------------------------------------------------------------------

do $$
declare
  t text;
begin
  for t in select unnest(array[
    'birdwing_rooms', 'birdwing_rate_card', 'birdwing_cost_centres', 'birdwing_settings',
    'birdwing_guests', 'birdwing_stays', 'birdwing_stay_rooms', 'birdwing_stay_charges',
    'birdwing_invoices', 'birdwing_receipts', 'birdwing_cross_charges', 'birdwing_stay_files'
  ])
  loop
    execute format('drop trigger if exists audit_%I on %I', t, t);
    if t <> 'birdwing_settings' then
      execute format(
        'create trigger audit_%I after insert or update or delete on %I
           for each row execute function audit_row()', t, t);
    end if;
  end loop;

  -- The counters are machinery, not records; files carry no updated_at.
  for t in select unnest(array[
    'birdwing_rooms', 'birdwing_rate_card', 'birdwing_cost_centres', 'birdwing_settings',
    'birdwing_guests', 'birdwing_stays', 'birdwing_stay_rooms', 'birdwing_stay_charges',
    'birdwing_invoices', 'birdwing_receipts', 'birdwing_cross_charges'
  ])
  loop
    execute format('drop trigger if exists set_updated_at on %I', t);
    execute format(
      'create trigger set_updated_at before update on %I
         for each row execute function set_updated_at()', t);
  end loop;

  for t in select unnest(array[
    'birdwing_rooms', 'birdwing_rate_card', 'birdwing_cost_centres', 'birdwing_settings',
    'birdwing_guests', 'birdwing_counters', 'birdwing_stays', 'birdwing_stay_rooms',
    'birdwing_stay_charges', 'birdwing_invoices', 'birdwing_receipts',
    'birdwing_cross_charges', 'birdwing_stay_files'
  ])
  loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- audit_row() reads new.id; birdwing_settings' id is a boolean, so its
-- changes are kept by updated_by/updated_at alone (one row, admin-only).

-- ---------------------------------------------------------------------
-- 11. Policies — ONE per verb; nothing for anon
-- ---------------------------------------------------------------------
-- Everything is /birdwing to read: guest names and phones, and the money,
-- are this tool's. The masters are written by admins only; the daily
-- tables by the grant.

do $$
declare
  t text;
begin
  -- Masters: read by the grant, written by admins, never deleted.
  for t in select unnest(array['birdwing_rooms', 'birdwing_rate_card', 'birdwing_cost_centres'])
  loop
    execute format('drop policy if exists "%s readable by birdwing app" on %I', t, t);
    execute format(
      'create policy "%s readable by birdwing app" on %I
         for select to authenticated using (has_app(''/birdwing''))', t, t);
    execute format('drop policy if exists "%s insertable by admins" on %I', t, t);
    execute format(
      'create policy "%s insertable by admins" on %I
         for insert to authenticated with check (is_admin())', t, t);
    execute format('drop policy if exists "%s updatable by admins" on %I', t, t);
    execute format(
      'create policy "%s updatable by admins" on %I
         for update to authenticated using (is_admin()) with check (is_admin())', t, t);
  end loop;

  -- Read, insert, update — no delete (a stay is cancelled, an invoice
  -- cancelled, a guest kept).
  for t in select unnest(array['birdwing_guests', 'birdwing_stays', 'birdwing_invoices', 'birdwing_counters'])
  loop
    execute format('drop policy if exists "%s readable by birdwing app" on %I', t, t);
    execute format(
      'create policy "%s readable by birdwing app" on %I
         for select to authenticated using (has_app(''/birdwing''))', t, t);
    execute format('drop policy if exists "%s insertable by birdwing app" on %I', t, t);
    execute format(
      'create policy "%s insertable by birdwing app" on %I
         for insert to authenticated with check (has_app(''/birdwing''))', t, t);
    execute format('drop policy if exists "%s updatable by birdwing app" on %I', t, t);
    execute format(
      'create policy "%s updatable by birdwing app" on %I
         for update to authenticated
         using (has_app(''/birdwing'')) with check (has_app(''/birdwing''))', t, t);
  end loop;

  -- The lines of a stay: all four verbs (the guards say when).
  for t in select unnest(array['birdwing_stay_rooms', 'birdwing_stay_charges'])
  loop
    execute format('drop policy if exists "%s readable by birdwing app" on %I', t, t);
    execute format(
      'create policy "%s readable by birdwing app" on %I
         for select to authenticated using (has_app(''/birdwing''))', t, t);
    execute format('drop policy if exists "%s insertable by birdwing app" on %I', t, t);
    execute format(
      'create policy "%s insertable by birdwing app" on %I
         for insert to authenticated with check (has_app(''/birdwing''))', t, t);
    execute format('drop policy if exists "%s updatable by birdwing app" on %I', t, t);
    execute format(
      'create policy "%s updatable by birdwing app" on %I
         for update to authenticated
         using (has_app(''/birdwing'')) with check (has_app(''/birdwing''))', t, t);
    execute format('drop policy if exists "%s deletable by birdwing app" on %I', t, t);
    execute format(
      'create policy "%s deletable by birdwing app" on %I
         for delete to authenticated using (has_app(''/birdwing''))', t, t);
  end loop;

  -- Money in and money closed, and documents: entered or removed, never
  -- edited in place — a wrong receipt is deleted and entered again, and
  -- the audit log keeps both.
  for t in select unnest(array['birdwing_receipts', 'birdwing_cross_charges', 'birdwing_stay_files'])
  loop
    execute format('drop policy if exists "%s readable by birdwing app" on %I', t, t);
    execute format(
      'create policy "%s readable by birdwing app" on %I
         for select to authenticated using (has_app(''/birdwing''))', t, t);
    execute format('drop policy if exists "%s insertable by birdwing app" on %I', t, t);
    execute format(
      'create policy "%s insertable by birdwing app" on %I
         for insert to authenticated with check (has_app(''/birdwing''))', t, t);
    execute format('drop policy if exists "%s deletable by birdwing app" on %I', t, t);
    execute format(
      'create policy "%s deletable by birdwing app" on %I
         for delete to authenticated using (has_app(''/birdwing''))', t, t);
  end loop;
end $$;

-- Settings: one row, read by the grant, changed by admins.
drop policy if exists "birdwing_settings readable by birdwing app" on birdwing_settings;
create policy "birdwing_settings readable by birdwing app" on birdwing_settings
  for select to authenticated using (has_app('/birdwing'));
drop policy if exists "birdwing_settings updatable by admins" on birdwing_settings;
create policy "birdwing_settings updatable by admins" on birdwing_settings
  for update to authenticated using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------
-- 12. Seeds — the four rooms, the old app's rate card, the cost centres
-- ---------------------------------------------------------------------
-- Reference data, each `where not exists` on its functional key so a
-- re-run never fights an edit. The rate card is the laptop app's thirteen
-- heads with its rates, GST and SAC as it held them — SWITCHED OFF until
-- the founder has read them in Settings (the app itself said "review
-- before issuing"). Capacities and room names are left to a person.

insert into birdwing_rooms (code, name, sort_order)
select v.code, v.name, v.sort_order
from (values ('R1', 'Room 1', 10), ('R2', 'Room 2', 20), ('R3', 'Room 3', 30), ('R4', 'Room 4', 40))
  as v (code, name, sort_order)
where not exists (select 1 from birdwing_rooms r where lower(trim(r.code)) = lower(v.code));

insert into birdwing_rate_card (head, kind, default_rate, gst_pct, sac, sort_order, is_active)
select v.head, v.kind, v.rate, v.gst, nullif(v.sac, ''), v.sort_order, false
from (values
  ('Room rent',      'room',       3800, 5,  '996311', 10),
  ('Extra beds',     'addon',       800, 5,  '996311', 20),
  ('Breakfast',      'food',        200, 5,  '996336', 30),
  ('Lunch',          'food',        600, 5,  '996336', 40),
  ('Dinner',         'food',        500, 5,  '996336', 50),
  ('Refreshments',   'food',        100, 5,  '996336', 60),
  ('Pet food',       'food',        250, 5,  '996336', 70),
  ('Massage',        'experience', 1800, 18, '999723', 80),
  ('Yoga',           'experience',  500, 18, '999723', 90),
  ('Night walk',     'experience',  500, 18, '999642', 100),
  ('Nature walk',    'experience',    0, 18, '999642', 110),
  ('City trail',     'experience',    0, 18, '',       120),
  ('Other services', 'other',         0, 0,  '',       130)
) as v (head, kind, rate, gst, sac, sort_order)
where not exists (select 1 from birdwing_rate_card c where lower(trim(c.head)) = lower(v.head));

insert into birdwing_cost_centres (name, sort_order)
select v.name, v.sort_order
from (values ('Marketing', 10), ('Sales', 20), ('Projects', 30), ('Directors', 40), ('Kaadal', 50))
  as v (name, sort_order)
where not exists (select 1 from birdwing_cost_centres c where lower(trim(c.name)) = lower(v.name));

-- ---------------------------------------------------------------------
-- 13. The sidebar: a Hospitality team holding both tools
-- ---------------------------------------------------------------------
-- The founder asked for "a new section". Teams arrange and grant nothing
-- (0114). Made only if no team of that name exists, placed last, and a
-- tool already given a team keeps it — a re-run never fights Settings →
-- Teams.

insert into tool_teams (name, sort_order)
select 'Hospitality', coalesce((select max(sort_order) from tool_teams), 0) + 1
where not exists (select 1 from tool_teams where lower(trim(name)) = 'hospitality');

insert into tool_team_apps (app, team_id)
select v.app, t.id
from (values ('/birdwing'), ('/birdwing-books')) as v (app)
join tool_teams t on lower(trim(t.name)) = 'hospitality'
on conflict (app) do nothing;

-- ---------------------------------------------------------------------
-- 14. Prove it all landed
-- ---------------------------------------------------------------------

do $$
declare
  r record;
  c text;
  v int;
  b record;
begin
  foreach c in array array['user_apps_app_known', 'role_apps_app_known']
  loop
    if not exists (
      select 1 from pg_constraint
      where conname = c
        and pg_get_constraintdef(oid) like '%''/birdwing''%'
        and pg_get_constraintdef(oid) like '%''/birdwing-books''%'
        and pg_get_constraintdef(oid) like '%''/dexter''%'
    ) then
      raise exception '0115: % does not admit both Birdwing slugs (and keep /dexter)', c;
    end if;
  end loop;

  for r in
    select * from (values
      ('birdwing_rooms', 3), ('birdwing_rate_card', 3), ('birdwing_cost_centres', 3),
      ('birdwing_settings', 2), ('birdwing_guests', 3), ('birdwing_counters', 3),
      ('birdwing_stays', 3), ('birdwing_stay_rooms', 4), ('birdwing_stay_charges', 4),
      ('birdwing_invoices', 3), ('birdwing_receipts', 3), ('birdwing_cross_charges', 3),
      ('birdwing_stay_files', 3)
    ) as x (name, expected)
  loop
    if not exists (
      select 1 from pg_class cl join pg_namespace n on n.oid = cl.relnamespace
      where n.nspname = 'public' and cl.relname = r.name and cl.relrowsecurity
    ) then
      raise exception '0115: % is missing or has RLS off', r.name;
    end if;
    select count(*) into v from pg_policies where schemaname = 'public' and tablename = r.name;
    if v <> r.expected then
      raise exception '0115: % has % policies, expected %', r.name, v, r.expected;
    end if;
    select count(*) into v from pg_policies
      where schemaname = 'public' and tablename = r.name and cmd = 'SELECT';
    if v <> 1 then
      raise exception '0115: % has % SELECT policies, expected exactly 1', r.name, v;
    end if;
    if exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = r.name and 'anon' = any(roles)
    ) then
      raise exception '0115: % has a policy for anon', r.name;
    end if;
  end loop;

  -- No delete on what is cancelled rather than removed.
  if exists (
    select 1 from pg_policies where schemaname = 'public' and cmd = 'DELETE'
      and tablename in ('birdwing_stays', 'birdwing_invoices', 'birdwing_guests', 'birdwing_counters')
  ) then
    raise exception '0115: a stay, invoice, guest or counter is deletable';
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'birdwing_stay_rooms_no_overlap' and contype = 'x'
  ) then
    raise exception '0115: the double-booking exclusion constraint is missing';
  end if;

  if (select last_no from birdwing_counters where scope = 'invoice') < 132 then
    raise exception '0115: the invoice counter is below 132 — MEF/GH/132 is reserved';
  end if;
  if (select count(*) from birdwing_settings) <> 1 then
    raise exception '0115: birdwing_settings must hold exactly one row';
  end if;
  if (select count(*) from birdwing_rooms) < 4 then
    raise exception '0115: the four rooms are missing';
  end if;

  select * into b from storage.buckets where id = 'birdwing-stays';
  if b is null or b.public or b.file_size_limit <> 4194304 then
    raise exception '0115: birdwing-stays bucket missing, public, or the wrong size';
  end if;
  select count(*) into v from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname like 'birdwing-stays %';
  if v <> 3 then
    raise exception '0115: % birdwing-stays storage policies, expected 3', v;
  end if;

  if exists (
    select 1 from information_schema.routine_privileges
    where routine_schema = 'public' and grantee in ('anon', 'PUBLIC')
      and routine_name in ('birdwing_mint', 'birdwing_issue_invoice')
  ) then
    raise exception '0115: anon or public may execute a Birdwing function';
  end if;

  if (select count(*) from tool_team_apps where app in ('/birdwing', '/birdwing-books')) <> 2 then
    raise exception '0115: the two Birdwing tools have no team';
  end if;
end $$;
