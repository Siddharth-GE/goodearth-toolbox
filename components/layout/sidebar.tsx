"use client";

import { logout } from "@/app/actions/auth";
import { Avatar } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { TOOL_ICONS, type Tool, type ToolGroup } from "@/lib/tools";
import { cn } from "@/lib/utils";
import { LayoutGrid, LogOut, Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const GROUP_ORDER: ToolGroup[] = ["Operations", "Events", "People", "Admin"];

function NavRow({ href, active, icon: Icon, label }: { href: string; active: boolean; icon: typeof LayoutGrid; label: string }) {
  return (
    <Link
      href={href}
      className={cn(
        "flex h-10 items-center gap-2.5 rounded-xl px-2.5 text-sm font-medium transition-colors",
        active
          ? "bg-accent/10 text-accent"
          : "text-foreground hover:bg-black/[0.04] dark:hover:bg-white/[0.06]",
      )}
    >
      <Icon className="size-4 shrink-0" />
      {label}
    </Link>
  );
}

export function Sidebar({
  tools,
  userName,
}: {
  tools: Tool[];
  userName: string;
}) {
  const pathname = usePathname();

  const groups = GROUP_ORDER.map((group) => ({
    group,
    tools: tools.filter((t) => t.group === group),
  })).filter((g) => g.tools.length > 0);

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-border bg-surface">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-accent text-sm font-bold text-accent-foreground">
          G
        </span>
        <span className="text-base font-semibold tracking-tight text-foreground">Goodearth Toolbox</span>
      </div>

      {/* Visual only for now — nothing to search across yet (no
          POs/people data), see CLAUDE.md. Not wired to a real index. */}
      <div className="mx-3 mb-3 flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm text-muted">
        <Search className="size-4 shrink-0" />
        <span className="truncate">Search tools, people…</span>
      </div>

      <nav className="flex-1 overflow-y-auto px-3">
        <NavRow href="/" active={pathname === "/"} icon={LayoutGrid} label="Overview" />

        {groups.map(({ group, tools: groupTools }) => (
          <div key={group} className="mt-4">
            <p className="mb-2 px-2.5 text-xs font-semibold uppercase tracking-widest text-muted">{group}</p>
            <div className="space-y-1">
              {groupTools.map((tool) => (
                <NavRow
                  key={tool.href}
                  href={tool.href}
                  active={pathname === tool.href || pathname.startsWith(`${tool.href}/`)}
                  icon={TOOL_ICONS[tool.icon]}
                  label={tool.name}
                />
              ))}
            </div>
          </div>
        ))}

        {tools.length === 0 && (
          <p className="mt-4 px-2.5 text-sm text-muted">No tools assigned yet.</p>
        )}
      </nav>

      <div className="border-t border-border p-3">
        <DropdownMenu>
          <DropdownMenuTrigger className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left outline-none hover:bg-black/[0.04] focus-visible:ring-2 focus-visible:ring-accent dark:hover:bg-white/[0.06]">
            <Avatar name={userName} size={28} />
            <span className="truncate text-sm font-medium text-foreground">{userName}</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuItem onSelect={() => logout()}>
              <LogOut className="size-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );
}
