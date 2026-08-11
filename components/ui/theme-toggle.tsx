"use client";

import { effectiveTheme, nextTheme, themeCookie } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { IconButton } from "@/components/ui/icon-button";
import { Moon, Sun } from "lucide-react";
import type { ComponentProps } from "react";

/**
 * The light/dark switch.
 *
 * Deliberately holds no React state and takes no props. What it shows is
 * decided by CSS — each label and icon is rendered twice and the `dark:`
 * variant hides one — so it is correct on the server's first frame
 * without knowing anything, and there is nothing to get out of step with
 * the page or to mismatch during hydration.
 *
 * That also means flipping it needs no re-render: setting the attribute
 * on <html> is what changes the page, instantly and everywhere at once,
 * including any Radix menu portalled outside this tree.
 */
function flip() {
  const root = document.documentElement;
  const current = effectiveTheme(
    root.dataset.theme,
    window.matchMedia("(prefers-color-scheme: dark)").matches,
  );
  const next = nextTheme(current);

  const apply = () => {
    // Repaints the page.
    root.dataset.theme = next;
    // Survives the next full load, where the root layout's script reads
    // it back before the first paint. See lib/theme.ts.
    document.cookie = themeCookie(next);
  };

  // Crossfade the whole page rather than snapping it. The browser
  // snapshots before and after and fades between them, which covers
  // everything at once — background, text, borders, and the switch's own
  // icon swapping — for one call and no state.
  //
  // Both guards fall through to applying it instantly, which is the
  // behaviour this replaced: an older browser still gets a working
  // switch, and someone who asked their operating system for stillness
  // gets no animation. The global reduced-motion block in globals.css
  // cannot do that job here — it selects `*`, and these are
  // ::view-transition pseudo-elements, which `*` never matches.
  const start = document.startViewTransition?.bind(document);
  const wantsStillness = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (!start || wantsStillness) {
    apply();
    return;
  }

  start(apply);
}

/** Shown only in light mode — it offers the other one. */
const inLight = "dark:hidden";
/** Shown only in dark mode. */
const inDark = "hidden dark:block";

/**
 * For the user menu in the sidebar. Stays open on click so the change is
 * visible where it was made, rather than the menu vanishing over it.
 */
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

/**
 * For screens with no user menu to hang off — the login page. Icon only,
 * so the label has to cover both modes rather than name the destination.
 */
export function ThemeIconButton({ className }: { className?: string }) {
  return (
    <IconButton aria-label="Switch between light and dark" onClick={flip} className={className}>
      <Moon className={cn("size-4", inLight)} />
      <Sun className={cn("size-4", inDark)} />
    </IconButton>
  );
}
