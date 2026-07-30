import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireUser } from "@/lib/auth/dal";
import { TOOL_ICONS, visibleTools } from "@/lib/tools";
import { LayoutGrid } from "lucide-react";
import Link from "next/link";

export default async function DashboardHome() {
  const user = await requireUser();
  const tools = visibleTools(user.profile);
  const firstName = user.profile?.full_name?.split(" ")[0];

  return (
    <div>
      <h1 className="text-4xl font-extrabold tracking-tight text-foreground md:text-5xl">
        Welcome{firstName ? `, ${firstName}` : ""}
      </h1>
      <p className="mt-2 text-sm text-muted">Pick a tool to get started.</p>

      {tools.length === 0 ? (
        <EmptyState
          className="mt-8"
          icon={LayoutGrid}
          title="No tools assigned yet"
          description="Ask an admin to set your team."
        />
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {tools.map((tool) => {
            const Icon = TOOL_ICONS[tool.icon];
            return (
              <Link key={tool.href} href={tool.href}>
                <Card className="p-5 transition-shadow hover:shadow-md">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-accent/10 text-accent">
                    <Icon className="size-5" />
                  </span>
                  <h2 className="mt-3 font-semibold text-foreground">{tool.name}</h2>
                  <p className="mt-1 text-sm text-muted">{tool.description}</p>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
