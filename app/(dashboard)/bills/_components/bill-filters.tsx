"use client";

import { Select } from "@/components/ui/select";
import { useRouter } from "next/navigation";

/**
 * "Show me one vendor / one project" — plain selects that navigate, so
 * the choice lives in the URL and the page stays a Server Component
 * (the inventory location-filter pattern). Changing a filter resets to
 * page 1; the status tab is kept.
 */
export function BillFilters({
  vendors,
  projects,
  selectedVendor,
  selectedProject,
  status,
}: {
  vendors: { id: string; name: string }[];
  projects: { id: string; name: string }[];
  selectedVendor: string;
  selectedProject: string;
  /** The active tab's query value, carried through navigation. */
  status: string;
}) {
  const router = useRouter();

  const navigate = (vendor: string, project: string) => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (vendor) params.set("vendor", vendor);
    if (project) params.set("project", project);
    const query = params.toString();
    router.push(query ? `/bills?${query}` : "/bills");
  };

  return (
    <div className="flex flex-wrap gap-2">
      <Select
        aria-label="Filter by vendor"
        value={selectedVendor}
        onChange={(event) => navigate(event.target.value, selectedProject)}
        className="sm:max-w-56"
      >
        <option value="">All vendors</option>
        {vendors.map((vendor) => (
          <option key={vendor.id} value={vendor.id}>
            {vendor.name}
          </option>
        ))}
      </Select>
      <Select
        aria-label="Filter by project"
        value={selectedProject}
        onChange={(event) => navigate(selectedVendor, event.target.value)}
        className="sm:max-w-56"
      >
        <option value="">All projects</option>
        {projects.map((project) => (
          <option key={project.id} value={project.id}>
            {project.name}
          </option>
        ))}
      </Select>
    </div>
  );
}
