import { Card } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/dal";
import { visibleTools } from "@/lib/tools";
import Link from "next/link";

export default async function DashboardHome() {
  const user = await requireUser();
  const tools = visibleTools(user.profile);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-foreground">
        Welcome{user.profile?.full_name ? `, ${user.profile.full_name}` : ""}
      </h1>
      <p className="mt-1 text-sm text-muted">Pick a tool to get started.</p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {tools.map((tool) => (
          <Link key={tool.href} href={tool.href}>
            <Card className="p-5 transition-shadow hover:shadow-md">
              <h2 className="font-medium text-foreground">{tool.name}</h2>
            </Card>
          </Link>
        ))}
        {tools.length === 0 && (
          <Card className="p-5">
            <p className="text-sm text-muted">
              You don&apos;t have any tools assigned yet. Ask an admin to set your team.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
