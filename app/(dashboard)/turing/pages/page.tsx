import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageTitle } from "@/components/ui/page-title";
import { formatDate } from "@/lib/format";
import { listPages, requireTuring } from "@/lib/turing/queries";
import { LayoutDashboard } from "lucide-react";
import Link from "next/link";

export default async function TuringPagesPage() {
  await requireTuring();
  const pages = await listPages();
  return (
    <div className="space-y-6">
      <PageTitle
        title="Pages"
        description="Dashboards and documents Turing built. Every admin sees them, and each opens with today's data."
        backHref="/turing"
        backLabel="Turing"
      />
      {pages.length === 0 ? (
        <EmptyState
          icon={LayoutDashboard}
          title="No pages yet"
          description="Ask Turing for a dashboard or a report, and it is kept here."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {pages.map((page) => (
            <Link key={page.id} href={`/turing/pages/${page.id}`} className="block">
              <Card interactive className="h-full space-y-1 p-5">
                <p className="text-foreground text-[15px] font-semibold">{page.title}</p>
                <p className="text-muted text-xs">
                  {[page.owner_name, formatDate(page.created_at)].filter(Boolean).join(" · ")}
                </p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
