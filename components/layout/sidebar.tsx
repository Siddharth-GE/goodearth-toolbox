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
import { GROUND_SWATCH } from "@/components/ui/ground";
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
        // The rail is a brand ground: everything on it is drawn in its on-ground colour.
        "focus-visible:ring-on-ground/60 flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13px] font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none",
        active
          ? "bg-on-ground/[0.14] text-on-ground"
          : "text-on-ground/70 hover:text-on-ground hover:bg-on-ground/[0.08]",
      )}
    >
      <Icon className={cn("size-4 shrink-0", active && "text-ground-mark")} />
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
          "focus-visible:ring-on-ground/60 hover:bg-on-ground/[0.08] flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13px] font-medium focus-visible:ring-2 focus-visible:outline-none",
          open || holdsPage ? "text-on-ground" : "text-on-ground/70 hover:text-on-ground",
        )}
      >
        <ChevronRight className={cn("size-4 shrink-0", open && "rotate-90")} />
        <span
          aria-hidden
          className={cn(
            "ring-on-ground/40 size-2.5 shrink-0 rounded-[1px] ring-1",
            GROUND_SWATCH[section.ground],
          )}
        />
        <span className="min-w-0 flex-1 truncate">{section.name}</span>
        <span className="text-on-ground/60 text-xs tabular-nums">{section.tools.length}</span>
      </button>
      {open && (
        // The hairline sits under the chevron's centre.
        <div
          id={listId}
          className="border-on-ground/20 mt-0.5 mb-1 ml-[17px] space-y-0.5 border-l pl-1.5"
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

/** Inside the app the name is just "Toolbox"; "Kaadal Toolbox" is for outside (sign-in, the tab, documents). */
function Brand() {
  return (
    <span className="text-ground-mark font-display text-2xl leading-none font-medium">Toolbox</span>
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
      <div className="px-5 pt-6 pb-5">
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
          <p className="text-on-ground/70 mt-4 px-2.5 text-sm">No tools assigned yet.</p>
        )}
      </nav>

      <div className="border-on-ground/15 border-t p-3">
        <DropdownMenu>
          <DropdownMenuTrigger className="focus-visible:ring-on-ground/60 hover:bg-on-ground/[0.08] flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left outline-none focus-visible:ring-2">
            <Avatar name={userName} size={28} />
            <span className="text-on-ground truncate text-sm font-medium">{userName}</span>
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
      <aside className="ground-burgundy dark:ground-teal bg-ground text-on-ground sticky top-0 hidden h-screen w-60 shrink-0 flex-col self-start md:flex">
        <SidebarContent
          sections={sections}
          openKeys={openKeys}
          onToggle={toggle}
          userName={userName}
          pathname={pathname}
        />
      </aside>

      <header className="ground-burgundy dark:ground-teal bg-ground sticky top-0 z-40 flex items-center gap-2 px-3 py-2.5 md:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="text-on-ground focus-visible:ring-on-ground/60 hover:bg-on-ground/[0.08] flex size-9 items-center justify-center rounded-xl focus-visible:ring-2 focus-visible:outline-none"
        >
          <Menu className="size-5" />
        </button>
        <Brand />
      </header>

      <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in bg-brand-ink/50 fixed inset-0 z-50 md:hidden" />
          <DialogPrimitive.Content
            aria-describedby={undefined}
            className="ground-burgundy dark:ground-teal bg-ground text-on-ground shadow-float data-[state=closed]:animate-slide-out-left data-[state=open]:animate-slide-in-left fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col outline-none md:hidden"
          >
            <DialogPrimitive.Title className="sr-only">Navigation</DialogPrimitive.Title>
            <DialogPrimitive.Close
              aria-label="Close menu"
              className="text-on-ground/70 hover:text-on-ground focus-visible:ring-on-ground/60 hover:bg-on-ground/[0.08] absolute top-5 right-3 rounded-lg p-1.5 focus-visible:ring-2 focus-visible:outline-none"
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
