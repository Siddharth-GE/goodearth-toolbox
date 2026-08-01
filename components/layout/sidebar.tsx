"use client";

import { logout } from "@/app/actions/auth";
import { Avatar } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TOOL_ICONS, type Tool, type ToolGroup } from "@/lib/tools";
import { cn } from "@/lib/utils";
import { LayoutGrid, LogOut, Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const GROUP_ORDER: ToolGroup[] = ["Operations", "Events", "People", "Admin"];

function NavRow({
  href,
  active,
  icon: Icon,
  label,
}: {
  href: string;
  active: boolean;
  icon: typeof LayoutGrid;
  label: string;
}) {
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

export function Sidebar({ tools, userName }: { tools: Tool[]; userName: string }) {
  const pathname = usePathname();

  const groups = GROUP_ORDER.map((group) => ({
    group,
    tools: tools.filter((t) => t.group === group),
  })).filter((g) => g.tools.length > 0);

  return (
    <aside className="border-border bg-surface flex h-screen w-64 shrink-0 flex-col border-r">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <span className="bg-accent text-accent-foreground flex size-7 shrink-0 items-center justify-center rounded-lg text-sm font-bold">
          G
        </span>
        <span className="text-foreground text-base font-semibold tracking-tight">
          Goodearth Toolbox
        </span>
      </div>

      {/* Visual only for now — nothing to search across yet (no
          POs/people data), see CLAUDE.md. Not wired to a real index. */}
      <div className="border-border bg-background text-muted mx-3 mb-3 flex items-center gap-2 rounded-xl border px-3 py-2 text-sm">
        <Search className="size-4 shrink-0" />
        <span className="truncate">Search tools, people…</span>
      </div>

      <nav className="flex-1 overflow-y-auto px-3">
        <NavRow href="/" active={pathname === "/"} icon={LayoutGrid} label="Overview" />

        {groups.map(({ group, tools: groupTools }) => (
          <div key={group} className="mt-4">
            <p className="text-muted mb-2 px-2.5 text-xs font-semibold tracking-widest uppercase">
              {group}
            </p>
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
          <p className="text-muted mt-4 px-2.5 text-sm">No tools assigned yet.</p>
        )}
      </nav>

      <div className="border-border border-t p-3">
        <DropdownMenu>
          <DropdownMenuTrigger className="focus-visible:ring-accent flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left outline-none hover:bg-black/[0.04] focus-visible:ring-2 dark:hover:bg-white/[0.06]">
            <Avatar name={userName} size={28} />
            <span className="text-foreground truncate text-sm font-medium">{userName}</span>
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
