"use client";

import { logout } from "@/app/actions/auth";
import { Avatar } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Logo } from "@/components/ui/logo";
import { TOOL_ICONS, type Tool, type ToolGroup } from "@/lib/tools";
import { cn } from "@/lib/utils";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { LayoutGrid, LogOut, Menu, Search, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const GROUP_ORDER: ToolGroup[] = ["Management", "Operations", "Events", "People", "Admin"];

function NavRow({
  href,
  active,
  icon: Icon,
  label,
  onNavigate,
}: {
  href: string;
  active: boolean;
  icon: typeof LayoutGrid;
  label: string;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
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

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <Logo />
      <span className="text-foreground text-base font-semibold tracking-tight">
        Goodearth Toolbox
      </span>
    </div>
  );
}

/** Everything inside the panel — shared by the desktop rail and the phone drawer. */
function SidebarContent({
  tools,
  userName,
  pathname,
  onNavigate,
}: {
  tools: Tool[];
  userName: string;
  pathname: string;
  /** The phone drawer closes itself when a link is tapped. */
  onNavigate?: () => void;
}) {
  const groups = GROUP_ORDER.map((group) => ({
    group,
    tools: tools.filter((t) => t.group === group),
  })).filter((g) => g.tools.length > 0);

  return (
    <>
      <div className="px-5 py-5">
        <Brand />
      </div>

      {/* Visual only for now — nothing to search across yet (no
          POs/people data), see CLAUDE.md. Not wired to a real index. */}
      <div className="border-border bg-background text-muted mx-3 mb-3 flex items-center gap-2 rounded-xl border px-3 py-2 text-sm">
        <Search className="size-4 shrink-0" />
        <span className="truncate">Search tools, people…</span>
      </div>

      <nav className="flex-1 overflow-y-auto px-3">
        <NavRow
          href="/"
          active={pathname === "/"}
          icon={LayoutGrid}
          label="Overview"
          onNavigate={onNavigate}
        />

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
                  onNavigate={onNavigate}
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
    </>
  );
}

/**
 * The dashboard shell's navigation, in two forms.
 *
 * Desktop: a rail pinned with `sticky top-0 h-screen` — the PAGE scrolls,
 * the rail doesn't. (It used to be a plain flex child, so it scrolled
 * away with the content and ended mid-air.) Its nav has its own
 * overflow-y for when the tool list outgrows the viewport.
 *
 * Phone: the rail is hidden; a slim sticky top bar carries the brand and
 * a menu button that opens the same content as a slide-in drawer. Radix
 * Dialog underneath, so focus-trapping, ESC and the backdrop click are
 * correct for free. The drawer closes itself on navigation.
 */
export function Sidebar({ tools, userName }: { tools: Tool[]; userName: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Desktop rail */}
      <aside className="border-border bg-surface sticky top-0 hidden h-screen w-64 shrink-0 flex-col self-start border-r md:flex">
        <SidebarContent tools={tools} userName={userName} pathname={pathname} />
      </aside>

      {/* Phone top bar */}
      <header className="border-border bg-background/95 sticky top-0 z-40 flex items-center gap-2 border-b px-3 py-2.5 backdrop-blur md:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="text-foreground focus-visible:ring-accent flex size-9 items-center justify-center rounded-xl hover:bg-black/[0.04] focus-visible:ring-2 focus-visible:outline-none dark:hover:bg-white/[0.06]"
        >
          <Menu className="size-5" />
        </button>
        <Brand />
      </header>

      {/* Phone drawer */}
      <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 md:hidden" />
          <DialogPrimitive.Content
            aria-describedby={undefined}
            className="bg-surface fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col shadow-lg outline-none md:hidden"
          >
            <DialogPrimitive.Title className="sr-only">Navigation</DialogPrimitive.Title>
            <DialogPrimitive.Close
              aria-label="Close menu"
              className="text-muted focus-visible:ring-accent absolute top-4 right-3 rounded-lg p-1.5 hover:bg-black/[0.04] focus-visible:ring-2 focus-visible:outline-none dark:hover:bg-white/[0.06]"
            >
              <X className="size-4" />
            </DialogPrimitive.Close>
            {/* Tapping a link navigates but keeps the drawer mounted —
                onNavigate closes it, or the new page appears behind an
                open menu. */}
            <SidebarContent
              tools={tools}
              userName={userName}
              pathname={pathname}
              onNavigate={() => setOpen(false)}
            />
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}
