import assert from "node:assert/strict";
import { test } from "node:test";

import {
  compute,
  DEFAULT_RULES,
  money,
  oldExcelRefusal,
  parse,
  rulesOf,
  toISO,
  type Datasets,
  type Grid,
  type MilestoneRow,
  type OutstandingRow,
  type ParsedReport,
  type PaymentRow,
  type SoldRow,
} from "./core";

function ok(grid: Grid, name = "f.xlsx"): ParsedReport {
  const r = parse(grid, name);
  assert.ok(!("error" in r), "error" in r ? r.error : "");
  return r as ParsedReport;
}

const paymentsGrid: Grid = [
  ["Payments Received"],
  ["From 01/10/2026 To 31/10/2026"],
  [
    "Date",
    "Payment Number",
    "Customer Name",
    "Invoice#",
    "Deposit To",
    "Amount (BCY)",
    "Unused Amount (BCY)",
  ],
  ["46300.0", "PR-1", "Asha", "SAARANG-INV-1", "SAARANG COLLECTION", "Rs.1,23,456.00", "0"],
  ["01/10/2026", "TOTAL", "", "", "", "1", ""],
  ["", "PR-2", "Ben", "", "", "5", ""],
];

test("a payments export is recognised by its columns, with serial dates and text amounts", () => {
  const r = ok(paymentsGrid);
  assert.equal(r.slot, "plot_payments");
  assert.equal(r.kind, "payments");
  assert.deepEqual(r.rows, [
    ["PR-1", "2026-10-05", "Asha", "SAARANG-INV-1", "SAARANG COLLECTION", 123456, 0],
  ]);
  assert.equal(r.meta.periodFrom, "2026-10-01");
  assert.equal(r.meta.periodTo, "2026-10-31");
});

test("a villa payments export is told apart by its receipt numbers", () => {
  const r = ok([
    ["Payment Number", "Date", "Amount"],
    ["PR-FU-1", "2026-10-03", "10"],
  ]);
  assert.equal(r.slot, "villa_payments");
});

test("a milestones export keeps only Saarang units and tells plot from villa", () => {
  const r = ok([
    [
      "Unit",
      "Applicant First Name",
      "Milestone Stage",
      "Payment Due Date",
      "Milestone Amount",
      "Milestone Progress",
    ],
    ["SAARANG-VILLA-01", "Asha", "Booking", "46300", "1,000", "Completed"],
    ["OTHER-1", "Zed", "Booking", "46300", "9", "Completed"],
  ]);
  assert.equal(r.slot, "villa_milestones");
  assert.equal(r.rows.length, 1);
  assert.equal((r.rows[0] as MilestoneRow)[3], "2026-10-05");
});

test("a sold units export reads both price columns", () => {
  const r = ok([
    ["Unit Name", "Applicant First Name", "Unit/Plot Price", "Cost of Home (Inc GST)", "Stage"],
    ["SAARANG-PLOT-01", "Asha", "100", "118", "Sold"],
  ]);
  assert.equal(r.slot, "plot_sold");
  assert.deepEqual((r.rows[0] as SoldRow).slice(2, 4), [100, 118]);
});

test("an outstanding export carries the unit heading down to its invoices", () => {
  const r = ok([
    ["Status", "Invoice Date", "Due Date", "Invoice#", "Customer Name", "Total", "Balance"],
    ["SAARANG-PLOT-01", "", "", "", "", "", ""],
    ["Overdue", "01/10/2026", "15/10/2026", "INV-1", "Asha", "500", "200"],
  ]);
  assert.equal(r.slot, "plot_outstanding");
  assert.deepEqual(r.rows[0], [
    "SAARANG-PLOT-01",
    "Overdue",
    "2026-10-01",
    "2026-10-15",
    "INV-1",
    "Asha",
    500,
    200,
  ]);
});

test("an unrecognised file is refused with a sentence, and a file with no Saarang units says so", () => {
  const a = parse([["Foo", "Bar"]], "x.csv");
  assert.ok("error" in a && /doesn’t look like one of the eight Zoho reports/.test(a.error));
  const b = parse([["Unit Name"], ["OTHER-1"]], "x.csv");
  assert.ok("error" in b && /Plot or Villa/.test(b.error));
});

test("an old .xls is refused by its bytes or its name", () => {
  const msg = "Export this report from Zoho as XLSX or CSV.";
  assert.equal(oldExcelRefusal("a.xls"), msg);
  assert.equal(oldExcelRefusal("a.bin", new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0])), msg);
  assert.equal(oldExcelRefusal("a.xlsx"), null);
  assert.equal(oldExcelRefusal("a.xls", new Uint8Array([0x50, 0x4b, 3, 4])), null);
});

test("dates and money take Excel serials, numeric text and Indian formats", () => {
  assert.equal(toISO("46300"), "2026-10-05");
  assert.equal(toISO("46300.0"), "2026-10-05");
  assert.equal(toISO("Oct 5, 2026"), "2026-10-05");
  assert.equal(toISO("5 Oct 2026"), "2026-10-05");
  assert.equal(toISO("5"), "");
  assert.equal(money("Rs.1,23,456.00"), 123456);
  assert.equal(money("₹ 1,000"), 1000);
  assert.equal(money("(500)"), -500);
  assert.equal(money("-250.5"), -250.5);
  assert.equal(money(""), 0);
  assert.equal(money("abc"), 0);
});

const ms = (unit: string, stage: string, amount: number, progress: string): MilestoneRow => [
  unit,
  "A",
  stage,
  "2026-10-01",
  amount,
  0,
  0,
  progress,
  "",
];

test("test units are left out, and the stale duplicate schedule is dropped", () => {
  const data: Datasets = {
    plot_milestones: {
      rows: [
        ms("SAARANG-PLOT-01", "Booking", 100, "Completed"),
        ms("SAARANG-PLOT-01", "Booking", 100, "Not Started"),
        ms("SAARANG-PLOT-02", "Booking", 50, "Not Started"),
        ms("SAARANG-PLOT-02", "Booking", 50, "Not Started"),
        ms("SAARANG-PLOT-100", "Booking", 999, "Completed"),
      ],
    },
  };
  const p = compute(data, DEFAULT_RULES).plot;
  assert.equal(p.values.S, 150);
  assert.equal(p.values.P, 100);
  const reasons = p.detail.S!.left.map((l) => l.why).sort();
  assert.deepEqual(reasons, [
    "Duplicate schedule (stale, not started)",
    "Duplicate schedule (stale, not started)",
    "Test unit",
  ]);
  assert.equal(compute(data, { ...DEFAULT_RULES, dedupe: false }).plot.values.S, 300);
});

test("a correction applies once, to the first matching stage", () => {
  const data: Datasets = {
    plot_milestones: {
      rows: [
        ms("SAARANG-PLOT-07", "On Sale Deed", 500, "Completed"),
        ms("SAARANG-PLOT-07", "On Sale Deed 2", 500, "Not Started"),
      ],
    },
  };
  const rules = {
    ...DEFAULT_RULES,
    corrections: [{ unit: "SAARANG-PLOT-07", stage: "on sale deed", delta: -100, note: null }],
  };
  const p = compute(data, rules).plot;
  assert.equal(p.values.S, 400 + 500);
  assert.equal(p.detail.S!.rows[0][6], "Adjusted −₹100");
});

test("GST scales milestone amounts for the project that has it", () => {
  const data: Datasets = {
    villa_milestones: { rows: [ms("SAARANG-VILLA-01", "Booking", 100, "Completed")] },
  };
  assert.equal(compute(data, DEFAULT_RULES).villa.values.P, 118);
  assert.equal(compute(data, { ...DEFAULT_RULES, gst_villa: 0 }).villa.values.P, 100);
});

test("an extra unit counts only while Zoho lacks it", () => {
  const sold: SoldRow[] = [["SAARANG-PLOT-01", "A", 100, 118, "", "Sold"]];
  const extra = {
    unit: "SAARANG-PLOT-29",
    applicant: "N",
    sold_value: 70,
    completed: 30,
    pending: 40,
    note: null,
  };
  const data: Datasets = {
    plot_sold: { rows: sold },
    plot_milestones: { rows: [ms("SAARANG-PLOT-01", "Booking", 100, "Completed")] },
  };
  const r = { ...DEFAULT_RULES, extra_units: [extra] };
  const p = compute(data, r).plot;
  assert.equal(p.values.E, 170);
  assert.equal(p.values.O, 2);
  assert.equal(p.values.P, 130);
  assert.equal(p.values.S, 170);
  const zohoHasIt: Datasets = {
    plot_sold: { rows: [...sold, ["SAARANG-PLOT-29", "N", 80, 80, "", "Sold"]] },
    plot_milestones: {
      rows: [
        ms("SAARANG-PLOT-01", "Booking", 100, "Completed"),
        ms("SAARANG-PLOT-29", "Booking", 80, "Completed"),
      ],
    },
  };
  const q = compute(zohoHasIt, r).plot;
  assert.equal(q.values.E, 180);
  assert.equal(q.values.S, 180);
});

test("the sold field picks price or the figure with GST, and units missing from the sold report are valued from milestones", () => {
  const data: Datasets = {
    villa_sold: { rows: [["SAARANG-VILLA-01", "A", 100, 118, "", "Sold"]] },
    villa_milestones: { rows: [ms("SAARANG-VILLA-09", "Booking", 10, "Completed")] },
  };
  const a = compute(data, DEFAULT_RULES).villa;
  assert.ok(Math.abs((a.values.E ?? 0) - 129.8) < 1e-9);
  const b = compute(data, { ...DEFAULT_RULES, sold_field_villa: "price" }).villa;
  assert.ok(Math.abs((b.values.E ?? 0) - 111.8) < 1e-9);
  assert.equal(a.detail.E!.rows[1][3], "Valued from milestones");
});

const pay = (no: string, date: string, amount: number, unused = 0): PaymentRow => [
  no,
  date,
  "C",
  "",
  "D",
  amount,
  unused,
];

test("excluded receipts, the collection period and month-to-date", () => {
  const data: Datasets = {
    plot_payments: {
      rows: [
        pay("PR-1", "2026-09-30", 100),
        pay("PR-2", "2026-10-01", 200, 50),
        pay("PR-3", "2026-10-10", 400),
        pay("PR-4", "2026-10-20", 800),
      ],
    },
  };
  const rules = { ...DEFAULT_RULES, excluded: [{ receipt_no: "PR-4", reason: "Refunded" }] };
  const p = compute(data, rules, {
    periodFrom: "2026-10-01",
    periodTo: "2026-10-15",
    reportDate: "2026-10-10",
  }).plot;
  assert.equal(p.values.F, 700);
  assert.equal(p.values.L, 50);
  assert.equal(p.values.H, 600);
  assert.equal(p.values.MTD, 600);
  assert.deepEqual(
    p.detail.F!.left.map((l) => l.why),
    ["Refunded"],
  );
  assert.equal(p.detail.L!.rows.length, 1);
  const noDate = compute(data, rules).plot;
  assert.equal(noDate.values.MTD, null);
  assert.equal(noDate.values.H, 700);
});

test("outstanding totals leave out test units and count units that still owe", () => {
  const rows: OutstandingRow[] = [
    ["SAARANG-PLOT-01", "Overdue", "", "", "I1", "A", 100, 60],
    ["SAARANG-PLOT-01", "Overdue", "", "", "I2", "A", 100, 40],
    ["SAARANG-PLOT-02", "Paid", "", "", "I3", "B", 100, 0],
    ["SAARANG-PLOT-100", "Overdue", "", "", "I4", "T", 100, 90],
  ];
  const p = compute({ plot_outstanding: { rows } }, DEFAULT_RULES).plot;
  assert.equal(p.values.M, 100);
  assert.equal(p.values.Munits, 1);
  assert.equal(p.detail.M!.left.length, 1);
});

test("a figure whose report is missing is null, never 0, and is listed as missing", () => {
  const p = compute(
    { plot_payments: { rows: [pay("PR-1", "2026-10-01", 5)] } },
    DEFAULT_RULES,
  ).plot;
  assert.equal(p.values.F, 5);
  assert.equal(p.values.M, null);
  assert.equal(p.values.Munits, null);
  assert.equal(p.values.P, null);
  assert.deepEqual(p.missing, ["plot_milestones", "plot_sold", "plot_outstanding"]);
  assert.equal(compute({}, DEFAULT_RULES).villa.values.F, null);
});

test("rulesOf fills what is missing from the defaults", () => {
  assert.equal(rulesOf({ gst_plot: 5 }).gst_villa, 18);
  assert.equal(rulesOf(null).test_suffix, "-100");
});
