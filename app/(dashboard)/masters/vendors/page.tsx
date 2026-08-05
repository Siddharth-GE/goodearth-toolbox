import { Badge } from "@/components/ui/badge";
import { Button, LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pagination } from "@/components/ui/pagination";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import { listVendorsPage } from "@/lib/masters/vendors";
import { ShoppingCart } from "lucide-react";
import Link from "next/link";
import { VendorFormDialog } from "./_components/vendor-form-dialog";

export default async function VendorsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const { q, status, page } = await searchParams;
  const result = await listVendorsPage({ search: q, status, page: Number(page) || 1 });
  const { rows: vendors, total, page: currentPage, pageSize, pageCount } = result;

  // Carries the active filters onto the pager links, so paging never
  // silently drops the search you're in the middle of.
  const hrefForPage = (target: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    if (target > 1) params.set("page", String(target));
    const query = params.toString();
    return query ? `/masters/vendors?${query}` : "/masters/vendors";
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        {/* GET form: submitting drops `page`, so changing any filter
            naturally returns to page 1 rather than stranding you on page 40. */}
        <form action="/masters/vendors" className="flex flex-wrap items-end gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="q">Search</Label>
            <Input
              id="q"
              name="q"
              defaultValue={q ?? ""}
              placeholder="Name, contact or GST…"
              autoComplete="off"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="status">Status</Label>
            <Select id="status" name="status" defaultValue={status ?? ""}>
              <option value="">All</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
          </div>
          <Button type="submit" variant="secondary">
            Filter
          </Button>
          {(q || status) && (
            <LinkButton href="/masters/vendors" variant="ghost">
              Clear
            </LinkButton>
          )}
        </form>
        <VendorFormDialog />
      </div>

      {vendors.length === 0 ? (
        <EmptyState
          icon={ShoppingCart}
          title={q || status ? "No vendors found" : "No vendors yet"}
          description={q || status ? "Try a different search." : "Add the first vendor."}
        />
      ) : (
        <>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Name</TableHeaderCell>
                <TableHeaderCell>Contact</TableHeaderCell>
                <TableHeaderCell>Mobile</TableHeaderCell>
                <TableHeaderCell>GST</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell></TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {vendors.map((vendor) => (
                <TableRow key={vendor.id}>
                  <TableCell className="text-foreground font-medium">
                    <Link href={`/masters/vendors/${vendor.id}`} className="hover:underline">
                      {vendor.name}
                    </Link>
                  </TableCell>
                  <TableCell>{vendor.contact_name || "—"}</TableCell>
                  <TableCell>{vendor.mobile || "—"}</TableCell>
                  <TableCell>{vendor.gst_no || "—"}</TableCell>
                  <TableCell>
                    <Badge variant={vendor.is_active ? "success" : "neutral"}>
                      {vendor.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <VendorFormDialog vendor={vendor} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <Pagination
            page={currentPage}
            pageCount={pageCount}
            // Precomputed strings, not the function itself — a function
            // can't cross into a Client Component.
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
