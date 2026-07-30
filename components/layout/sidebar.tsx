import { logout } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import type { Tool } from "@/lib/tools";
import Link from "next/link";

export function Sidebar({
  tools,
  userName,
}: {
  tools: Tool[];
  userName: string;
}) {
  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-border bg-surface">
      <div className="px-5 py-5">
        <span className="text-base font-semibold text-foreground">Goodearth Toolbox</span>
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {tools.length === 0 && (
          <p className="px-2.5 text-sm text-muted">No tools assigned yet.</p>
        )}
        {tools.map((tool) => (
          <Link
            key={tool.href}
            href={tool.href}
            className="flex h-10 items-center rounded-xl px-2.5 text-sm font-medium text-foreground transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
          >
            {tool.name}
          </Link>
        ))}
      </nav>

      <div className="border-t border-border px-3 py-3">
        <div className="flex items-center justify-between gap-2 px-2 py-1">
          <span className="truncate text-sm text-muted">{userName}</span>
          <form action={logout}>
            <Button type="submit" variant="ghost" size="md" className="h-8 px-2 text-xs">
              Sign out
            </Button>
          </form>
        </div>
      </div>
    </aside>
  );
}
