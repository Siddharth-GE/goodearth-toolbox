/** Saarang collections: recognises the Zoho exports by their columns and works out the meeting's figures. Pure; no database, no files. */
import { formatMoney } from "@/lib/format";

export const PROJECTS = ["plot", "villa"] as const;
export type Project = (typeof PROJECTS)[number];

export const KINDS = ["payments", "outstanding", "sold", "milestones"] as const;
export type Kind = (typeof KINDS)[number];

export type Slot = `${Project}_${Kind}`;

export const SLOT_LABEL: Record<Slot, string> = {
  plot_payments: "Developments Collection",
  villa_payments: "Futures Collection",
  plot_outstanding: "Plot Outstanding",
  villa_outstanding: "Villa Outstanding",
  plot_sold: "Plot Sold Units",
  villa_sold: "Villa Sold Units",
  plot_milestones: "Plot Milestones",
  villa_milestones: "Villa Payment Milestones",
};

export const SLOT_SOURCE: Record<Kind, string> = {
  payments: "Zoho Books · Payments Received",
  outstanding: "Zoho Books · Invoice Details",
  sold: "Zoho CRM · Sold Units report",
  milestones: "Zoho CRM · Milestones report",
};

/** A cell as the readers hand it over: text, or missing. */
export type Cell = string | number | null | undefined;
export type Grid = readonly (readonly Cell[] | undefined)[];

/** One stored row per kind; these are the arrays kept in the uploads table. */
export type PaymentRow = [
  receipt: string,
  date: string,
  customer: string,
  invoice: string,
  depositTo: string,
  amount: number,
  unused: number,
];
export type MilestoneRow = [
  unit: string,
  applicant: string,
  stage: string,
  due: string,
  amount: number,
  gst: number,
  installment: number,
  progress: string,
  owner: string,
];
export type SoldRow = [
  unit: string,
  applicant: string,
  price: number,
  priceInclGst: number,
  owner: string,
  stage: string,
];
export type OutstandingRow = [
  unit: string,
  status: string,
  invoiceDate: string,
  dueDate: string,
  invoice: string,
  customer: string,
  total: number,
  balance: number,
];

export type RowsOf = {
  payments: PaymentRow[];
  milestones: MilestoneRow[];
  sold: SoldRow[];
  outstanding: OutstandingRow[];
};

export type ParsedReport = {
  [K in Kind]: {
    slot: `${Project}_${K}`;
    kind: K;
    project: Project;
    rows: RowsOf[K];
    meta: {
      file: string;
      asOf: string | null;
      periodFrom: string | null;
      periodTo: string | null;
      count: number;
    };
  };
}[Kind];

export type ParseResult = ParsedReport | { error: string };

export const OLD_EXCEL_REFUSAL = "Export this report from Zoho as XLSX or CSV.";

/** The refusal for an old-format .xls, or null. The bytes win over the name when both are known. */
export function oldExcelRefusal(fileName: string, bytes?: Uint8Array): string | null {
  if (bytes && bytes.length >= 4) {
    if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) {
      return OLD_EXCEL_REFUSAL;
    }
    if (bytes[0] === 0x50 && bytes[1] === 0x4b) return null;
  }
  return /\.xls$/i.test(fileName.trim()) ? OLD_EXCEL_REFUSAL : null;
}

// ---------- cell helpers ----------

export function str(v: Cell): string {
  return v == null ? "" : String(v).replace(/\s+/g, " ").trim();
}

/** A rupee amount from a number or text such as "Rs.1,23,456.00" or "(500)"; blank or unreadable is 0. */
export function money(v: Cell): number {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v)
    .replace(/^\s*(rs\.?|inr)/i, "")
    .replace(/[₹,\s]/g, "")
    .replace(/^\((.*)\)$/, "-$1");
  const n = parseFloat(s);
  return Number.isNaN(n) ? 0 : n;
}

const pad = (n: number) => (n < 10 ? "0" : "") + n;
const MON: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

/** YYYY-MM-DD from an Excel serial (as text or number) or any date-like text Zoho produces, else "". */
export function toISO(v: Cell): string {
  if (v == null || v === "") return "";
  const s = String(v).trim();
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^(\d{5})(?:\.\d+)?$/)) && +m[1] > 20000 && +m[1] < 80000) {
    const d = new Date((+m[1] - 25569) * 86400e3);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  if ((m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/)))
    return `${m[3]}-${pad(+m[2])}-${pad(+m[1])}`;
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) return `${m[1]}-${m[2]}-${m[3]}`;
  if ((m = s.match(/^([A-Za-z]{3})[a-z]*\s+(\d{1,2}),?\s+(\d{4})/))) {
    const mon = MON[m[1].toLowerCase()];
    return mon === undefined ? "" : `${m[3]}-${pad(mon + 1)}-${pad(+m[2])}`;
  }
  if ((m = s.match(/^(\d{1,2})[\s-]([A-Za-z]{3})[a-z]*[\s,-]+(\d{4})/))) {
    const mon = MON[m[2].toLowerCase()];
    return mon === undefined ? "" : `${m[3]}-${pad(mon + 1)}-${pad(+m[1])}`;
  }
  return "";
}

function findHeader(grid: Grid, keys: string[]): number {
  for (let i = 0; i < Math.min(grid.length, 40); i++) {
    const row = Array.from(grid[i] ?? [], str);
    if (keys.every((k) => row.includes(k))) return i;
  }
  return -1;
}

const headerOf = (grid: Grid, h: number) => Array.from(grid[h] ?? [], str);

function col(header: string[], names: string[]): number {
  for (const n of names) {
    const j = header.indexOf(n);
    if (j >= 0) return j;
  }
  return -1;
}

export function projectOfUnit(u: Cell): Project | "" {
  const s = str(u).toUpperCase();
  if (s.startsWith("SAARANG-PLOT")) return "plot";
  if (s.startsWith("SAARANG-VILLA")) return "villa";
  return "";
}

function majority(list: (Project | "")[]): Project | "" {
  let plot = 0;
  let villa = 0;
  for (const p of list) {
    if (p === "plot") plot++;
    else if (p === "villa") villa++;
  }
  if (plot === 0 && villa === 0) return "";
  return villa > plot ? "villa" : "plot";
}

function metaFrom(grid: Grid, upto: number) {
  const lines: string[] = [];
  for (let i = 0; i < upto; i++) for (const v of grid[i] ?? []) if (str(v)) lines.push(str(v));
  const text = lines.join("\n");
  let m: RegExpMatchArray | null;
  let asOf = "";
  if ((m = text.match(/Generated by .*? on ([A-Za-z]{3}[a-z]* \d{1,2}, \d{4})/)))
    asOf = toISO(m[1]);
  if (!asOf && (m = text.match(/To\s+(\d{1,2}\/\d{1,2}\/\d{4})/))) asOf = toISO(m[1]);
  let periodFrom = "";
  let periodTo = "";
  if ((m = text.match(/From\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+To\s+(\d{1,2}\/\d{1,2}\/\d{4})/))) {
    periodFrom = toISO(m[1]);
    periodTo = toISO(m[2]);
  }
  return { asOf: asOf || null, periodFrom: periodFrom || null, periodTo: periodTo || null };
}

function finish<K extends Kind>(
  kind: K,
  project: Project | "",
  rows: RowsOf[K],
  meta: ReturnType<typeof metaFrom>,
  fileName: string,
): ParseResult {
  if (!project) {
    return {
      error: `Couldn’t tell whether this ${kind} file is Plot or Villa. Check it has SAARANG-PLOT or SAARANG-VILLA units in it.`,
    };
  }
  return {
    slot: `${project}_${kind}`,
    kind,
    project,
    rows,
    meta: { file: fileName, ...meta, count: rows.length },
  } as ParsedReport;
}

/** Recognises one Zoho export (the first sheet's rows) by its columns and reads it into stored rows. */
export function parse(grid: Grid, fileName = ""): ParseResult {
  let h: number;
  if ((h = findHeader(grid, ["Payment Number", "Date"])) >= 0) {
    const header = headerOf(grid, h);
    const c = {
      no: col(header, ["Payment Number"]),
      date: col(header, ["Date"]),
      cust: col(header, ["Customer Name"]),
      inv: col(header, ["Invoice#", "Invoice Number"]),
      dep: col(header, ["Deposit To"]),
      amt: col(header, ["Amount (BCY)", "Amount"]),
      unused: col(header, ["Unused Amount (BCY)", "Unused Amount"]),
    };
    const rows: PaymentRow[] = [];
    const votes: (Project | "")[] = [];
    for (let i = h + 1; i < grid.length; i++) {
      const r = grid[i] ?? [];
      const no = str(r[c.no]);
      const d = toISO(r[c.date]);
      if (!no || no.toUpperCase() === "TOTAL" || !d) continue;
      const inv = str(r[c.inv]);
      const dep = str(r[c.dep]);
      rows.push([no, d, str(r[c.cust]), inv, dep, money(r[c.amt]), money(r[c.unused])]);
      votes.push(
        /-FU-|FU-/i.test(`${no} ${inv}`) || /eco futures/i.test(dep)
          ? "villa"
          : /SAARANG/i.test(`${no} ${inv}`) || /SAARANG COLLECTION/i.test(dep)
            ? "plot"
            : "",
      );
    }
    return finish("payments", majority(votes), rows, metaFrom(grid, h), fileName);
  }
  if ((h = findHeader(grid, ["Milestone Stage"])) >= 0) {
    const header = headerOf(grid, h);
    const m = {
      unit: col(header, ["Unit"]),
      app: col(header, ["Applicant First Name"]),
      stage: col(header, ["Milestone Stage"]),
      due: col(header, ["Payment Due Date"]),
      amt: col(header, ["Milestone Amount"]),
      gst: col(header, ["Milestone GST (M)"]),
      inst: col(header, ["Installment (M)"]),
      prog: col(header, ["Milestone Progress"]),
      owner: col(header, ["Deal Owner"]),
    };
    const rows: MilestoneRow[] = [];
    const votes: (Project | "")[] = [];
    for (let k = h + 1; k < grid.length; k++) {
      const q = grid[k] ?? [];
      const u = str(q[m.unit]);
      if (!projectOfUnit(u)) continue;
      votes.push(projectOfUnit(u));
      rows.push([
        u,
        str(q[m.app]),
        str(q[m.stage]),
        toISO(q[m.due]),
        money(q[m.amt]),
        money(q[m.gst]),
        money(q[m.inst]),
        str(q[m.prog]),
        str(q[m.owner]),
      ]);
    }
    return finish("milestones", majority(votes), rows, metaFrom(grid, h), fileName);
  }
  if ((h = findHeader(grid, ["Unit Name"])) >= 0) {
    const header = headerOf(grid, h);
    const s = {
      unit: col(header, ["Unit Name"]),
      app: col(header, ["Applicant First Name"]),
      price: col(header, ["Unit/Plot Price"]),
      incl: col(header, [
        "Cost of the Villa (Inc 18% GST)",
        "Cost of Home (Inc GST) - A",
        "Cost of Home (Inc GST)",
      ]),
      owner: col(header, ["Deal Owner"]),
      stage: col(header, ["Stage"]),
    };
    const rows: SoldRow[] = [];
    const votes: (Project | "")[] = [];
    for (let j = h + 1; j < grid.length; j++) {
      const t = grid[j] ?? [];
      const un = str(t[s.unit]);
      if (!projectOfUnit(un)) continue;
      votes.push(projectOfUnit(un));
      rows.push([
        un,
        str(t[s.app]),
        money(t[s.price]),
        money(t[s.incl]),
        str(t[s.owner]),
        str(t[s.stage]),
      ]);
    }
    return finish("sold", majority(votes), rows, metaFrom(grid, h), fileName);
  }
  if ((h = findHeader(grid, ["Invoice#", "Balance"])) >= 0) {
    const header = headerOf(grid, h);
    const o = {
      st: col(header, ["Status"]),
      idate: col(header, ["Invoice Date"]),
      due: col(header, ["Due Date"]),
      no: col(header, ["Invoice#"]),
      cust: col(header, ["Customer Name"]),
      total: col(header, ["Total"]),
      bal: col(header, ["Balance"]),
    };
    const rows: OutstandingRow[] = [];
    const votes: (Project | "")[] = [];
    let cur = "";
    for (let x = h + 1; x < grid.length; x++) {
      const w = grid[x] ?? [];
      const st = str(w[o.st]);
      if (projectOfUnit(st)) {
        cur = st.toUpperCase();
        votes.push(projectOfUnit(st));
        continue;
      }
      if (!str(w[o.no])) continue;
      rows.push([
        cur,
        st,
        toISO(w[o.idate]),
        toISO(w[o.due]),
        str(w[o.no]),
        str(w[o.cust]),
        money(w[o.total]),
        money(w[o.bal]),
      ]);
    }
    return finish("outstanding", majority(votes), rows, metaFrom(grid, h), fileName);
  }
  return {
    error:
      "This file doesn’t look like one of the eight Zoho reports. Expected a Payments Received, Invoice Details, Sold Units or Milestones export.",
  };
}

// ---------- rules ----------

/** Shaped like the settings row and the three rule tables, so mapping is a rename-free copy. */
export type Rules = {
  test_suffix: string;
  dedupe: boolean;
  gst_plot: number;
  gst_villa: number;
  sold_field_plot: "price" | "incl";
  sold_field_villa: "price" | "incl";
  excluded: { receipt_no: string; reason: string | null }[];
  /** A blank stage means the unit's first milestone. */
  corrections: { unit: string; stage: string | null; delta: number; note: string | null }[];
  extra_units: {
    unit: string;
    applicant: string | null;
    sold_value: number;
    completed: number;
    pending: number;
    note: string | null;
  }[];
};

export const DEFAULT_RULES: Rules = {
  test_suffix: "-100",
  dedupe: true,
  gst_plot: 0,
  gst_villa: 18,
  sold_field_plot: "price",
  sold_field_villa: "incl",
  excluded: [],
  corrections: [],
  extra_units: [],
};

export function rulesOf(partial?: Partial<Rules> | null): Rules {
  return { ...DEFAULT_RULES, ...(partial ?? {}) };
}

export function isTest(unit: Cell, r: Pick<Rules, "test_suffix">): boolean {
  return !!r.test_suffix && str(unit).toUpperCase().endsWith(r.test_suffix.toUpperCase());
}

// ---------- compute ----------

type SlotKind<S extends Slot> = S extends `${Project}_${infer K extends Kind}` ? K : never;
export type Datasets = Partial<{ [S in Slot]: { rows: RowsOf[SlotKind<S>] } }>;

export type Options = {
  periodFrom?: string | null;
  periodTo?: string | null;
  /** The report date, YYYY-MM-DD; month-to-date runs from the 1st of its month to it. */
  reportDate?: string | null;
};

export type DetailCell = string | number;
export type DetailRow = { cells: DetailCell[]; why: string };
export type Detail = { cols: string[]; rows: DetailCell[][]; left: DetailRow[] };

export type DetailKey = "P" | "S" | "E" | "O" | "F" | "L" | "H" | "MTD" | "M";
export type ValueKey = DetailKey | "Munits";
/** null where the figure cannot be known: its report is missing (or, for MTD, there is no report date). */
export type Values = Record<ValueKey, number | null>;

export type ProjectResult = {
  values: Values;
  detail: Partial<Record<DetailKey, Detail>>;
  missing: Slot[];
};

type Kept = {
  unit: string;
  applicant: string;
  stage: string;
  due: string;
  amount: number;
  progress: string;
  owner: string;
  adj: number;
  value: number;
};

const sumOf = (list: number[]) => list.reduce((a, n) => a + n, 0);
const isDone = (progress: string) => /^completed$/i.test(progress);
const signed = (n: number) => `${n < 0 ? "−" : "+"}${formatMoney(Math.abs(n))}`;
const payCells = (x: PaymentRow): DetailCell[] => [x[0], x[1], x[2], x[4], x[5], x[6]];

export function compute(
  datasets: Datasets,
  rulesIn: Rules,
  options: Options = {},
): Record<Project, ProjectResult> {
  const r = rulesOf(rulesIn);
  const excl = new Map<string, string>();
  for (const e of r.excluded) {
    if (e.receipt_no)
      excl.set(str(e.receipt_no).toUpperCase(), e.reason || "On the excluded receipts list");
  }
  const from = options.periodFrom || "";
  const to = options.periodTo || "";
  const reportDate = options.reportDate || "";

  const one = (p: Project): ProjectResult => {
    const values: Values = {
      P: null,
      S: null,
      E: null,
      O: null,
      F: null,
      L: null,
      H: null,
      MTD: null,
      M: null,
      Munits: null,
    };
    const detail: ProjectResult["detail"] = {};
    const missing: Slot[] = [];
    const g = 1 + (p === "plot" ? r.gst_plot : r.gst_villa) / 100;
    const soldField = p === "plot" ? r.sold_field_plot : r.sold_field_villa;
    const extras = r.extra_units.filter((x) => projectOfUnit(x.unit) === p);

    const get = <K extends Kind>(kind: K): RowsOf[K] | null => {
      const d = datasets[`${p}_${kind}`] as { rows: RowsOf[K] } | undefined;
      if (!d) {
        missing.push(`${p}_${kind}`);
        return null;
      }
      return d.rows;
    };

    // Sold units added on the Rules page count only while Zoho does not list them.
    const withExtrasMilestones = (rows: MilestoneRow[]): MilestoneRow[] => {
      const have = new Set(rows.map((x) => str(x[0]).toUpperCase()));
      const add: MilestoneRow[] = [];
      for (const x of extras) {
        const u = str(x.unit).toUpperCase();
        if (have.has(u)) continue;
        const who = x.applicant || "";
        if (+x.completed)
          add.push([
            u,
            who,
            "Completed milestones (added by hand)",
            "",
            +x.completed,
            0,
            0,
            "Completed",
            "",
          ]);
        if (+x.pending)
          add.push([
            u,
            who,
            "Pending milestones (added by hand)",
            "",
            +x.pending,
            0,
            0,
            "Not Started",
            "",
          ]);
      }
      return add.length ? rows.concat(add) : rows;
    };
    const withExtrasSold = (rows: SoldRow[]): SoldRow[] => {
      const have = new Set(rows.map((x) => str(x[0]).toUpperCase()));
      const add: SoldRow[] = [];
      for (const x of extras) {
        const u = str(x.unit).toUpperCase();
        if (have.has(u)) continue;
        add.push([
          u,
          x.applicant || "",
          +x.sold_value || 0,
          +x.sold_value || 0,
          "(manual)",
          "Added on Rules tab",
        ]);
      }
      return add.length ? rows.concat(add) : rows;
    };

    // milestones
    const msRaw = get("milestones");
    let kept: Kept[] | null = null;
    const leftOf = (l: { row: MilestoneRow; why: string }): DetailRow => ({
      cells: [l.row[0], l.row[1], l.row[2], l.row[3], l.row[7], l.row[4] * g],
      why: l.why,
    });
    if (msRaw) {
      const ms = withExtrasMilestones(msRaw);
      const keptRows: Kept[] = [];
      const left: { row: MilestoneRow; why: string }[] = [];
      const groups = new Map<string, number[]>();
      ms.forEach((m, i) => {
        if (isTest(m[0], r)) {
          left.push({ row: m, why: "Test unit" });
          return;
        }
        const key = `${m[0]}|${m[2].toLowerCase()}`;
        groups.set(key, [...(groups.get(key) ?? []), i]);
      });
      const drop = new Set<number>();
      if (r.dedupe) {
        for (const idx of groups.values()) {
          if (idx.length < 2) continue;
          const done = idx.filter((i) => isDone(ms[i][7]));
          const losers = done.length ? idx.filter((i) => !done.includes(i)) : idx.slice(1);
          losers.forEach((i) => drop.add(i));
        }
      }
      const corr = r.corrections.map((c) => ({
        unit: str(c.unit).toUpperCase(),
        stage: str(c.stage).toLowerCase(),
        delta: +c.delta || 0,
        used: false,
      }));
      ms.forEach((m, i) => {
        if (isTest(m[0], r)) return;
        if (drop.has(i)) {
          left.push({ row: m, why: "Duplicate schedule (stale, not started)" });
          return;
        }
        let adj = 0;
        for (const c of corr) {
          if (
            !c.used &&
            c.unit === m[0].toUpperCase() &&
            (!c.stage || m[2].toLowerCase().startsWith(c.stage))
          ) {
            adj += c.delta;
            c.used = true;
          }
        }
        keptRows.push({
          unit: m[0],
          applicant: m[1],
          stage: m[2],
          due: m[3],
          amount: m[4],
          progress: m[7],
          owner: m[8],
          adj,
          value: (m[4] + adj) * g,
        });
      });
      const cols = ["Unit", "Applicant", "Milestone", "Due", "Progress", "Amount"];
      const mrow = (x: Kept): DetailCell[] => [
        x.unit,
        x.applicant,
        x.stage,
        x.due,
        x.progress,
        x.value,
        x.adj ? `Adjusted ${signed(x.adj)}` : "",
      ];
      const comp = keptRows.filter((x) => isDone(x.progress));
      values.P = sumOf(comp.map((x) => x.value));
      values.S = sumOf(keptRows.map((x) => x.value));
      detail.P = {
        cols,
        rows: comp.map(mrow),
        left: left
          .map(leftOf)
          .concat(
            keptRows
              .filter((x) => !isDone(x.progress))
              .map((x) => ({ cells: mrow(x), why: "Not completed" })),
          ),
      };
      detail.S = { cols, rows: keptRows.map(mrow), left: left.map(leftOf) };
      kept = keptRows;
    }

    // sold units
    const soldRaw = get("sold");
    if (soldRaw) {
      const sold = withExtrasSold(soldRaw);
      const units: DetailCell[][] = [];
      const seen = new Set<string>();
      const leftS: DetailRow[] = [];
      const f = soldField === "incl" ? 3 : 2;
      for (const s of sold) {
        if (isTest(s[0], r)) {
          leftS.push({
            cells: [s[0], s[1], s[5], "Sold Units report", s[f] as number],
            why: "Test unit",
          });
          continue;
        }
        if (seen.has(s[0])) continue;
        seen.add(s[0]);
        units.push([
          s[0],
          s[1],
          s[5],
          s[4] === "(manual)" ? "Added on Rules tab" : "Sold Units report",
          s[f] as number,
        ]);
      }
      for (const m of kept ?? []) {
        if (seen.has(m.unit)) continue;
        seen.add(m.unit);
        const all = (kept ?? []).filter((x) => x.unit === m.unit);
        units.push([
          m.unit,
          m.applicant,
          "Not in Sold Units report",
          "Valued from milestones",
          sumOf(all.map((x) => x.value)),
        ]);
      }
      values.E = sumOf(units.map((u) => u[4] as number));
      values.O = units.length;
      const d: Detail = {
        cols: ["Unit", "Applicant", "Stage", "Source", "Value"],
        rows: units,
        left: leftS,
      };
      detail.E = d;
      detail.O = d;
    }

    // payments
    const pay = get("payments");
    if (pay) {
      const inc: PaymentRow[] = [];
      const leftP: DetailRow[] = [];
      for (const x of pay) {
        const reason = excl.get(x[0].toUpperCase());
        if (reason) leftP.push({ cells: payCells(x), why: reason });
        else inc.push(x);
      }
      values.F = sumOf(inc.map((x) => x[5]));
      values.L = sumOf(inc.map((x) => x[6]));
      const pc = ["Receipt", "Date", "Customer", "Deposit to", "Amount", "Unused"];
      detail.F = { cols: pc, rows: inc.map(payCells), left: leftP };
      detail.L = { cols: pc, rows: inc.filter((x) => x[6]).map(payCells), left: leftP };
      const inP = inc.filter((x) => (!from || x[1] >= from) && (!to || x[1] <= to));
      values.H = sumOf(inP.map((x) => x[5]));
      detail.H = { cols: pc, rows: inP.map(payCells), left: [] };
      if (reportDate) {
        const monthStart = `${reportDate.slice(0, 8)}01`;
        const inM = inc.filter((x) => x[1] >= monthStart && x[1] <= reportDate);
        values.MTD = sumOf(inM.map((x) => x[5]));
        detail.MTD = { cols: pc, rows: inM.map(payCells), left: [] };
      }
    }

    // outstanding
    const os = get("outstanding");
    if (os) {
      const rows: DetailCell[][] = [];
      const left: DetailRow[] = [];
      const withBalance = new Set<string>();
      for (const x of os) {
        const cells: DetailCell[] = [x[0], x[4], x[5], x[3], x[1], x[7]];
        if (isTest(x[0], r)) left.push({ cells, why: "Test unit" });
        else {
          rows.push(cells);
          if (x[7]) withBalance.add(x[0]);
        }
      }
      values.M = sumOf(rows.map((c) => c[5] as number));
      values.Munits = withBalance.size;
      detail.M = { cols: ["Unit", "Invoice", "Customer", "Due", "Status", "Balance"], rows, left };
    }

    return { values, detail, missing };
  };

  return { plot: one("plot"), villa: one("villa") };
}
