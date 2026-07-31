import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/table";
import { listVendors } from "@/lib/masters/vendors";
import { ShoppingCart } from "lucide-react";
import { VendorFormDialog } from "./_components/vendor-form-dialog";

export default async function VendorsPage() {
  const vendors = await listVendors();

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <VendorFormDialog />
      </div>

      {vendors.length === 0 ? (
        <EmptyState icon={ShoppingCart} title="No vendors yet" description="Add the first vendor." />
      ) : (
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
                <TableCell className="font-medium text-foreground">{vendor.name}</TableCell>
                <TableCell>{vendor.contact_name || "—"}</TableCell>
                <TableCell>{vendor.mobile || "—"}</TableCell>
                <TableCell>{vendor.gst_no || "—"}</TableCell>
                <TableCell>
                  <Badge variant={vendor.is_active ? "success" : "default"}>
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
      )}
    </div>
  );
}
