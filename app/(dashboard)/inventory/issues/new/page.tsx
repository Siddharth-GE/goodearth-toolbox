import { EmptyState } from "@/components/ui/empty-state";
import { PageTitle } from "@/components/ui/page-title";
import { Select } from "@/components/ui/select";
import { formatQuantity } from "@/lib/format";
import { getIssueFormOptions } from "@/lib/inventory/issues-queries";
import { getSiteRequest } from "@/lib/inventory/requests-queries";
import { listWorkCategories, listWorkItems } from "@/lib/masters/works";
import { listStoreHoldings } from "@/lib/inventory/stock-queries";
import { PackageMinus } from "lucide-react";
import Link from "next/link";
import { IssueForm } from "../../_components/issue-form";

/**
 * Two steps, on purpose: pick the store first, then the page can show
 * exactly what that store holds — there is no way to type in an item it
 * doesn't have, which is the mistake the negative-stock guard would
 * otherwise catch after the fact.
 */
export default async function NewIssuePage({
  searchParams,
}: {
  searchParams: Promise<{ store?: string; request?: string }>;
}) {
  const { store, request: requestId } = await searchParams;
  const [options, holdings, workItems, workCategories, request] = await Promise.all([
    getIssueFormOptions(),
    store ? listStoreHoldings(store) : Promise.resolve([]),
    listWorkItems(),
    listWorkCategories(),
    // Step H: arriving from the requests queue prefills the form.
    requestId ? getSiteRequest(requestId) : Promise.resolve(null),
  ]);
  const chosen = options.stores.find((s) => s.id === store) ?? null;
  const openRequest = request?.status === "requested" ? request : null;
  const requestParam = openRequest ? `&request=${openRequest.id}` : "";
  const categoryNameById = new Map(workCategories.map((c) => [c.id, c.name]));
  const works = workItems
    .filter((work) => work.is_active)
    .map((work) => ({
      id: work.id,
      code: work.code,
      name: work.name,
      category: categoryNameById.get(work.category_id) ?? "Other",
    }));

  return (
    <div className="space-y-4">
      <PageTitle
        title="New issue"
        description="Record material leaving a store."
        backHref="/inventory/issues"
        backLabel="Issues"
      />

      {openRequest && (
        <p className="border-info/40 bg-info/10 text-foreground rounded-xl border px-4 py-2.5 text-sm">
          Fulfilling a site request: {formatQuantity(openRequest.quantity)} {openRequest.itemUom} of{" "}
          {openRequest.itemName} for {openRequest.plotName} — {openRequest.workLabel}, asked by{" "}
          {openRequest.requesterName}.
        </p>
      )}

      {options.stores.length === 0 ? (
        <EmptyState
          icon={PackageMinus}
          title="No stores yet"
          description="Add your stores in Masters before issuing anything."
        />
      ) : !chosen ? (
        <section className="border-border bg-surface max-w-md space-y-2 rounded-2xl border p-4">
          <p className="text-foreground text-sm font-medium">Which store is it leaving?</p>
          <ul className="space-y-2 pt-1">
            {options.stores.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/inventory/issues/new?store=${s.id}${requestParam}`}
                  className="border-border bg-background hover:border-accent text-foreground block rounded-xl border px-3.5 py-2.5 text-sm font-medium transition-colors"
                >
                  {s.name}
                </Link>
              </li>
            ))}
          </ul>
          {/* A select is redundant beside the list above, but keeps the
              screen usable when a site has many stores. */}
          <noscript>
            <Select aria-label="Store" defaultValue="">
              <option value="">Pick a store…</option>
              {options.stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </noscript>
        </section>
      ) : holdings.length === 0 ? (
        <EmptyState
          icon={PackageMinus}
          title={`${chosen.name} holds nothing right now`}
          description="Receive a delivery into it, or enter an opening balance as an adjustment, then come back."
        />
      ) : (
        <IssueForm
          store={chosen}
          holdings={holdings}
          options={options}
          works={works}
          request={openRequest}
        />
      )}
    </div>
  );
}
