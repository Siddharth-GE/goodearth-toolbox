"use client";

import { cn } from "@/lib/utils";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import type { ComponentProps } from "react";

export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;

export function DropdownMenuContent({
  className,
  sideOffset = 6,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      {/* The menu-in keyframe grows the menu from the corner nearest its
          trigger: it reads Radix's own transform-origin variable. */}
      <DropdownMenuPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          "border-border/60 bg-surface-raised/95 shadow-float animate-menu-in z-50 min-w-40 rounded-xl border p-1 backdrop-blur-xl focus:outline-none",
          className,
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

export function DropdownMenuItem({
  className,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Item>) {
  return (
    <DropdownMenuPrimitive.Item
      className={cn(
        "text-foreground data-[highlighted]:bg-foreground/[0.05] flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm outline-none",
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuSeparator({
  className,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return (
    <DropdownMenuPrimitive.Separator className={cn("bg-border my-1 h-px", className)} {...props} />
  );
}
