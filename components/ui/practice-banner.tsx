import { isPracticeSite, PRODUCTION_SITE } from "@/lib/environment";

/**
 * A strip across every page on any deployment that is not production. Loud on purpose, the one place DESIGN.md's quietness is wrong:
 * someone mid-indent must notice it. Renders nothing on production.
 */
export function PracticeBanner() {
  if (!isPracticeSite()) return null;

  return (
    <div
      // A live region: a screen reader announces it on load.
      role="status"
      className="bg-warning text-warning-foreground sticky top-0 z-50 flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 px-4 py-1.5 text-center text-sm font-semibold"
    >
      <span>Practice site — nothing here is real.</span>
      <span className="font-normal opacity-90">
        Work done here will not reach anyone. The real toolbox is{" "}
        <a
          href={`https://${PRODUCTION_SITE}`}
          className="underline underline-offset-2 hover:no-underline"
        >
          {PRODUCTION_SITE}
        </a>
        .
      </span>
    </div>
  );
}
