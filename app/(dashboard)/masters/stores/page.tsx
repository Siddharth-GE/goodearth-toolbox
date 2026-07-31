import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/table";
import { listProjects } from "@/lib/masters/projects";
import { listStores } from "@/lib/masters/stores";
import { Warehouse } from "lucide-react";
import { StoreFormDialog } from "./_components/store-form-dialog";

export default async function StoresPage() {
  const [stores, projects] = await Promise.all([listStores(), listProjects()]);
  const projectName = (id: string | null) => (id ? projects.find((p) => p.id === id)?.name ?? "—" : "—");

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <StoreFormDialog projects={projects} />
      </div>

      {stores.length === 0 ? (
        <EmptyState icon={Warehouse} title="No stores yet" description="Add the first store location." />
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Name</TableHeaderCell>
              <TableHeaderCell>Project</TableHeaderCell>
              <TableHeaderCell>Location</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
              <TableHeaderCell></TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {stores.map((store) => (
              <TableRow key={store.id}>
                <TableCell className="font-medium text-foreground">{store.name}</TableCell>
                <TableCell>{projectName(store.project_id)}</TableCell>
                <TableCell>{store.location || "—"}</TableCell>
                <TableCell>
                  <Badge variant={store.is_active ? "success" : "default"}>
                    {store.is_active ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <StoreFormDialog projects={projects} store={store} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
