"use client";

import { cn } from "@/lib/utils";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import Link from "next/link";
import type { ComponentProps } from "react";

// Radix Tabs: for switching between content panels on the SAME page
// (no navigation, no URL change) — e.g. sections of a form. Not what
// Marathon's admin nav needs; see NavTabs below for that.
export const Tabs = TabsPrimitive.Root;
export const TabsContent = TabsPrimitive.Content;

const pillClasses =
  "rounded-full border px-3.5 py-1.5 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-accent";
const pillActive = "border-accent bg-accent text-accent-foreground";
const pillInactive = "border-border text-foreground";

export function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List className={cn("flex gap-2", className)} {...props} />;
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        pillClasses,
        pillInactive,
        "data-[state=active]:border-accent data-[state=active]:bg-accent data-[state=active]:text-accent-foreground",
        className,
      )}
      {...props}
    />
  );
}

// NavTabs: the same pill visual, but for switching between actual
// ROUTES (different pages) — plain next/link, not Radix. Use this for
// admin-style section nav (Entries / Members / Groups), where each tab
// is a real URL, not client-only panel state.
export function NavTabs({
  tabs,
  active,
}: {
  tabs: { key: string; href: string; label: string }[];
  active: string;
}) {
  return (
    // flex-wrap: Masters has eight of these, and on a phone an unwrapped
    // pill row was wider than the screen.
    <div className="flex flex-wrap gap-2">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          className={cn(pillClasses, active === tab.key ? pillActive : pillInactive)}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
