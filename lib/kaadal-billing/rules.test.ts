import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Order, Payment } from "./ledger";
import {
  allocToSave,
  autoSplit,
  checkAmount,
  checkDate,
  draftFrom,
  leftOnPlots,
  newPaymentDraft,
  parseAmount,
  plotName,
  scaleSplit,
  togglePlot,
  validateNewOrder,
  validateOrderField,
  validatePayment,
  validateSplit,
  type NewOrderDraft,
  type PaymentDraft,
} from "./rules";

const T = "2026-05-01T00:00:00Z";
const TODAY = "2026-10-29";

const order: Order = {
  id: "o",
  vendorId: "v1",
  plots: ["Plot 11", "Plot 14"],
  gross: 1000,
  split: { "Plot 11": 600, "Plot 14": 400 },
  deduction: 0,
  deductionPlot: null,
  deductionNote: "",
  item: "",
  payNote: "",
  notes: "",
  orderedOn: null,
  createdAt: T,
  updatedAt: T,
  updatedBy: null,
};

const pay = (p: Partial<Payment>): Payment => ({
  id: "p1",
  orderId: "o",
  amount: 200,
  paidOn: "2026-06-01",
  paidBy: "Kaadal",
  kind: "Advance",
  alloc: {},
  reference: "",
  notes: "",
  createdAt: T,
  updatedAt: T,
  updatedBy: null,
  ...p,
});

const vendors = [{ id: "v1", name: "Noku", bank: "", updatedAt: T, updatedBy: null }];

const draft = (d: Partial<PaymentDraft>): PaymentDraft => ({
  ...newPaymentDraft(order, [], TODAY),
  ...d,
});

describe("amounts and dates", () => {
  it("reads rupees as typed", () => {
    assert.equal(parseAmount("₹25,000.50"), 25000.5);
    assert.equal(parseAmount("abc"), 0);
  });

  it("refuses what isn't an amount, in words", () => {
    assert.equal(checkAmount(""), "Enter the amount.");
    assert.equal(checkAmount("-5"), "Amounts can't be negative.");
    assert.equal(checkAmount("12a"), "Use numbers only, like 25000 or 25,000.50.");
    assert.equal(checkAmount("1.234"), "Use at most two digits after the decimal point.");
    assert.equal(checkAmount("0"), "The amount must be more than zero.");
    assert.equal(checkAmount("25,000.50"), "");
    assert.equal(checkAmount("", { required: false }), "");
  });

  it("refuses a future date or one before 2020", () => {
    assert.match(checkDate("2026-10-30", "the date", TODAY), /in the future/);
    assert.match(checkDate("2019-12-31", "the date", TODAY), /before 2020/);
    assert.equal(checkDate("", "the date paid", TODAY), "Enter the date paid.");
    assert.equal(checkDate("2026-10-29", "the date", TODAY), "");
  });
});

describe("a payment", () => {
  it("starts as an advance, then a part payment once something is paid", () => {
    assert.equal(newPaymentDraft(order, [], TODAY).kind, "Advance");
    assert.equal(newPaymentDraft(order, [pay({})], TODAY).kind, "Part payment");
  });

  it("opens a stored payment in the mode it was saved in", () => {
    assert.equal(draftFrom(pay({})).mode, "share");
    assert.deepEqual(draftFrom(pay({ alloc: { "Plot 14": 200 } })), {
      ...draftFrom(pay({})),
      mode: "one",
      plot: "Plot 14",
    });
    assert.equal(
      draftFrom(pay({ alloc: { "Plot 11": 120, "Plot 14": 80 } })).alloc["Plot 14"],
      "80",
    );
  });

  it("refuses a split that doesn't add up to the paisa, or sits on one plot", () => {
    const short = validatePayment(
      order,
      [],
      draft({ amount: "100", mode: "split", alloc: { "Plot 11": "60", "Plot 14": "39.99" } }),
      TODAY,
    );
    assert.match(short.errors.alloc, /₹0.01 less than the payment of ₹100.00/);
    const one = validatePayment(
      order,
      [],
      draft({ amount: "100", mode: "split", alloc: { "Plot 11": "100" } }),
      TODAY,
    );
    assert.match(one.errors.alloc, /at least two plots/);
    const ok = validatePayment(
      order,
      [],
      draft({ amount: "100", mode: "split", alloc: { "Plot 11": "60", "Plot 14": "40" } }),
      TODAY,
    );
    assert.deepEqual(ok.errors, {});
  });

  it("warns, without refusing, past the balance, past a plot's share, and on a twin", () => {
    const pays = [pay({ amount: 200, paidOn: "2026-10-01" })];
    const { errors, warnings } = validatePayment(
      order,
      pays,
      draft({ amount: "200", paidOn: "2026-10-01", mode: "one", plot: "Plot 14" }),
      TODAY,
    );
    assert.deepEqual(errors, {});
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /already recorded/);
    const big = validatePayment(
      order,
      pays,
      draft({ amount: "900", mode: "one", plot: "Plot 14" }),
      TODAY,
    );
    assert.equal(big.warnings.length, 2);
    assert.match(big.warnings[0], /₹100.00 more than what's left/);
    assert.match(big.warnings[1], /Plot 14 only has ₹320.00 left/);
  });

  it("gives an edited payment shared by value back its share on every plot", () => {
    const small = { ...order, gross: 300, split: { "Plot 11": 100, "Plot 14": 200 } };
    const pays = [pay({ id: "p1", amount: 150 })];
    assert.deepEqual(leftOnPlots(small, pays, null), { "Plot 11": 50, "Plot 14": 100 });
    assert.deepEqual(leftOnPlots(small, pays, "p1"), { "Plot 11": 100, "Plot 14": 200 });
    const { warnings } = validatePayment(
      small,
      pays,
      { ...draftFrom(pays[0]), amount: "100", mode: "one", plot: "Plot 11" },
      TODAY,
    );
    assert.deepEqual(warnings, []);
  });

  it("gives an edited payment back its own amount before warning", () => {
    const pays = [pay({ id: "p1", amount: 1000 })];
    const { warnings } = validatePayment(
      order,
      pays,
      { ...draftFrom(pays[0]), amount: "1000" },
      TODAY,
    );
    assert.deepEqual(warnings, []);
  });

  it("stores plots only for a several-plot order", () => {
    assert.deepEqual(allocToSave(order, draft({ amount: "50", mode: "one", plot: "Plot 11" })), {
      "Plot 11": 50,
    });
    assert.deepEqual(allocToSave(order, draft({ amount: "50" })), {});
    assert.deepEqual(
      allocToSave(
        { ...order, plots: ["Plot 11"] },
        draft({ amount: "50", mode: "one", plot: "Plot 11" }),
      ),
      {},
    );
  });

  it("splits by what is left on each plot, the last plot taking the paisa", () => {
    const pays = [pay({ amount: 400, alloc: { "Plot 11": 400 } })];
    assert.deepEqual(autoSplit(order, pays, draft({ amount: "100" })), {
      "Plot 11": "33.33",
      "Plot 14": "66.67",
    });
  });
});

describe("a new order", () => {
  const base: NewOrderDraft = {
    vendorId: "v1",
    newVendor: "",
    bank: "",
    plots: ["Plot 11"],
    item: "",
    gross: "1000",
    split: {},
    orderedOn: TODAY,
    payNote: "",
    notes: "",
    advance: "",
    advanceOn: TODAY,
    advanceBy: "Kaadal",
  };

  it("takes a plain order", () => {
    assert.deepEqual(validateNewOrder(base, vendors, TODAY), {});
  });

  it("refuses a vendor already on the list under the new-vendor name", () => {
    const e = validateNewOrder({ ...base, vendorId: "__new", newVendor: " noku " }, vendors, TODAY);
    assert.equal(e.newVendor, "Noku is already a vendor. Pick it from the list instead.");
  });

  it("needs every plot value or none, adding up to the order", () => {
    const two = { ...base, plots: ["Plot 11", "Plot 14"] };
    assert.deepEqual(validateNewOrder(two, vendors, TODAY), {});
    assert.match(
      validateNewOrder({ ...two, split: { "Plot 11": "500" } }, vendors, TODAY).split,
      /every plot/,
    );
    assert.match(
      validateNewOrder({ ...two, split: { "Plot 11": "500", "Plot 14": "400" } }, vendors, TODAY)
        .split,
      /Difference: ₹100.00/,
    );
  });

  it("refuses an advance above the order value", () => {
    assert.match(
      validateNewOrder({ ...base, advance: "1001" }, vendors, TODAY).advance,
      /can't be more than/,
    );
  });
});

describe("editing an order", () => {
  it("refuses a value or deduction that leaves less than is already paid", () => {
    const pays = [pay({ amount: 800 })];
    assert.match(
      validateOrderField(order, pays, "gross", "700", vendors, TODAY),
      /less than the ₹800.00 already paid/,
    );
    assert.match(
      validateOrderField(order, pays, "deduction", "300", vendors, TODAY),
      /less than the ₹800.00 already paid/,
    );
    assert.match(
      validateOrderField(order, pays, "deduction", "1000", vendors, TODAY),
      /must be less than the order value/,
    );
    assert.equal(validateOrderField(order, pays, "deduction", "", vendors, TODAY), "");
  });

  it("scales plot values with the order value", () => {
    assert.deepEqual(scaleSplit(order, 1500), { "Plot 11": 900, "Plot 14": 600 });
  });

  it("checks typed plot values against the order value", () => {
    assert.deepEqual(validateSplit(order, { "Plot 11": "700", "Plot 14": "300" }), {});
    assert.match(validateSplit(order, { "Plot 11": "700", "Plot 14": "200" }).split, /Difference/);
  });

  it("won't remove a plot that payments are marked for, or the last one", () => {
    const marked = togglePlot(order, [pay({ alloc: { "Plot 14": 200 } })], "Plot 14");
    assert.ok("error" in marked && /marked for Plot 14/.test(marked.error));
    const last = togglePlot({ ...order, plots: ["Plot 11"], split: {} }, [], "Plot 11");
    assert.deepEqual(last, { error: "An order needs at least one plot." });
  });

  it("clears plot values when a plot is added", () => {
    const added = togglePlot(order, [], "Plot 24");
    assert.ok(!("error" in added));
    assert.deepEqual(added.plots, ["Plot 11", "Plot 14", "Plot 24"]);
    assert.deepEqual(added.split, {});
    assert.equal(added.splitCleared, true);
  });

  it("names a typed plot the ledger's way", () => {
    assert.deepEqual(plotName("45", { orders: [] }), { name: "Plot 45" });
    assert.deepEqual(plotName("plot 45-46", { orders: [] }), { name: "Plot 45-46" });
    assert.deepEqual(plotName("site", { orders: [] }), { name: "Site" });
    assert.equal(plotName("  ", { orders: [] }), null);
    assert.ok("error" in (plotName("Plot <1>", { orders: [] }) ?? {}));
  });
});
