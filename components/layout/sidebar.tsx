"use client";

import { logout } from "@/app/actions/auth";
import { Avatar } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { TOOL_ICONS, type Tool } from "@/lib/tools";
import { cn } from "@/lib/utils";
import { LogOut } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function Sidebar({
  tools,
  userName,
}: {
  tools: Tool[];
  userName: string;
}) {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-border bg-surface">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-accent text-sm font-bold text-accent-foreground">
          G
        </span>
        <span className="text-base font-semibold tracking-tight text-foreground">Goodearth Toolbox</span>
      </div>

      <nav className="flex-1 px-3">
        <p className="mb-2 px-2.5 text-xs font-semibold uppercase tracking-widest text-muted">Tools</p>
        <div className="space-y-1">
          {tools.length === 0 && (
            <p className="px-2.5 text-sm text-muted">No tools assigned yet.</p>
          )}
          {tools.map((tool) => {
            const Icon = TOOL_ICONS[tool.icon];
            const active = pathname === tool.href || pathname.startsWith(`${tool.href}/`);
            return (
              <Link
                key={tool.href}
                href={tool.href}
                className={cn(
                  "flex h-10 items-center gap-2.5 rounded-xl px-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-accent/10 text-accent"
                    : "text-foreground hover:bg-black/[0.04] dark:hover:bg-white/[0.06]",
                )}
              >
                <Icon className="size-4 shrink-0" />
                {tool.name}
              </Link>
            );
          })}
        </div>
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
