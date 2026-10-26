import { Attribution } from "@/components/ui/attribution";
import { EmptyState } from "@/components/ui/empty-state";
import { PageTitle } from "@/components/ui/page-title";
import { Pagination } from "@/components/ui/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatQuantity } from "@/lib/format";
import { getInventoryFilterOptions } from "@/lib/inventory/queries";
import { listSiteReturns, listVillaHoldings } from "@/lib/inventory/returns-queries";
import { idParam } from "@/lib/list-params";
import { Undo2 } from "lucide-react";
import { InventoryNav } from "../_components/inventory-nav";
import { ReturnForm } from "../_components/return-form";

/** Material back from a villa to a store (0159): the form, then the returns made. */
export default async function ReturnsPage({
  searchParams,
}: {
  searchParams: Promise<{ villa?: string; page?: string }>;
}) {
  const raw = await searchParams;
  const villa = idParam(raw.villa) ?? "";
  const [returns, options, holdings] = await Promise.all([
    listSiteReturns({ page: Number(raw.page) || 1 }),
    getInventoryFilterOptions(),
    villa ? listVillaHoldings(villa) : Promise.resolve([]),
  ]);

  const hrefForPage = (target: number) => {
    const params = new URLSearchParams();
    if (villa) params.set("villa", villa);
    if (target > 1) params.set("page", String(target));
    const query = params.toString();
    return query ? `/inventory/returns?${query}` : "/inventory/returns";
  };

  return (
    <div className="space-y-4">
      <PageTitle title="Returns" description="Material a villa did not use, back into a store." />

      <InventoryNav active="returns" />

      {returns.stores.length === 0 ? (
        <EmptyState
          icon={Undo2}
          title="No stores yet"
          description="Add your stores in Masters before anything can come back to one."
        />
      ) : (
        <ReturnForm
          key={villa}
          villaId={villa}
          villas={options.plots}
          stores={returns.stores}
          holdings={holdings}
        />
      )}

      {returns.returns.length === 0 ? (
        <p className="text-muted text-sm">Nothing has come back from a villa yet.</p>
      ) : (
        <>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Came back</TableHeaderCell>
                <TableHeaderCell>From</TableHeaderCell>
                <TableHeaderCell>To</TableHeaderCell>
                <TableHeaderCell>What</TableHeaderCell>
                <TableHeaderCell>Why</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {returns.returns.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="text-sm whitespace-nowrap">
                    {formatDate(row.returned_on)}
                    <Attribution name={row.returned_by_name} label="Recorded by" />
                  </TableCell>
                  <TableCell className="text-sm">{row.villa_name}</TableCell>
                  <TableCell className="text-sm">{row.store_name}</TableCell>
                  <TableCell className="text-sm">
                    {row.lines.map((line) => (
                      <span key={line.item_name} className="block">
                        {`${line.item_name} · ${formatQuantity(line.quantity)} ${line.uom}`}
                      </span>
                    ))}
                  </TableCell>
                  <TableCell className="text-muted text-sm">{row.reason}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination
            page={returns.page}
            pageCount={returns.pageCount}
            prevHref={returns.page > 1 ? hrefForPage(returns.page - 1) : null}
            nextHref={returns.page < returns.pageCount ? hrefForPage(returns.page + 1) : null}
            total={returns.total}
            pageSize={returns.pageSize}
          />
        </>
      )}
    </div>
  );
}
