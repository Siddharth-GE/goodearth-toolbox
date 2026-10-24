import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { checkProposal, entryFor, formKeys, formOf } from "../catalogue-fields";
import {
  CHANNELS,
  ID_TYPES,
  KINDS,
  MODES,
  NEXT,
  USES,
  moveRefused,
  roomCodes,
  roomNights,
} from "./birdwing";

const STAY = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

const source = (file: string) => readFileSync(file, "utf8");
const listIn = (text: string, name: string) => {
  const found = text.match(new RegExp(`export const ${name} = \\[([^\\]]*)\\]`));
  assert.ok(found, name);
  return [...found[1].matchAll(/"(\w+)"/g)].map((match) => match[1]);
};
/** The names a save reads from its form, getAll included. */
const readBy = (file: string, name: string) => {
  const text = source(file);
  const at = text.search(new RegExp(`function ${name}\\(`));
  assert.ok(at >= 0, name);
  const body = text.slice(at, text.indexOf("\n}\n", at));
  return [...new Set([...body.matchAll(/formData(?:, |\.getAll\()"(\w+)"/g)].map((m) => m[1]))];
};

test("Turing's copies of Birdwing's lists and status moves are Birdwing's own", () => {
  const shared = source("lib/birdwing/shared.ts");
  assert.deepEqual(USES, listIn(shared, "STAY_USES"));
  assert.deepEqual(CHANNELS, listIn(shared, "CHANNELS"));
  assert.deepEqual(MODES, listIn(shared, "RECEIPT_MODES"));
  assert.deepEqual(KINDS, listIn(shared, "CHARGE_KINDS"));
  assert.deepEqual(ID_TYPES, listIn(shared, "ID_TYPES"));
  const workflow = source("lib/birdwing/workflow.ts");
  for (const [from, to] of Object.entries(NEXT)) {
    const line = workflow.match(new RegExp(`\\n  ${from}: \\[([^\\]]*)\\]`));
    assert.ok(line, from);
    assert.deepEqual(
      [...line[1].matchAll(/"(\w+)"/g)].map((match) => match[1]),
      to,
      from,
    );
  }
});

test("the forms Turing builds by hand are the ones Birdwing reads", () => {
  // Rooms are named by code on a row and sent as the screens' room_id checkboxes.
  const stay = formKeys(entryFor("bw_stay_new")!).filter((key) => key !== "rooms");
  assert.deepEqual(
    readBy("lib/birdwing/actions.ts", "createStay").sort(),
    [...stay, "room_id"].sort(),
  );
  assert.deepEqual(readBy("lib/birdwing/actions.ts", "createBlock").sort(), [
    "from",
    "note",
    "room_id",
    "to",
  ]);
  assert.deepEqual(readBy("lib/birdwing/actions.ts", "addStayRoom").sort(), [
    "extra_beds",
    "from",
    "room_id",
    "to",
  ]);
});

test("a new stay starts as the form does: a confirmed, direct booking for two paying guests", () => {
  const proposal = checkProposal({
    action: "bw_stay_new",
    title: "x",
    rows: [
      {
        label: "Menon",
        arrival: "2026-10-30",
        departure: "2026-11-01",
        rooms: "r1, R3",
        guest_name: "Anil Menon",
      },
    ],
  });
  assert.ok(proposal.ok);
  const values = proposal.value.rows[0].values;
  assert.equal(values.use, "guest");
  assert.equal(values.channel, "direct");
  assert.equal(values.status, "confirmed");
  assert.equal(values.adults, "2");
  assert.equal(values.children, "0");
  assert.deepEqual(roomCodes(values.rooms), ["R1", "R3"]);
});

test("a stay's guest is either one already there or a new name, never both", () => {
  const base = { arrival: "2026-10-30", departure: "2026-11-01" };
  const proposal = checkProposal({
    action: "bw_stay_new",
    title: "x",
    rows: [
      { label: "a", ...base, guest_id: STAY, guest_name: "Anil" },
      { label: "b", ...base },
      { label: "c", ...base, guest_name: "Anil", cost_centre_id: OTHER },
      { label: "d", ...base, guest_name: "Anil", guest_email: "anil at home" },
    ],
  });
  assert.ok(!proposal.ok);
  assert.match(proposal.error, /Row 1: A returning guest is given by guest_id alone/);
  assert.match(proposal.error, /Row 2: Give the returning guest's guest_id/);
  assert.match(proposal.error, /Row 3: A paying guest's stay has no cost centre/);
  assert.match(proposal.error, /Row 4: "anil at home" is not an email address/);
  const team = checkProposal({
    action: "bw_stay_new",
    title: "x",
    rows: [{ label: "e", ...base, guest_id: STAY, use: "team", cost_centre_id: OTHER }],
  });
  assert.ok(team.ok);
});

test("a charge comes from the rate card or names its own head and rate", () => {
  const proposal = checkProposal({
    action: "bw_charge_add",
    title: "x",
    rows: [
      { label: "a", stay_id: STAY, rate_card_id: OTHER, gst_pct: 18 },
      { label: "b", stay_id: STAY, head: "Bonfire" },
      { label: "c", stay_id: STAY },
    ],
  });
  assert.ok(!proposal.ok);
  assert.match(proposal.error, /Row 1: A rate card charge takes its name/);
  assert.match(proposal.error, /Row 2: Give the rate/);
  assert.match(proposal.error, /Row 3: Pick a head/);
  const card = checkProposal({
    action: "bw_charge_add",
    title: "x",
    rows: [{ label: "d", stay_id: STAY, rate_card_id: OTHER }],
  });
  assert.ok(card.ok);
  // Left out, the rate and quantity stay out: the runner fills them from the card and the rooms.
  assert.equal("rate" in card.value.rows[0].values, false);
  assert.equal(card.value.rows[0].values.rate_includes_gst, false);
});

test("a box Birdwing's forms read is sent ticked as its checkbox sends it", () => {
  const checkin = formOf(entryFor("bw_checkin")!, { id_verified: true });
  assert.equal(checkin.get("id_verified"), "on");
  assert.equal(formOf(entryFor("bw_checkin")!, { id_verified: false }).get("id_verified"), null);
  const head = checkProposal({
    action: "bw_rate_new",
    title: "x",
    rows: [{ label: "Dinner", head: "Dinner", default_rate: 450 }],
  });
  assert.ok(head.ok);
  const form = formOf(entryFor("bw_rate_new")!, head.value.rows[0].values);
  assert.equal(form.get("is_active"), "on");
  assert.equal(form.get("kind"), "food");
  assert.equal(form.get("gst_pct"), "5");
  assert.equal(form.get("sort_order"), "200");
});

test("a stay's change sends the month as the form does, and keeps what is left out", () => {
  const bad = checkProposal({
    action: "bw_stay_change",
    title: "x",
    rows: [{ label: "a", stay_id: STAY, accounting_month: "10-2026" }],
  });
  assert.ok(!bad.ok && /written 2026-10/.test(bad.error));
  const entry = entryFor("bw_stay_change")!;
  const form = formOf(
    entry,
    { discount: "500" },
    { arrival: "2026-10-30", accounting_month: "2026-10" },
  );
  assert.equal(form.get("discount"), "500");
  assert.equal(form.get("arrival"), "2026-10-30");
  assert.equal(form.get("accounting_month"), "2026-10");
  assert.equal(form.get("stay_id"), null);
});

test("a move says why a stay can't go there, and a reason goes only with a cancellation", () => {
  assert.equal(moveRefused("confirmed", "checked_in"), null);
  assert.equal(moveRefused("checked_in", "confirmed"), null);
  assert.equal(moveRefused("blocked", "cancelled"), null);
  assert.match(moveRefused("confirmed", "confirmed") ?? "", /already confirmed/);
  assert.match(moveRefused("checked_out", "cancelled") ?? "", /checked out can't be moved/);
  assert.match(moveRefused("blocked", "checked_in") ?? "", /only removed/);
  assert.match(moveRefused("cancelled", "confirmed") ?? "", /for good/);
  const proposal = checkProposal({
    action: "bw_stay_move",
    title: "x",
    rows: [
      { label: "a", stay_id: STAY, to: "cancelled" },
      { label: "b", stay_id: STAY, to: "checked_in", reason: "Arrived early" },
    ],
  });
  assert.ok(!proposal.ok);
  assert.match(proposal.error, /Row 1: Say why it is cancelled/);
  assert.match(proposal.error, /Row 2: A reason goes only with a cancellation/);
});

test("check-in keeps only an ID's last four characters", () => {
  const proposal = checkProposal({
    action: "bw_checkin",
    title: "x",
    rows: [{ label: "a", stay_id: STAY, id_type: "aadhaar", id_last4: "1234 5678 9012" }],
  });
  assert.ok(!proposal.ok);
});

test("room-nights count each room's nights, leaving day not a night", () => {
  assert.equal(
    roomNights([
      { from_date: "2026-10-30", to_date: "2026-11-01" },
      { from_date: "2026-10-31", to_date: "2026-11-01" },
    ]),
    3,
  );
  assert.equal(roomNights([]), 0);
});
