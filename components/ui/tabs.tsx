"use client";

import { cn } from "@/lib/utils";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import Link from "next/link";
import type { ComponentProps } from "react";

// Radix Tabs: switches panels on the SAME page (no URL change). See NavTabs below for routes.
export const Tabs = TabsPrimitive.Root;
export const TabsContent = TabsPrimitive.Content;

// Underlined, not pills: the Brandkit keeps controls square. The row scrolls sideways on a phone rather than wrapping.
const stripClasses = "border-border flex gap-6 overflow-x-auto border-b";
const tabClasses =
  "-mb-px shrink-0 whitespace-nowrap border-b-2 px-0.5 pt-1 pb-2.5 text-sm font-medium outline-none transition-colors focus-visible:text-foreground focus-visible:border-accent/60";
const tabActive = "border-accent text-foreground";
const tabInactive = "border-transparent text-muted hover:text-foreground";

export function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List className={cn(stripClasses, className)} {...props} />;
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        tabClasses,
        tabInactive,
        "data-[state=active]:border-accent data-[state=active]:text-foreground",
        className,
      )}
      {...props}
    />
  );
}

// NavTabs: the same strip for real ROUTES, plain next/link, not Radix.
export function NavTabs({
  tabs,
  active,
}: {
  tabs: { key: string; href: string; label: string }[];
  active: string;
}) {
  return (
    <nav className={stripClasses}>
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          aria-current={active === tab.key ? "page" : undefined}
          className={cn(tabClasses, active === tab.key ? tabActive : tabInactive)}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
