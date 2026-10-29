import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  allocLabel,
  allPlots,
  amountIn,
  figures,
  paymentsByOrder,
  plotSort,
  plotState,
  plotTotals,
  runChecks,
  shares,
  totals,
  view,
  type Ledger,
  type Order,
  type Payment,
} from "./ledger";

const T = "2026-05-01T00:00:00Z";

function order(id: string, o: Partial<Order>): Order {
  return {
    id,
    vendorId: "v1",
    plots: ["Plot 11"],
    gross: 1000,
    split: {},
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
    ...o,
  };
}

function pay(id: string, orderId: string, p: Partial<Payment>): Payment {
  return {
    id,
    orderId,
    amount: 100,
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
  };
}

const vendors = [
  { id: "v1", name: "Noku", bank: "A/C 1", updatedAt: T, updatedBy: null },
  { id: "v2", name: "Sunil", bank: "", updatedAt: T, updatedBy: null },
];

describe("figures", () => {
  it("nets the deduction and splits who paid", () => {
    const o = order("o1", { gross: 1000, deduction: 100 });
    const f = figures(o, [
      pay("p1", "o1", { amount: 300 }),
      pay("p2", "o1", { amount: 200, paidBy: "Client" }),
    ]);
    assert.equal(f.net, 900);
    assert.equal(f.paid, 500);
    assert.equal(f.byKaadal, 300);
    assert.equal(f.byClient, 200);
    assert.equal(f.balance, 400);
    assert.equal(f.state, "part");
  });

  it("counts within half a rupee as paid, and more than that over as overpaid", () => {
    assert.equal(
      figures(order("o", { gross: 100 }), [pay("p", "o", { amount: 99.6 })]).state,
      "paid",
    );
    assert.equal(figures(order("o", { gross: 100 }), [pay("p", "o", { amount: 101 })]).over, true);
  });

  it("names the latest dated payment, skipping the undated", () => {
    const pays = paymentsByOrder([
      pay("b", "o", { paidOn: "2026-07-01" }),
      pay("a", "o", { paidOn: null }),
      pay("c", "o", { paidOn: "2026-06-01" }),
    ]).get("o")!;
    assert.deepEqual(
      pays.map((p) => p.id),
      ["a", "c", "b"],
    );
    assert.equal(figures(order("o", {}), pays).last?.id, "b");
  });
});

describe("shares", () => {
  const o = order("o", {
    plots: ["Plot 11", "Plot 14"],
    gross: 1000,
    split: { "Plot 11": 600, "Plot 14": 400 },
    deduction: 100,
    deductionPlot: "Plot 14",
  });

  it("splits the value by the quote and puts the deduction on its plot", () => {
    const s = shares(o, []);
    assert.equal(s["Plot 11"].net, 600);
    assert.equal(s["Plot 14"].net, 300);
  });

  it("shares an unmarked payment by net value and keeps a marked one on its plot", () => {
    const s = shares(o, [
      pay("p1", "o", { amount: 90 }),
      pay("p2", "o", { amount: 50, alloc: { "Plot 14": 50 } }),
    ]);
    assert.equal(Math.round(s["Plot 11"].paid * 100) / 100, 60);
    assert.equal(Math.round(s["Plot 14"].paid * 100) / 100, 80);
  });

  it("splits evenly with no quote, and shares a deduction with no plot by value", () => {
    const s = shares(
      order("o", { plots: ["Plot 11", "Plot 14"], gross: 1000, deduction: 100 }),
      [],
    );
    assert.equal(s["Plot 11"].net, 450);
    assert.equal(s["Plot 14"].net, 450);
  });
});

describe("under a plot filter", () => {
  const ledger: Ledger = {
    vendors,
    orders: [
      order("o1", {
        plots: ["Plot 11", "Plot 14"],
        gross: 1000,
        split: { "Plot 11": 600, "Plot 14": 400 },
      }),
      order("o2", { plots: ["Plot 24"], gross: 500, vendorId: "v2" }),
    ],
    payments: [
      pay("p1", "o1", { amount: 400, alloc: { "Plot 14": 400 } }),
      pay("p2", "o2", { amount: 100 }),
    ],
  };

  it("adds up whole orders for All and shares for a plot", () => {
    assert.deepEqual(totals(ledger, "All"), {
      net: 1500,
      paid: 500,
      byKaadal: 500,
      byClient: 0,
      balance: 1000,
      orders: 2,
      open: 2,
    });
    const p14 = totals(ledger, "Plot 14");
    assert.equal(p14.orders, 1);
    assert.equal(p14.net, 400);
    assert.equal(p14.balance, 0);
    assert.equal(p14.open, 0);
  });

  it("marks a share of a several-plot order, and leaves out an order not on the plot", () => {
    const pays = paymentsByOrder(ledger.payments);
    assert.equal(view(ledger.orders[0], pays.get("o1")!, "Plot 11")?.shared, true);
    assert.equal(view(ledger.orders[1], pays.get("o2")!, "Plot 11"), null);
  });

  it("shows a payment's part for the plot", () => {
    const [o1] = ledger.orders;
    const p = ledger.payments[0];
    assert.equal(amountIn(p, o1, [p], "Plot 14"), 400);
    assert.equal(amountIn(p, o1, [p], "Plot 11"), 0);
    assert.equal(amountIn(p, o1, [p], "All"), 400);
  });

  it("totals each plot and says how it stands", () => {
    const plots = plotTotals(ledger);
    assert.deepEqual(
      plots.map((p) => p.plot),
      ["Plot 11", "Plot 14", "Plot 24"],
    );
    assert.equal(plotState(plots[1]).label, "Fully paid");
    assert.equal(plotState(plots[2]).label, "Balance pending");
    assert.equal(plotState(plots[0]).label, "Not paid");
  });
});

describe("plots", () => {
  it("sorts by number, labels without one last", () => {
    assert.deepEqual(["Site", "Plot 45-46", "Plot 14", "Plot 2"].sort(plotSort), [
      "Plot 2",
      "Plot 14",
      "Plot 45-46",
      "Site",
    ]);
  });

  it("knows the five starting plots and any an order names", () => {
    assert.deepEqual(allPlots({ orders: [order("o", { plots: ["Plot 7"] })] }), [
      "Plot 7",
      "Plot 11",
      "Plot 14",
      "Plot 24",
      "Plot 45-46",
      "Site",
    ]);
  });

  it("labels a payment's plots", () => {
    assert.equal(allocLabel({ alloc: { "Plot 14": 50 } }), "for Plot 14");
    assert.equal(allocLabel({ alloc: { "Plot 14": 50, "Plot 11": 20 } }), "split 11 ₹20 · 14 ₹50");
    assert.equal(allocLabel({ alloc: {} }), "");
  });
});

describe("runChecks", () => {
  it("passes a clean ledger", () => {
    const ledger: Ledger = { vendors, orders: [order("o", {})], payments: [pay("p", "o", {})] };
    assert.deepEqual(runChecks(ledger, "2026-10-29"), []);
  });

  it("finds what doesn't add up, errors first", () => {
    const ledger: Ledger = {
      vendors,
      orders: [
        order("o1", {
          plots: ["Plot 11", "Plot 14"],
          gross: 1000,
          split: { "Plot 11": 600, "Plot 14": 300 },
        }),
        order("o2", { vendorId: "v2", gross: 100 }),
      ],
      payments: [
        pay("p1", "o1", { amount: 100, alloc: { "Plot 11": 50, "Plot 14": 40 } }),
        pay("p2", "o2", { amount: 150, paidOn: null }),
        pay("p3", "o1", { amount: 20, paidOn: "2026-11-02" }),
        pay("p4", "o1", { amount: 20, paidOn: "2026-11-02" }),
      ],
    };
    const checks = runChecks(ledger, "2026-10-29");
    assert.deepEqual(
      checks.map((c) => c.level),
      checks.map((c) => c.level).sort((a, b) => (a === "bad" ? 0 : 1) - (b === "bad" ? 0 : 1)),
    );
    const text = checks.map((c) => c.text).join("\n");
    assert.match(text, /a ₹100 payment is split as ₹90 across plots/);
    assert.match(text, /paid ₹50 more than the order value/);
    assert.match(text, /has no date/);
    assert.match(text, /in the future/);
    assert.match(text, /2 payments of ₹20/);
    assert.match(text, /plot values add up to ₹900, but the order value is ₹1,000/);
  });

  it("asks for bank details only where money is due by transfer", () => {
    const ledger: Ledger = {
      vendors,
      orders: [
        order("o", { vendorId: "v2", gross: 100 }),
        order("q", { vendorId: "v2", payNote: "Through QR" }),
      ],
      payments: [],
    };
    const checks = runChecks(ledger, "2026-10-29");
    assert.equal(checks.length, 1);
    assert.match(checks[0].text, /^Sunil has ₹100 due but no bank details/);
  });
});
