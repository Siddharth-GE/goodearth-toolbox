import { Card } from "@/components/ui/card";
import { PageTitle } from "@/components/ui/page-title";
import { listTestProjects } from "@/lib/settings/test-projects";
import { DeleteTestProject } from "../_components/delete-test-project";
import { SettingsNav } from "../_components/settings-nav";

// The test project: a whole chain to try the tools on, and the button that clears it. Admin only (listTestProjects checks).
export default async function SettingsTestProjectPage() {
  const projects = await listTestProjects();

  return (
    <div className="space-y-4">
      <PageTitle
        title="Settings"
        description="A test project is for trying the tools end to end. Everything in it is made up, and it can be deleted in one go."
      />
      <SettingsNav active="test" />

      {projects.length === 0 ? (
        <Card className="p-5">
          <p className="text-muted text-sm">
            No test project right now. One is made by running{" "}
            <span className="font-mono text-xs">scripts/seed-test-project.ts</span> — ask for it
            when you want one.
          </p>
        </Card>
      ) : (
        projects.map((project) => (
          <Card key={project.id} className="space-y-4 p-5">
            <div>
              <p className="text-foreground text-lg font-semibold">{project.name}</p>
              <p className="text-muted text-sm">
                {[
                  project.villas.join(", ") || "No villa",
                  `${project.indents} indents`,
                  `${project.purchaseOrders} purchase orders`,
                  `${project.bills} bills`,
                ].join(" · ")}
              </p>
            </div>
            <p className="text-muted text-sm">
              Open any tool and pick {project.name} to see it: the Estimator, Indents, Purchase
              Orders, Inventory, Bills, Supervisors and Design Management all hold its records.
            </p>
            <DeleteTestProject projectId={project.id} name={project.name} />
          </Card>
        ))
      )}
    </div>
  );
}
