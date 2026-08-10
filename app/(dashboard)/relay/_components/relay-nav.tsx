import { NavTabs } from "@/components/ui/tabs";
import { Settings2 } from "lucide-react";
import Link from "next/link";

/**
 * The three places you actually work, plus a gear for the two you set up
 * once and rarely touch again.
 *
 * Activities and trail types are vocabulary, not work. Sitting them
 * beside Projects and Your court gave five tabs of equal weight and made
 * the daily ones harder to find — so they nest behind the gear, which is
 * the whole point of the hierarchy the founder asked for.
 */
export function RelayNav({ active }: { active: string }) {
  const inSetup = active === "activities" || active === "sets";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <NavTabs
        active={active}
        tabs={[
          { key: "projects", href: "/relay/projects", label: "Projects" },
          { key: "court", href: "/relay/court", label: "Your court" },
          { key: "trails", href: "/relay/trails", label: "All trails" },
        ]}
      />
      <Link
        href="/relay/sets"
        aria-label="Set up activities and trail types"
        aria-current={inSetup ? "page" : undefined}
        title="Activities and trail types"
        className={
          inSetup
            ? "border-accent bg-accent text-accent-foreground focus-visible:ring-accent ml-auto grid size-9 place-items-center rounded-full border outline-none focus-visible:ring-2"
            : "border-border text-muted hover:text-foreground focus-visible:ring-accent ml-auto grid size-9 place-items-center rounded-full border outline-none focus-visible:ring-2"
        }
      >
        <Settings2 className="size-4" />
      </Link>
    </div>
  );
}

/** The two setup screens, shown only once you are inside one of them. */
export function RelaySetupNav({ active }: { active: string }) {
  return (
    <NavTabs
      active={active}
      tabs={[
        { key: "sets", href: "/relay/sets", label: "Trail types" },
        { key: "activities", href: "/relay/activities", label: "Activities & departments" },
      ]}
    />
  );
}
