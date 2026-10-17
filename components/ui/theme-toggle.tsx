"use client";

import { effectiveTheme, nextTheme, themeCookie } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { IconButton } from "@/components/ui/icon-button";
import { Moon, Sun } from "lucide-react";
import type { ComponentProps } from "react";

/**
 * The light/dark switch. Holds no React state: CSS (`dark:`) shows the right label and icon, so the first server frame is correct
 * and nothing can mismatch on hydration. Setting the attribute on <html> repaints everything, including Radix menus portalled outside this tree.
 */
function flip() {
  const root = document.documentElement;
  const current = effectiveTheme(
    root.dataset.theme,
    window.matchMedia("(prefers-color-scheme: dark)").matches,
  );
  const next = nextTheme(current);

  const apply = () => {
    root.dataset.theme = next;
    // Survives a reload: the root layout's script reads it back before first paint (lib/theme.ts).
    document.cookie = themeCookie(next);
  };

  // Crossfade the page via the view-transition API. Both guards fall through to applying instantly (old browsers, reduced motion);
  // the global reduced-motion block in globals.css cannot do that job: `*` never matches ::view-transition pseudo-elements.
  const start = document.startViewTransition?.bind(document);
  const wantsStillness = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (!start || wantsStillness) {
    apply();
    return;
  }

  start(apply);
}

const inLight = "dark:hidden";
const inDark = "hidden dark:block";

/** For the sidebar's user menu. Stays open on click so the change shows where it was made. */
export function ThemeMenuItem({
  className,
  ...props
}: Omit<ComponentProps<typeof DropdownMenuItem>, "onSelect" | "children">) {
  return (
    <DropdownMenuItem
      onSelect={(event) => {
        event.preventDefault();
        flip();
      }}
      className={className}
      {...props}
    >
      <Moon className={cn("size-4", inLight)} />
      <Sun className={cn("size-4", inDark)} />
      <span className={inLight}>Dark mode</span>
      <span className={inDark}>Light mode</span>
    </DropdownMenuItem>
  );
}

/** For screens with no user menu (login). Icon only, so the label covers both modes. */
export function ThemeIconButton({ className }: { className?: string }) {
  return (
    <IconButton aria-label="Switch between light and dark" onClick={flip} className={className}>
      <Moon className={cn("size-4", inLight)} />
      <Sun className={cn("size-4", inDark)} />
    </IconButton>
  );
}
