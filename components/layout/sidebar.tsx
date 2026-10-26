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
import { biometricStatus, forgetBiometricSignIn } from "@/lib/native/biometric-sign-in";
import { pushToken, startPush } from "@/lib/native/push";
import { isInTool, sectionOfPage, type ToolSection } from "@/lib/nav/arrange";
import { registerPushDevice } from "@/lib/push/actions";
import { TOOL_ICONS, TURING } from "@/lib/tools";
import { cn } from "@/lib/utils";
import { PLATE_COUNT_EVENT } from "./plate-count-sync";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Bell, Fingerprint, LayoutGrid, LogOut, Menu, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

// The rail is a brand ground: everything on it is drawn in its on-ground colour.
const rowBase =
  "focus-visible:ring-on-ground/60 flex items-center gap-2.5 rounded-lg px-2.5 font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none";
const rowIdle = "text-on-ground/70 hover:text-on-ground hover:bg-on-ground/[0.08]";
const rowActive = "bg-on-ground/[0.14] text-on-ground";

/** A team is a place: its row opens the team page. Only the team you are in lists its tools beneath it. */
function TeamRow({
  section,
  current,
  showTools,
  pathname,
  onNavigate,
}: {
  section: ToolSection;
  current: boolean;
  showTools: boolean;
  pathname: string;
  onNavigate?: () => void;
}) {
  const teamHref = `/team/${section.slug}`;
  return (
    <div>
      <Link
        href={teamHref}
        onClick={onNavigate}
        aria-current={pathname === teamHref ? "page" : undefined}
        className={cn(
          rowBase,
          "h-10 text-sm",
          pathname === teamHref ? rowActive : current ? "text-on-ground" : rowIdle,
          current && pathname !== teamHref && "hover:bg-on-ground/[0.08]",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "ring-on-ground/40 size-3 shrink-0 rounded-[1px] ring-1",
            GROUND_SWATCH[section.ground],
          )}
        />
        <span className="min-w-0 flex-1 truncate">{section.name}</span>
        <span className="text-on-ground/60 text-xs tabular-nums">{section.tools.length}</span>
      </Link>
      {showTools && (
        // The hairline sits under the swatch's centre.
        <div className="border-on-ground/20 mt-0.5 mb-2 ml-4 space-y-0.5 border-l pl-2">
          {section.tools.map((tool) => {
            const Icon = TOOL_ICONS[tool.icon];
            const active = isInTool(tool.href, pathname);
            return (
              <Link
                key={tool.href}
                href={tool.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(rowBase, "h-9 text-[13px]", active ? rowActive : rowIdle)}
              >
                <Icon className={cn("size-4 shrink-0", active && "text-ground-mark")} />
                <span className="truncate">{tool.name}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** In the phone app, while this phone keeps a fingerprint sign-in (lib/native/biometric-sign-in.ts). */
function ForgetFingerprintItem() {
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    let left = false;
    void biometricStatus().then((status) => {
      if (!left) setSaved(Boolean(status?.email));
    });
    return () => {
      left = true;
    };
  }, []);
  if (!saved) return null;
  return (
    <DropdownMenuItem
      onSelect={() => {
        void forgetBiometricSignIn();
        setSaved(false);
      }}
    >
      <Fingerprint className="size-4" />
      Turn off fingerprint sign-in
    </DropdownMenuItem>
  );
}

/** Inside the app the name is just "Toolbox"; "Kaadal Toolbox" is for outside (sign-in, the tab, documents). */
function Brand() {
  return (
    <span className="text-ground-mark font-display text-2xl leading-none font-medium">Toolbox</span>
  );
}

/** What waits on the person, as a number on the rail and the phone's bell; nothing until it has been read. */
function PlateCount({ count }: { count: number | null }) {
  if (!count) return null;
  return (
    <span className="bg-on-ground text-ground ml-auto min-w-5 rounded-full px-1.5 text-center text-[11px] leading-5 font-semibold tabular-nums">
      {count > 99 ? "99+" : count}
    </span>
  );
}

function SidebarContent({
  sections,
  userName,
  turing,
  pathname,
  plate,
  onNavigate,
}: {
  sections: ToolSection[];
  userName: string;
  turing: boolean;
  pathname: string;
  plate: number | null;
  onNavigate?: () => void;
}) {
  const inTuring = isInTool(TURING.href, pathname);
  const current = sectionOfPage(sections, pathname);

  return (
    <>
      <div className="px-5 pt-6 pb-5">
        <Brand />
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-3">
        {/* First, above every team, and never under one (founder): admins only, like Settings. */}
        {turing && (
          <Link
            href={TURING.href}
            onClick={onNavigate}
            aria-current={inTuring ? "page" : undefined}
            className={cn(rowBase, "mb-0.5 h-10 text-sm", inTuring ? rowActive : rowIdle)}
          >
            <Sparkles className={cn("size-4 shrink-0", inTuring && "text-ground-mark")} />
            {TURING.name}
          </Link>
        )}
        <Link
          href="/"
          onClick={onNavigate}
          aria-current={pathname === "/" ? "page" : undefined}
          className={cn(rowBase, "h-10 text-sm", pathname === "/" ? rowActive : rowIdle)}
        >
          <LayoutGrid className={cn("size-4 shrink-0", pathname === "/" && "text-ground-mark")} />
          Overview
        </Link>
        <Link
          href="/plate"
          onClick={onNavigate}
          aria-current={pathname === "/plate" ? "page" : undefined}
          className={cn(
            rowBase,
            "mt-0.5 h-10 text-sm",
            pathname === "/plate" ? rowActive : rowIdle,
          )}
        >
          <Bell className={cn("size-4 shrink-0", pathname === "/plate" && "text-ground-mark")} />
          My plate
          <PlateCount count={plate} />
        </Link>

        {sections.length > 0 && (
          <>
            <p className="text-on-ground/55 mt-6 mb-2 px-2.5 text-[11px] font-medium tracking-[0.14em] uppercase">
              Teams
            </p>
            <div className="space-y-0.5">
              {sections.map((section) => (
                <TeamRow
                  key={section.key}
                  section={section}
                  current={section.key === current?.key}
                  // Someone with one team always sees its tools.
                  showTools={section.key === current?.key || sections.length === 1}
                  pathname={pathname}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          </>
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
            <ForgetFingerprintItem />
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => logout(pushToken() ?? undefined)}>
              <LogOut className="size-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );
}

/** The dashboard shell's navigation: a sticky desktop rail (the page scrolls, not the rail) and a phone top bar opening the same content in a Radix Dialog drawer. */
export function Sidebar({
  sections,
  userName,
  turing,
}: {
  sections: ToolSection[];
  userName: string;
  turing: boolean;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [plate, setPlate] = useState<number | null>(null);
  const plateReadAt = useRef(0);
  // The home page and My plate read the plate themselves and hand the count over.
  useEffect(() => {
    const take = (event: Event) => {
      plateReadAt.current = Date.now();
      setPlate((event as CustomEvent<number>).detail);
    };
    window.addEventListener(PLATE_COUNT_EVENT, take);
    return () => window.removeEventListener(PLATE_COUNT_EVENT, take);
  }, []);
  // Elsewhere it is read after the page shows, at most once a minute: the plate reads every tool.
  useEffect(() => {
    if (pathname === "/" || pathname === "/plate") return;
    if (Date.now() - plateReadAt.current < 60_000) return;
    plateReadAt.current = Date.now();
    fetch("/api/plate-count", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { count: number } | null) => {
        if (body) setPlate(body.count);
      })
      .catch(() => {});
  }, [pathname]);

  // In the phone app, once per signed-in launch (lib/native/push.ts); nothing on the website.
  useEffect(
    () =>
      startPush((token, platform) => {
        void registerPushDevice(token, platform);
      }),
    [],
  );

  return (
    <>
      <aside className="ground-burgundy dark:ground-teal bg-ground text-on-ground sticky top-(--banner-h) hidden h-[calc(100dvh-var(--banner-h))] w-64 shrink-0 flex-col self-start md:flex">
        <SidebarContent
          sections={sections}
          userName={userName}
          turing={turing}
          pathname={pathname}
          plate={plate}
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
        <Link
          href="/plate"
          aria-label={plate ? `My plate, ${plate} waiting` : "My plate"}
          className="text-on-ground focus-visible:ring-on-ground/60 hover:bg-on-ground/[0.08] ml-auto flex h-9 items-center gap-1.5 rounded-xl px-2 focus-visible:ring-2 focus-visible:outline-none"
        >
          <Bell className="size-5" />
          <PlateCount count={plate} />
        </Link>
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
              userName={userName}
              turing={turing}
              pathname={pathname}
              plate={plate}
              onNavigate={() => setOpen(false)}
            />
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}
