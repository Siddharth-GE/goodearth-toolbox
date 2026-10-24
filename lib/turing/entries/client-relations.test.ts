import assert from "node:assert/strict";
import { test } from "node:test";

import { checkProposal } from "../catalogue-fields";

const PLOT = "11111111-1111-4111-8111-111111111111";
const ACTION = "22222222-2222-4222-8222-222222222222";

test("a new action starts on the Construction side, a receipt as a bank transfer, as on screen", () => {
  const step = checkProposal({
    action: "crm_action_new",
    title: "x",
    rows: [{ label: "a", plot_id: PLOT, action: "Send the payment schedule" }],
  });
  assert.ok(step.ok && step.value.rows[0].values.side === "construction");
  const money = checkProposal({
    action: "crm_receipt",
    title: "x",
    rows: [{ label: "a", plot_id: PLOT, amount: 500000 }],
  });
  assert.ok(money.ok && money.value.rows[0].values.mode === "bank");
  // Left out, the day stays out: the runner takes today in India.
  assert.equal("received_on" in (money.ok ? money.value.rows[0].values : {}), false);
});

test("a status, side, deed or registration can be kept on a change but never emptied", () => {
  for (const [action, field, record] of [
    ["crm_action_change", "status", { action_id: ACTION }],
    ["crm_action_change", "side", { action_id: ACTION }],
    ["crm_plot_change", "sale_deed_status", { plot_id: PLOT }],
    ["crm_plot_change", "registration_stage", { plot_id: PLOT }],
  ] as const) {
    const emptied = checkProposal({
      action,
      title: "x",
      rows: [{ label: "a", ...record, [field]: "" }],
    });
    assert.ok(!emptied.ok && /not emptied/.test(emptied.error), `${action}.${field}`);
  }
});
