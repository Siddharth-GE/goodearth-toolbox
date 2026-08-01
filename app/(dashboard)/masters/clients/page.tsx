import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import { listClients } from "@/lib/masters/clients";
import { Users } from "lucide-react";
import { ClientFormDialog } from "./_components/client-form-dialog";

export default async function ClientsPage() {
  const clients = await listClients();

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <ClientFormDialog />
      </div>

      {clients.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No clients yet"
          description="Add the first client to assign them to units."
        />
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Name</TableHeaderCell>
              <TableHeaderCell>Mobile</TableHeaderCell>
              <TableHeaderCell>Email</TableHeaderCell>
              <TableHeaderCell></TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {clients.map((client) => (
              <TableRow key={client.id}>
                <TableCell className="text-foreground font-medium">{client.name}</TableCell>
                <TableCell>{client.mobile || "—"}</TableCell>
                <TableCell>{client.email || "—"}</TableCell>
                <TableCell>
                  <ClientFormDialog client={client} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
