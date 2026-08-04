import { ItemThumb } from "@/components/masters/item-thumb";
import { Badge } from "@/components/ui/badge";
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
import { formatQuantity } from "@/lib/format";
import { isLocationKind, listStockByLocation, type LocationKind } from "@/lib/inventory/queries";
import { Boxes } from "lucide-react";
import Link from "next/link";
import { InventoryNav } from "../_components/inventory-nav";
import { LocationFilter } from "../_components/location-filter";

const KIND_LABEL: Record<LocationKind, string> = {
  store: "Store",
  plot: "Plot",
};

const KIND_VARIANT: Record<LocationKind, "success" | "info"> = {
  store: "success",
  plot: "info",
};

/**
 * Where the material is. A store row is a live balance; a plot row is
 * a running total of everything that has landed there (a delivery to a
 * unit lands at its plot — same place since 0029), because nothing
 * leaves a site through this system — it gets built into the house.
 * Both are computed from movements, never stored.
 */
export default async function StockPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; at?: string }>;
}) {
  const { page, at } = await searchParams;

  // The filter travels as "kind:id" in one param so a single select can
  // offer stores and plots together.
  const [rawKind, rawId] = (at ?? "").split(":");
  const kind = rawKind && isLocationKind(rawKind) ? rawKind : undefined;
  const locationId = kind && rawId ? rawId : undefined;

  const {
    rows,
    total,
    page: currentPage,
    pageCount,
    pageSize,
    locations,
  } = await listStockByLocation({ page: Number(page) || 1, kind, locationId });

  const selected = locations.find((l) => l.kind === kind && l.id === locationId);

  const hrefForPage = (target: number) => {
    const params = new URLSearchParams();
    if (selected) params.set("at", `${selected.kind}:${selected.id}`);
    if (target > 1) params.set("page", String(target));
    const query = params.toString();
    return query ? `/inventory/stock?${query}` : "/inventory/stock";
  };

  return (
    <div className="space-y-4">
      <PageTitle
        title="Stock"
        description="Where material is sitting — in a store, or delivered out to a plot."
      />

      <InventoryNav active="stock" />

      <LocationFilter
        locations={locations}
        selected={selected ? `${selected.kind}:${selected.id}` : ""}
        basePath="/inventory/stock"
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title={selected ? `Nothing recorded at ${selected.name}` : "No stock recorded yet"}
          description="Material appears once a delivery is received, something is issued out to a plot, or an opening balance is entered as an adjustment."
        />
      ) : (
        <>
          <p className="text-muted text-xs">
            A store shows what is in it right now. A plot shows everything delivered there — to the
            plot or its unit — site material is used where it lands, so it is never issued back out.
          </p>

          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell className="w-14"></TableHeaderCell>
                <TableHeaderCell>Item</TableHeaderCell>
                <TableHeaderCell>Location</TableHeaderCell>
                <TableHeaderCell className="w-36">Quantity</TableHeaderCell>
                <TableHeaderCell></TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={`${row.location_kind}:${row.location_id}:${row.item_id}`}>
                  <TableCell>
                    <ItemThumb
                      code={row.item_code}
                      name={row.item_name}
                      thumbUrl={row.item_thumb_url}
                      sizes="48px"
                      className="w-10"
                    />
                  </TableCell>
                  <TableCell>
                    <span className="text-foreground font-medium">{row.item_name}</span>
                    <div className="text-muted text-xs">
                      {row.item_code ?? "—"}
                      {row.item_brand && <span className="ml-2">{row.item_brand}</span>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-foreground">{row.location_name}</span>
                    <Badge variant={KIND_VARIANT[row.location_kind]} className="ml-2">
                      {KIND_LABEL[row.location_kind]}
                    </Badge>
                  </TableCell>
                  <TableCell
                    className={row.quantity > 0 ? "text-foreground font-medium" : "text-muted"}
                  >
                    {formatQuantity(row.quantity)} {row.uom}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/inventory/stock/${row.location_kind}/${row.location_id}/${row.item_id}`}
                      className="text-accent text-sm font-medium hover:underline"
                    >
                      History
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <Pagination
            page={currentPage}
            pageCount={pageCount}
            prevHref={currentPage > 1 ? hrefForPage(currentPage - 1) : null}
            nextHref={currentPage < pageCount ? hrefForPage(currentPage + 1) : null}
            total={total}
            pageSize={pageSize}
          />
        </>
      )}
    </div>
  );
}
