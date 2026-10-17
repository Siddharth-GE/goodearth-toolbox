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
import { isInTool, sectionKeyOf, type ToolSection } from "@/lib/nav/arrange";
import { TOOL_ICONS } from "@/lib/tools";
import { cn } from "@/lib/utils";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ChevronRight, LayoutGrid, LogOut, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId, useState } from "react";

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
        // Nav is ink, not green: green is left to say "press this".
        "flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13px] font-medium transition-colors",
        active
          ? "bg-foreground/[0.06] text-foreground"
          : "text-muted hover:text-foreground hover:bg-foreground/[0.05]",
      )}
    >
      <Icon className={cn("size-4 shrink-0", active && "text-accent")} />
      <span className="truncate">{label}</span>
    </Link>
  );
}

/** One team: a row that opens and closes. No animation (DESIGN.md: nothing moves outside the motion vocabulary). */
function TeamRow({
  section,
  open,
  holdsPage,
  pathname,
  onToggle,
  onNavigate,
}: {
  section: ToolSection;
  open: boolean;
  holdsPage: boolean;
  pathname: string;
  onToggle: () => void;
  onNavigate?: () => void;
}) {
  // useId, not the team's key: the rail and the phone drawer both draw
  // this row, and an id may appear only once on the page.
  const listId = useId();
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={listId}
        className={cn(
          "focus-visible:ring-accent flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13px] font-medium focus-visible:ring-2 focus-visible:outline-none",
          open || holdsPage
            ? "text-foreground hover:bg-foreground/[0.05]"
            : "text-muted hover:text-foreground hover:bg-foreground/[0.05]",
        )}
      >
        <ChevronRight className={cn("size-4 shrink-0", open && "rotate-90")} />
        <span className="min-w-0 flex-1 truncate">{section.name}</span>
        <span className="text-muted text-xs tabular-nums">{section.tools.length}</span>
      </button>
      {open && (
        // The hairline sits under the chevron's centre.
        <div
          id={listId}
          className="border-border mt-0.5 mb-1 ml-[17px] space-y-0.5 border-l pl-1.5"
        >
          {section.tools.map((tool) => (
            <NavRow
              key={tool.href}
              href={tool.href}
              active={isInTool(tool.href, pathname)}
              icon={TOOL_ICONS[tool.icon]}
              label={tool.name}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <Logo />
      <span className="text-foreground text-sm font-semibold tracking-tight">
        Toolbox <span className="text-muted">by Kaadal</span>
      </span>
    </div>
  );
}

function SidebarContent({
  sections,
  openKeys,
  onToggle,
  userName,
  pathname,
  onNavigate,
}: {
  sections: ToolSection[];
  openKeys: string[];
  onToggle: (key: string) => void;
  userName: string;
  pathname: string;
  onNavigate?: () => void;
}) {
  const pageKey = sectionKeyOf(sections, pathname);

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

        {sections.length > 0 && (
          <div className="mt-3 space-y-0.5">
            {sections.map((section) => (
              <TeamRow
                key={section.key}
                section={section}
                open={openKeys.includes(section.key)}
                holdsPage={section.key === pageKey}
                pathname={pathname}
                onToggle={() => onToggle(section.key)}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        )}

        {sections.length === 0 && (
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
 * The dashboard shell's navigation: a sticky desktop rail (the page scrolls, not the rail) and a phone top bar opening the same content in a Radix Dialog drawer.
 * The team holding the current page opens itself; open state is held here so the rail and the drawer agree.
 */
export function Sidebar({ sections, userName }: { sections: ToolSection[]; userName: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const pageKey = sectionKeyOf(sections, pathname);
  const [openKeys, setOpenKeys] = useState<string[]>(() => {
    const keys = sections.length === 1 ? [sections[0].key] : [];
    return pageKey && !keys.includes(pageKey) ? [...keys, pageKey] : keys;
  });
  // Adjusted while rendering, not in an effect, so the list never paints closed for a frame.
  const [seenPageKey, setSeenPageKey] = useState(pageKey);
  if (pageKey !== seenPageKey) {
    setSeenPageKey(pageKey);
    if (pageKey && !openKeys.includes(pageKey)) setOpenKeys([...openKeys, pageKey]);
  }

  const toggle = (key: string) =>
    setOpenKeys((keys) => (keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key]));

  return (
    <>
      <aside className="border-border/60 bg-background sticky top-0 hidden h-screen w-60 shrink-0 flex-col self-start border-r md:flex">
        <SidebarContent
          sections={sections}
          openKeys={openKeys}
          onToggle={toggle}
          userName={userName}
          pathname={pathname}
        />
      </aside>

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
            {/* onNavigate closes the drawer, or the new page appears behind an open menu. */}
            <SidebarContent
              sections={sections}
              openKeys={openKeys}
              onToggle={toggle}
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
