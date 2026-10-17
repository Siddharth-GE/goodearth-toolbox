/**
 * Brings Birdwing's history in, once, from the "BirdWing Manager" app's parsed data
 * (data/seed.json) into Birdwing Stays and Books (0115, 0116).
 *
 *   npx tsx scripts/import-birdwing.ts --project <ref> --seed data/birdwing-seed.json            # dry run
 *   npx tsx scripts/import-birdwing.ts --project <ref> --seed data/birdwing-seed.json --commit
 *
 * One transaction with an assertion block proving every source row landed, so all or
 * nothing; a dry run aborts at the end. Re-runnable: every row is keyed to its source
 * and an existing key is skipped. Settings only FILL BLANKS.
 *
 * Decisions (review flags show on Stays -> Review):
 *   * Goodearth's own stays come in with no cost centre.
 *   * one GST-inclusive charge line per head (5% room and food, 18% experiences).
 *   * money received is the sheet's TOTAL RECEIVED as one undated receipt; its advance and
 *     paid-after columns disagree with it on many rows.
 *   * commission / cash back / discount: an OTA's (Airbnb, Booking.com, MakeMyTrip) is OTA
 *     commission, anyone else's a discount; flagged either way.
 *   * old invoice numbers kept as history; the counter is not moved (next is MEF/GH/133).
 *   * rooms were never named: the COUNT is kept; a blank count with room rent is 1.
 *   * expenses pre-entered for a future month are flagged, never confirmed; staff names
 *     get one spelling (Sajina -> Sajna, Bijith -> Bijeeth).
 *   * attendance: status only; old overtime ("6.3") goes in the note, never read as hours.
 */
import { readFileSync } from "node:fs";

import { isCommit, literal, requireProjectRef, sql } from "./supabase-management";

type SeedLine = { head: string; total: number };
type SeedBooking = {
  id: string;
  name: string;
  invoice_ref: string;
  month: string;
  channel: string;
  referral: string;
  checkin: string | null;
  checkout: string | null;
  adults: number | null;
  children: number | null;
  room_count: number | null;
  remarks: string;
  lines: SeedLine[];
  historical_paid: number;
  review: string[];
  raw: Record<string, unknown>;
  source: string;
};
type SeedExpense = {
  id: string;
  month: string;
  category: string;
  purpose: string;
  date: string;
  amount: number;
  remarks: string;
  bill_link: string;
  supplier: string;
  payment_details: string;
  status: string;
  review: string;
  source_sheet: string;
  source_cell: string;
};
type SeedAttendance = {
  id: string;
  staff: string;
  date: string;
  status: string;
  in_time: string;
  out_time: string;
  legacy_am: number | null;
  legacy_pm: number | null;
};
type Seed = {
  bookings: SeedBooking[];
  expenses: SeedExpense[];
  attendance: SeedAttendance[];
  settings: {
    company: string;
    address: string;
    gstin: string;
    place_of_supply: string;
  };
  legacy_system: {
    settings: {
      bank: string;
      upi: string;
      policy: string;
      checkin: string;
      checkout: string;
    };
  };
  staff: {
    name: string;
    salary: number;
    shift_start: string;
    shift_end: string;
    ot_rate: number;
    room_rate: number;
  }[];
};

const argv = process.argv.slice(2);
const ref = requireProjectRef(process.argv);
const commit = isCommit(process.argv);
const seedAt = argv.indexOf("--seed");
if (seedAt < 0 || !argv[seedAt + 1]) {
  throw new Error("Name the laptop app's seed.json: --seed data/birdwing-seed.json");
}
const seed = JSON.parse(readFileSync(argv[seedAt + 1], "utf8")) as Seed;
const today = new Date().toISOString().slice(0, 10);

const MODES: Record<string, { use: string; channel: string }> = {
  "Direct Booking": { use: "guest", channel: "direct" },
  ABNB: { use: "guest", channel: "airbnb" },
  BDC: { use: "guest", channel: "booking" },
  MMT: { use: "guest", channel: "mmt" },
  Client: { use: "client", channel: "direct" },
  Prospect: { use: "prospect", channel: "direct" },
  "Team GoodEarth": { use: "team", channel: "direct" },
  Architect: { use: "architect", channel: "direct" },
  "GoodEarth Director": { use: "director", channel: "direct" },
  Vendor: { use: "vendor", channel: "direct" },
};
const OTA = new Set(["airbnb", "booking", "mmt"]);

const HEAD_KINDS: Record<string, { kind: string; gst: number }> = {
  "room rent": { kind: "room", gst: 5 },
  "extra beds": { kind: "addon", gst: 5 },
  breakfast: { kind: "food", gst: 5 },
  lunch: { kind: "food", gst: 5 },
  dinner: { kind: "food", gst: 5 },
  refreshments: { kind: "food", gst: 5 },
  "pet food": { kind: "food", gst: 5 },
  "nature walk": { kind: "experience", gst: 18 },
  "city trail": { kind: "experience", gst: 18 },
  massage: { kind: "experience", gst: 18 },
  yoga: { kind: "experience", gst: 18 },
  "night walk": { kind: "experience", gst: 18 },
};

const STAFF_NAMES: Record<string, string> = {
  sajina: "Sajna",
  sajna: "Sajna",
  bijith: "Bijeeth",
  bijeeth: "Bijeeth",
  amal: "Amal",
  appu: "Appu",
  sujitha: "Sujitha",
};
const staffName = (raw: string) => STAFF_NAMES[raw.trim().toLowerCase()] ?? raw.trim();

const ATTENDANCE: Record<string, string> = {
  present: "present",
  leave: "leave",
  halfday: "half_day",
  "half day": "half_day",
  "holiday leave": "holiday_leave",
  absent: "absent",
};

const EXPENSE_HEADS = [
  "Staff Salaries",
  "Food Supplies",
  "Gas",
  "Electricity",
  "WiFi",
  "Laundry",
  "Diesel",
  "Maintenance",
  "Other",
];

const isoDate = (value: string | null | undefined): string | null => {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value ?? "");
  if (!match) return null;
  const parsed = new Date(`${match[1]}T00:00:00Z`);
  return parsed.toISOString().slice(0, 10) === match[1] ? match[1] : null;
};
const monthEnd = (month: string) => {
  const [year, mon] = month.split("-").map(Number);
  return new Date(Date.UTC(year, mon, 0)).toISOString().slice(0, 10);
};
const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const num = (value: unknown) => (typeof value === "number" ? value : Number(value ?? 0) || 0);

const refCounts = new Map<string, number>();
for (const booking of seed.bookings) {
  const key = booking.invoice_ref.trim();
  if (key) refCounts.set(key, (refCounts.get(key) ?? 0) + 1);
}

const IGNORED_REVIEWS = ["Room numbers not supplied; unassigned", "Source formula errors: AI, AM"];

const stays: Record<string, unknown>[] = [];
const charges: Record<string, unknown>[] = [];
const invoices: Record<string, unknown>[] = [];
const receipts: Record<string, unknown>[] = [];
const flagCounts = new Map<string, number>();
const unknownModes = new Set<string>();
let totalCharged = 0;
let totalComm = 0;
let totalReceived = 0;

for (const [index, booking] of seed.bookings.entries()) {
  const flags: string[] = [];
  const flag = (text: string, kind: string) => {
    flags.push(text);
    flagCounts.set(kind, (flagCounts.get(kind) ?? 0) + 1);
  };
  const mode = MODES[booking.channel.trim()];
  if (!mode) unknownModes.add(booking.channel);
  const { use, channel } = mode ?? { use: "guest", channel: "other" };
  const month = `${booking.month}-01`;

  let arrival = isoDate(booking.checkin);
  let departure = isoDate(booking.checkout);
  if (!arrival) {
    arrival = month;
    departure = month;
    flag("No dates in the sheet — set to the first of the month.", "no dates");
  } else if (!departure || departure < arrival) {
    departure = arrival;
    flag("No usable check-out date in the sheet — taken as a day visit.", "bad nights");
  }
  const nights = Math.round((Date.parse(departure!) - Date.parse(arrival)) / 86_400_000);
  if (nights > 60) flag(`${nights} nights — check the dates.`, "bad nights");

  const lines = booking.lines.filter((line) => num(line.total) !== 0);
  const hasRoomRent = lines.some((line) => line.head.trim().toLowerCase() === "room rent");
  let roomCount: number | null = num(booking.room_count) || null;
  if (!roomCount && hasRoomRent && nights > 0) {
    roomCount = 1;
    flag("Room count blank in the sheet though room rent was charged — taken as 1.", "room count");
  } else if (roomCount && roomCount > 4) {
    flag(`The sheet says ${roomCount} rooms in a four-room house.`, "room count");
  }

  const commission = num(booking.raw["AN · Commission Amount/ Cash back/ Discount"]);
  const ota = OTA.has(channel) ? commission : 0;
  const discount = OTA.has(channel) ? 0 : commission;
  if (commission > 0) {
    flag(
      OTA.has(channel)
        ? `The sheet's commission/cash back/discount (₹${commission}) taken as the OTA's commission.`
        : `The sheet's commission/cash back/discount (₹${commission}) taken as a discount.`,
      "commission split",
    );
  }

  const charged = round2(lines.reduce((sum, line) => sum + num(line.total), 0));
  const received = round2(num(booking.historical_paid));
  const netReceivable = booking.raw["AI · Net Recievable Amount"];
  if (typeof netReceivable === "number" && Math.abs(netReceivable - (charged - commission)) >= 1) {
    flag(
      `The sheet's net receivable (₹${netReceivable}) differs from the charges less commission (₹${round2(charged - commission)}).`,
      "receivable mismatch",
    );
  }
  const invoiceRef = booking.invoice_ref.trim();
  if (invoiceRef && (refCounts.get(invoiceRef) ?? 0) > 1) {
    flag(`Invoice ${invoiceRef} is on more than one row of the sheet.`, "shared reference");
  }
  if (invoiceRef === "MEF/GH/132") {
    flag("MEF/GH/132 was a draft kept for Kalidas — check it before it is sent.", "draft 132");
  }
  if (use !== "guest" && received === 0 && charged - commission > 0) {
    flag(
      "Goodearth's own stay with nothing collected — charge it to a cost centre or write it off.",
      "internal, nothing collected",
    );
  }
  for (const note of booking.review) {
    if (!IGNORED_REVIEWS.includes(note) && !flags.some((existing) => existing === note)) {
      flags.push(note);
    }
  }

  const stayKey = booking.source || booking.id;
  totalCharged += charged;
  totalComm += commission;
  totalReceived += received;

  stays.push({
    row: index,
    source_key: stayKey,
    guest_name: booking.name.trim() || "(no name in the sheet)",
    use,
    channel,
    arrival,
    departure,
    adults: num(booking.adults),
    children: num(booking.children),
    accounting_month: month,
    ota_commission: ota,
    discount,
    referred_by: booking.referral?.trim() || null,
    notes: booking.remarks?.trim() || null,
    legacy_room_count: roomCount,
    review_flags: flags,
  });

  const lineRows = lines.map((line, sort) => {
    const head = line.head.trim();
    const known = HEAD_KINDS[head.toLowerCase()] ?? { kind: "other", gst: 0 };
    const amount = round2(num(line.total));
    return {
      stay_key: stayKey,
      head,
      kind: known.kind,
      qty: 1,
      rate: amount,
      gst_pct: known.gst,
      sort_order: sort,
      taxable: round2(amount / (1 + known.gst / 100)),
      amount,
    };
  });
  charges.push(...lineRows);

  if (invoiceRef && lineRows.length > 0) {
    const taxable = round2(lineRows.reduce((sum, line) => sum + line.taxable, 0));
    const gst = round2(charged - taxable);
    invoices.push({
      stay_key: stayKey,
      source_key: `${stayKey}#invoice`,
      number: invoiceRef,
      issued_on: departure && departure <= today ? departure : monthEnd(booking.month),
      bill_to_name: booking.name.trim() || "Guest",
      taxable,
      cgst: round2(gst / 2),
      sgst: round2(gst - round2(gst / 2)),
      total: charged,
      discount,
      payable: round2(charged - discount),
      snapshot: {
        lines: lineRows.map((line) => ({
          head: line.head,
          description: null,
          sac: null,
          qty: 1,
          rate: line.rate,
          rate_includes_gst: true,
          gst_pct: line.gst_pct,
          taxable: line.taxable,
          amount: line.amount,
        })),
        place_of_supply: seed.settings.place_of_supply,
        stay: {
          arrival,
          departure,
          guests: num(booking.adults) + num(booking.children),
          guest_name: booking.name.trim(),
        },
        from_the_old_sheet: true,
      },
    });
  }

  if (received > 0) {
    const advance = num(booking.raw["AJ · Advance Payment/ Payment Recieved via OTA"]);
    const after = num(booking.raw["AK · Paid after check out"]);
    const split =
      advance || after ? ` The sheet's split: advance ₹${advance}, after check-out ₹${after}.` : "";
    const counted = monthEnd(booking.month);
    receipts.push({
      stay_key: stayKey,
      source_key: `${stayKey}#received`,
      amount: received,
      received_on: counted < today ? counted : today,
      mode: OTA.has(channel) ? "ota" : "other",
      note: `From the old income sheet, undated — counted in its month.${split}`,
    });
  }
}

const expenses: Record<string, unknown>[] = [];
const expenseKeys = new Set<string>();
const unknownHeads = new Set<string>();
let totalExpenses = 0;
let futureExpenses = 0;
let zeroExpenses = 0;
for (const expense of seed.expenses) {
  const head = EXPENSE_HEADS.find(
    (name) => name.toLowerCase() === expense.category.trim().toLowerCase(),
  );
  if (!head) unknownHeads.add(expense.category);
  let key = `${expense.source_sheet}!${expense.source_cell}`;
  for (let n = 2; expenseKeys.has(key); n += 1)
    key = `${expense.source_sheet}!${expense.source_cell}#${n}`;
  expenseKeys.add(key);
  const future = expense.status !== "recorded";
  const amount = round2(num(expense.amount));
  // A ₹0 line carries nothing (the sheet's empty monthly placeholders).
  if (amount <= 0) {
    zeroExpenses += 1;
    continue;
  }
  if (future) futureExpenses += amount;
  else totalExpenses += amount;
  const isSalary = head === "Staff Salaries";
  const notes = [
    expense.review?.trim(),
    future ? "Pre-entered for a month not yet come — check before confirming." : null,
  ].filter(Boolean);
  expenses.push({
    source_key: key,
    accounting_month: `${expense.month}-01`,
    head: head ?? expense.category,
    description:
      (isSalary ? staffName(expense.purpose) : expense.purpose?.trim()) || expense.category,
    spent_on: isoDate(expense.date),
    amount,
    payee: expense.supplier?.trim()
      ? isSalary
        ? staffName(expense.supplier)
        : expense.supplier.trim()
      : null,
    payment_details:
      [expense.payment_details, expense.remarks, expense.bill_link && `Bill: ${expense.bill_link}`]
        .map((part) => (part ?? "").trim())
        .filter(Boolean)
        .join(" · ") || null,
    review_note: notes.join(" · ") || null,
  });
}

const staffSet = new Map<string, boolean>();
for (const day of seed.attendance) staffSet.set(staffName(day.staff), true);
for (const expense of seed.expenses) {
  if (expense.category === "Staff Salaries" && expense.purpose)
    staffSet.set(staffName(expense.purpose), true);
}
const lastSeen = new Map<string, string>();
for (const day of seed.attendance) {
  const name = staffName(day.staff);
  if ((lastSeen.get(name) ?? "") < day.date) lastSeen.set(name, day.date);
}
// Still working: attendance reaching into the data's last two months.
const newest = [...lastSeen.values()].sort().at(-1) ?? today;
const [newestYear, newestMonth] = newest.split("-").map(Number);
const cutoff = new Date(Date.UTC(newestYear, newestMonth - 2, 1)).toISOString().slice(0, 10);
const staff = [...staffSet.keys()].map((name, index) => ({
  name,
  sort_order: (index + 1) * 10,
  is_active: (lastSeen.get(name) ?? newest) >= cutoff,
}));

const attendance: Record<string, unknown>[] = [];
const seenDays = new Set<string>();
let duplicateDays = 0;
const oddStatuses = new Set<string>();
for (const day of seed.attendance) {
  const name = staffName(day.staff);
  const raw = day.status.trim().toLowerCase();
  let status = ATTENDANCE[raw];
  let note: string | null = null;
  if (!status) {
    oddStatuses.add(day.status);
    status = "half_day";
    note = day.status.trim();
  }
  const old = [
    day.legacy_am != null ? `AM ${day.legacy_am}` : null,
    day.legacy_pm != null ? `PM ${day.legacy_pm}` : null,
  ].filter(Boolean);
  if (old.length)
    note = [note, `Old sheet overtime: ${old.join(", ")}`].filter(Boolean).join(" · ");
  const dayKey = `${name}|${day.date}`;
  if (seenDays.has(dayKey)) {
    duplicateDays += 1;
    continue;
  }
  seenDays.add(dayKey);
  attendance.push({ source_key: day.id, staff: name, on_date: day.date, status, note });
}

const sajna = seed.staff.find((person) => staffName(person.name) === "Sajna");

const PAGE = { billed: 2138120.11, collected: 1403745.48, expenses: 2391966.5, future: 70000 };
const line = (label: string, ours: number, page: number) =>
  `  ${label.padEnd(22)} ${ours.toFixed(2).padStart(12)}   page ${page.toFixed(2).padStart(12)}   ${Math.abs(ours - page) < 1 ? "OK" : "DIFFERS"}`;

console.log(`Birdwing import — ${ref} — ${commit ? "COMMIT" : "dry run"}`);
console.log(
  `  stays ${stays.length} · charge lines ${charges.length} · invoices ${invoices.length} · receipts ${receipts.length}`,
);
console.log(
  `  expense lines ${expenses.length}${zeroExpenses ? ` (${zeroExpenses} at ₹0 left out)` : ""} · staff ${staff.map((s) => `${s.name}${s.is_active ? "" : " (left)"}`).join(", ")}`,
);
console.log(
  `  attendance days ${attendance.length}${duplicateDays ? ` (${duplicateDays} repeated days skipped)` : ""}`,
);
console.log("Reconciliation against the consolidated page:");
console.log(line("billed value", totalCharged - totalComm, PAGE.billed));
console.log(line("collected", totalReceived, PAGE.collected));
console.log(line("expenses", totalExpenses, PAGE.expenses));
console.log(line("pre-entered, future", futureExpenses, PAGE.future));
console.log("Review flags:");
for (const [kind, count] of [...flagCounts.entries()].sort())
  console.log(`  ${kind.padEnd(30)} ${count}`);
console.log(
  `  stays carrying a flag          ${stays.filter((s) => (s.review_flags as string[]).length > 0).length}`,
);
if (unknownModes.size)
  console.log(`  !! unknown modes of booking: ${[...unknownModes].join(", ")}`);
if (unknownHeads.size)
  throw new Error(`Expense categories with no head: ${[...unknownHeads].join(", ")}`);
if (oddStatuses.size)
  console.log(
    `  attendance statuses kept as half days with a note: ${[...oddStatuses].join(" | ")}`,
  );
console.log(
  `  pay rule: ${sajna ? `Sajna's from the app (₹${sajna.salary}, ${sajna.shift_start}–${sajna.shift_end}, ₹${sajna.ot_rate}/hr, ₹${sajna.room_rate}/room-day)` : "none found"}; Amal, Appu and Bijeeth have none yet.`,
);

const json = (value: unknown) => {
  const text = JSON.stringify(value);
  if (text.includes("$bw$")) throw new Error("The data contains the quoting tag $bw$.");
  return `$bw$${text}$bw$::jsonb`;
};
const legacy = seed.legacy_system.settings;
const company = seed.settings;

const statements = [
  "begin;",

  // Blanks only.
  `insert into companies (name, legal_name, address, gstin, state)
   select 'Maloor Eco Farms', ${literal(company.company)}, ${literal(company.address)}, ${literal(company.gstin)}, 'Kerala'
   where not exists (
     select 1 from companies
     where lower(trim(name)) = 'maloor eco farms' or lower(trim(coalesce(legal_name, ''))) = lower(${literal(company.company)})
   );`,
  `update birdwing_settings set
     company_id = coalesce(company_id, (
       select id from companies
       where lower(trim(name)) = 'maloor eco farms' or lower(trim(coalesce(legal_name, ''))) = lower(${literal(company.company)})
       order by created_at limit 1)),
     place_of_supply = coalesce(place_of_supply, ${literal(company.place_of_supply)}),
     bank_details = coalesce(bank_details, ${literal(legacy.bank)}),
     upi_id = coalesce(upi_id, ${literal(legacy.upi)}),
     invoice_terms = coalesce(invoice_terms, ${literal(legacy.policy)}),
     checkin_time = coalesce(checkin_time, ${literal(legacy.checkin)}),
     checkout_time = coalesce(checkout_time, ${literal(legacy.checkout)}),
     updated_at = now()
   where id;`,

  `insert into birdwing_staff (name, sort_order, is_active)
   select x.name, x.sort_order, x.is_active
   from jsonb_to_recordset(${json(staff)}) as x(name text, sort_order int, is_active boolean)
   where not exists (select 1 from birdwing_staff s where lower(trim(s.name)) = lower(x.name));`,
  sajna
    ? `insert into birdwing_pay_rules (staff_id, effective_from, base_salary, shift_start, shift_end,
                                      ot_rate_per_hr, room_day_rate, guest_day_rate, notes)
       select s.id, date '2025-10-01', ${sajna.salary}, ${literal(sajna.shift_start)}::time, ${literal(sajna.shift_end)}::time,
              ${sajna.ot_rate}, ${sajna.room_rate}, 0, 'From the laptop app — check before the first salary run.'
       from birdwing_staff s
       where lower(s.name) = 'sajna'
         and not exists (select 1 from birdwing_pay_rules r where r.staff_id = s.id);`
    : "",

  `create temp table _bw_stays on commit drop as
   select * from jsonb_to_recordset(${json(stays)}) as x(
     row int, source_key text, guest_name text, use text, channel text, arrival date, departure date,
     adults int, children int, accounting_month date, ota_commission numeric, discount numeric,
     referred_by text, notes text, legacy_room_count numeric, review_flags text[]);`,
  `insert into birdwing_guests (name)
   select distinct on (lower(trim(s.guest_name))) trim(s.guest_name)
   from _bw_stays s
   where not exists (select 1 from birdwing_guests g where lower(trim(g.name)) = lower(trim(s.guest_name)))
   order by lower(trim(s.guest_name));`,

  // Sheet order, so BW-0001 is the sheet's first row.
  `insert into birdwing_stays (ref, guest_id, use, channel, status, arrival, departure, adults, children,
                              accounting_month, ota_commission, discount, referred_by, notes,
                              legacy_room_count, review_flags, source_key)
   select '', (select g.id from birdwing_guests g where lower(trim(g.name)) = lower(trim(s.guest_name))
               order by g.created_at, g.id limit 1),
          s.use, s.channel, 'checked_out', s.arrival, s.departure, s.adults, s.children,
          s.accounting_month, s.ota_commission, s.discount, s.referred_by, s.notes,
          s.legacy_room_count, s.review_flags, s.source_key
   from _bw_stays s
   where not exists (select 1 from birdwing_stays t where t.source_key = s.source_key)
   order by s.row;`,

  // Only onto a stay that has none, so a re-run adds nothing.
  `insert into birdwing_stay_charges (stay_id, rate_card_id, head, kind, qty, rate, gst_pct,
                                     rate_includes_gst, sac, sort_order)
   select st.id, rc.id, c.head, c.kind, c.qty, c.rate, c.gst_pct, true, rc.sac, c.sort_order
   from jsonb_to_recordset(${json(charges)}) as c(stay_key text, head text, kind text, qty numeric,
                                                  rate numeric, gst_pct numeric, sort_order int)
   join birdwing_stays st on st.source_key = c.stay_key
   left join birdwing_rate_card rc on lower(trim(rc.head)) = lower(c.head)
   where not exists (select 1 from birdwing_stay_charges x where x.stay_id = st.id);`,

  // After the charges, because invoices freeze them.
  `insert into birdwing_invoices (stay_id, number, historic, issued_on, bill_to_name, taxable, cgst, sgst,
                                 total, discount, payable, snapshot, source_key)
   select st.id, i.number, true, i.issued_on, i.bill_to_name, i.taxable, i.cgst, i.sgst, i.total,
          i.discount, i.payable,
          i.snapshot || jsonb_build_object(
            'company', (select jsonb_build_object('name', c.name, 'legal_name', c.legal_name,
                                                  'address', c.address, 'gstin', c.gstin,
                                                  'phone', c.phone, 'email', c.email)
                        from companies c where c.id = (select company_id from birdwing_settings)),
            'stay', i.snapshot->'stay' || jsonb_build_object('ref', st.ref)),
          i.source_key
   from jsonb_to_recordset(${json(invoices)}) as i(stay_key text, source_key text, number text,
                                                   issued_on date, bill_to_name text, taxable numeric,
                                                   cgst numeric, sgst numeric, total numeric,
                                                   discount numeric, payable numeric, snapshot jsonb)
   join birdwing_stays st on st.source_key = i.stay_key
   where not exists (select 1 from birdwing_invoices x where x.source_key = i.source_key);`,

  `insert into birdwing_receipts (stay_id, invoice_id, amount, received_on, mode, note, source_key)
   select st.id,
          (select v.id from birdwing_invoices v where v.stay_id = st.id and v.status = 'issued'),
          r.amount, r.received_on, r.mode, r.note, r.source_key
   from jsonb_to_recordset(${json(receipts)}) as r(stay_key text, source_key text, amount numeric,
                                                   received_on date, mode text, note text)
   join birdwing_stays st on st.source_key = r.stay_key
   where not exists (select 1 from birdwing_receipts x where x.source_key = r.source_key);`,

  `insert into birdwing_expenses (accounting_month, head_id, description, spent_on, amount, payee,
                                 payment_details, status, review_note, source_key)
   select e.accounting_month, h.id, e.description, e.spent_on, e.amount, e.payee, e.payment_details,
          'recorded', e.review_note, e.source_key
   from jsonb_to_recordset(${json(expenses)}) as e(source_key text, accounting_month date, head text,
                                                   description text, spent_on date, amount numeric,
                                                   payee text, payment_details text, review_note text)
   join birdwing_expense_heads h on lower(trim(h.name)) = lower(e.head)
   where not exists (select 1 from birdwing_expenses x where x.source_key = e.source_key);`,

  // A day already marked for that person is left alone.
  `insert into birdwing_attendance (staff_id, on_date, status, note, source_key)
   select s.id, a.on_date, a.status, a.note, a.source_key
   from jsonb_to_recordset(${json(attendance)}) as a(source_key text, staff text, on_date date,
                                                     status text, note text)
   join birdwing_staff s on lower(trim(s.name)) = lower(a.staff)
   where not exists (
     select 1 from birdwing_attendance x
     where x.source_key = a.source_key or (x.staff_id = s.id and x.on_date = a.on_date)
   );`,

  `do $check$
   declare v int;
   begin
     select count(*) into v from _bw_stays s
       where not exists (select 1 from birdwing_stays t where t.source_key = s.source_key);
     if v > 0 then raise exception 'IMPORT: % stays did not land', v; end if;
     select count(*) into v from jsonb_to_recordset(${json(expenses.map((e) => ({ k: e.source_key })))}) as e(k text)
       where not exists (select 1 from birdwing_expenses x where x.source_key = e.k);
     if v > 0 then raise exception 'IMPORT: % expense lines did not land', v; end if;
     select count(*) into v from jsonb_to_recordset(${json(receipts.map((r) => ({ k: r.source_key })))}) as r(k text)
       where not exists (select 1 from birdwing_receipts x where x.source_key = r.k);
     if v > 0 then raise exception 'IMPORT: % receipts did not land', v; end if;
     select count(*) into v from jsonb_to_recordset(${json(invoices.map((i) => ({ k: i.source_key })))}) as i(k text)
       where not exists (select 1 from birdwing_invoices x where x.source_key = i.k);
     if v > 0 then raise exception 'IMPORT: % invoices did not land', v; end if;
     if (select last_no from birdwing_counters where scope = 'invoice') < 132 then
       raise exception 'IMPORT: the invoice counter moved below 132';
     end if;
   end $check$;`,

  commit
    ? "commit;"
    : "do $dry$ begin raise exception 'IMPORT DRY RUN COMPLETE — rolled back'; end $dry$;",
].filter(Boolean);

// tsx runs scripts as CommonJS here, so no top-level await.
void (async () => {
  try {
    await sql(ref, statements.join("\n"));
    if (!commit) {
      console.log("UNEXPECTED: the dry run did not abort. Check the database at once.");
      process.exit(1);
    }
    console.log("Committed. Open Birdwing Stays → Review on that database.");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!commit && /IMPORT DRY RUN COMPLETE/.test(message)) {
      console.log(
        "Dry run OK — every insert and check ran against the live schema; nothing was kept.",
      );
      console.log("Re-run with --commit to write.");
      return;
    }
    console.error(message);
    process.exit(1);
  }
})();
