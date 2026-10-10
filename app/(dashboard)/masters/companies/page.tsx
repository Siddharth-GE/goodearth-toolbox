import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import { listCompanies } from "@/lib/masters/companies";
import { listProjects } from "@/lib/masters/projects";
import { Building2 } from "lucide-react";
import { CompanyFormDialog } from "./_components/company-form-dialog";

export default async function CompaniesPage() {
  const [companies, projects] = await Promise.all([listCompanies(), listProjects()]);
  const projectsOf = (companyId: string) =>
    projects.filter((project) => project.company_id === companyId).map((project) => project.name);
  const without = projects.filter((project) => !project.company_id).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted max-w-2xl text-sm">
          Every indent, PO, work order and bill prints its project&apos;s company at the top. Give
          each project its company under Projects → Edit.
          {without > 0 &&
            ` ${without} of ${projects.length} projects have none yet, so their documents print a placeholder letterhead.`}
        </p>
        <CompanyFormDialog />
      </div>

      {companies.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No companies yet"
          description="Add the company documents are issued by, with its registered address and GSTIN."
        />
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Name</TableHeaderCell>
              <TableHeaderCell>GSTIN</TableHeaderCell>
              <TableHeaderCell>State</TableHeaderCell>
              <TableHeaderCell>Projects</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
              <TableHeaderCell></TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {companies.map((company) => {
              const names = projectsOf(company.id);
              return (
                <TableRow key={company.id}>
                  <TableCell>
                    <p className="text-foreground font-medium">{company.name}</p>
                    {company.legal_name && company.legal_name !== company.name && (
                      <p className="text-muted text-xs">{company.legal_name}</p>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{company.gstin || "—"}</TableCell>
                  <TableCell>{company.state}</TableCell>
                  <TableCell>{names.length > 0 ? names.join(", ") : "—"}</TableCell>
                  <TableCell>
                    <Badge variant={company.is_active ? "success" : "neutral"}>
                      {company.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <CompanyFormDialog company={company} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
