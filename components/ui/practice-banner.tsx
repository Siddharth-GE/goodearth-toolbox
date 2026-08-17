import { isPracticeSite } from "@/lib/environment";

/**
 * A strip across the top of every page on any deployment that is not
 * production.
 *
 * Loud on purpose, and the one place in this app where DESIGN.md's
 * quietness is the wrong instinct. Its whole job is to be noticed by
 * somebody who is not looking for it — a site engineer halfway through
 * raising an indent, who has no reason to check the address bar and no
 * way to tell the two sites apart otherwise.
 *
 * Renders nothing at all on production, so it costs the real site one
 * boolean.
 */
export function PracticeBanner() {
  if (!isPracticeSite()) return null;

  return (
    <div
      // A live region: a screen reader announces it on load rather than
      // leaving it to be discovered somewhere in the page.
      role="status"
      className="bg-warning text-warning-foreground sticky top-0 z-50 flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 px-4 py-1.5 text-center text-sm font-semibold"
    >
      <span>Practice site — nothing here is real.</span>
      <span className="font-normal opacity-90">
        Work done here will not reach anyone. The real toolbox is{" "}
        <a
          href="https://toolbox.goodearthkannur.org"
          className="underline underline-offset-2 hover:no-underline"
        >
          toolbox.goodearthkannur.org
        </a>
        .
      </span>
    </div>
  );
}
