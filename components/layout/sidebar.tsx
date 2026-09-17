"use client";

import { logout } from "@/app/actions/auth";
import { Avatar } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Logo } from "@/components/ui/logo";
import { ThemeMenuItem } from "@/components/ui/theme-toggle";
import { TOOL_ICONS, type Tool, type ToolGroup } from "@/lib/tools";
import { cn } from "@/lib/utils";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { LayoutGrid, LogOut, Menu, X } from "lucide-react";
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
        // Nav is ink, not green: the tool you are in is simply darker
        // than the rest, and green is left to say "press this".
        "flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13px] font-medium transition-colors",
        active
          ? "bg-foreground/[0.06] text-foreground"
          : "text-muted hover:text-foreground hover:bg-foreground/[0.05]",
      )}
    >
      <Icon className={cn("size-4 shrink-0", active && "text-accent")} />
      {label}
    </Link>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <Logo />
      <span className="text-foreground text-sm font-semibold tracking-tight">
        Goodearth <span className="text-muted">Toolbox</span>
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
            <p className="text-muted mb-2 px-2.5 text-[11px] font-medium tracking-[0.14em] uppercase">
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
          <DropdownMenuTrigger className="focus-visible:ring-accent hover:bg-foreground/[0.05] flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left outline-none focus-visible:ring-2">
            <Avatar name={userName} size={28} />
            <span className="text-foreground truncate text-sm font-medium">{userName}</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <ThemeMenuItem />
            <DropdownMenuSeparator />
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
 * overflow-y for when the tool list outgrows the viewport. The rail is
 * page-coloured, not paper: rail and content are one material, and a
 * hairline is all that separates them.
 *
 * Phone: the rail is hidden; a slim frosted top bar carries the brand and
 * a menu button that opens the same content as a drawer. Radix Dialog
 * underneath, so focus-trapping, ESC and the backdrop click are correct
 * for free. The drawer slides in from the left and slides back out again
 * — Radix keeps it mounted while the closing animation runs, so both
 * directions are plain CSS on its data-state. It closes itself on
 * navigation.
 */
export function Sidebar({ tools, userName }: { tools: Tool[]; userName: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Desktop rail */}
      <aside className="border-border/60 bg-background sticky top-0 hidden h-screen w-60 shrink-0 flex-col self-start border-r md:flex">
        <SidebarContent tools={tools} userName={userName} pathname={pathname} />
      </aside>

      {/* Phone top bar */}
      <header className="border-border/60 bg-background/80 sticky top-0 z-40 flex items-center gap-2 border-b px-3 py-2.5 backdrop-blur-xl md:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="text-foreground focus-visible:ring-accent hover:bg-foreground/[0.05] flex size-9 items-center justify-center rounded-xl focus-visible:ring-2 focus-visible:outline-none"
        >
          <Menu className="size-5" />
        </button>
        <Brand />
      </header>

      {/* Phone drawer */}
      <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in fixed inset-0 z-50 bg-black/40 md:hidden" />
          <DialogPrimitive.Content
            aria-describedby={undefined}
            className="bg-surface shadow-float data-[state=closed]:animate-slide-out-left data-[state=open]:animate-slide-in-left fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col rounded-r-3xl outline-none md:hidden"
          >
            <DialogPrimitive.Title className="sr-only">Navigation</DialogPrimitive.Title>
            <DialogPrimitive.Close
              aria-label="Close menu"
              className="text-muted focus-visible:ring-accent hover:bg-foreground/[0.05] absolute top-4 right-3 rounded-lg p-1.5 focus-visible:ring-2 focus-visible:outline-none"
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
