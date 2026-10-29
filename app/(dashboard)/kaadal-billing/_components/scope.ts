import { searchParam } from "@/lib/list-params";
import { allPlots, type Ledger } from "@/lib/kaadal-billing/ledger";

/** The plot filter and search from the address: a plot no order names reads as All. */
export function scopeOf(ledger: Ledger, raw: Record<string, string | undefined>) {
  const plots = allPlots(ledger).filter((p) => ledger.orders.some((o) => o.plots.includes(p)));
  const plot = raw.plot && plots.includes(raw.plot) ? raw.plot : "All";
  const q = searchParam(raw.q) ?? "";
  return { plots, plot, q };
}
