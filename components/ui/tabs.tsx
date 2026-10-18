"use client";

import { cn } from "@/lib/utils";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import Link from "next/link";
import type { ComponentProps } from "react";

// Radix Tabs: switches panels on the SAME page (no URL change). See NavTabs below for routes.
export const Tabs = TabsPrimitive.Root;
export const TabsContent = TabsPrimitive.Content;

const pillClasses =
  "rounded-full px-3.5 py-1.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent";
const pillActive = "bg-foreground text-background";
const pillInactive = "text-muted hover:text-foreground hover:bg-foreground/[0.05]";

export function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List className={cn("flex gap-2", className)} {...props} />;
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        pillClasses,
        pillInactive,
        "data-[state=active]:bg-foreground data-[state=active]:text-background",
        className,
      )}
      {...props}
    />
  );
}

// NavTabs: the same pill visual for real ROUTES, plain next/link, not Radix.
export function NavTabs({
  tabs,
  active,
}: {
  tabs: { key: string; href: string; label: string }[];
  active: string;
}) {
  return (
    // flex-wrap: an unwrapped pill row was wider than a phone screen.
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
