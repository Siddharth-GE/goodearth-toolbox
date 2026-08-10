import { NavTabs } from "@/components/ui/tabs";

export function RelayNav({ active }: { active: string }) {
  return (
    <NavTabs
      active={active}
      // Projects first: the tool opens on the project picture, and
      // /relay redirects here. Then your own batons, then everyone's.
      tabs={[
        { key: "projects", href: "/relay/projects", label: "Projects" },
        { key: "court", href: "/relay/court", label: "Your court" },
        { key: "trails", href: "/relay/trails", label: "All trails" },
        { key: "sets", href: "/relay/sets", label: "Trail types" },
        { key: "activities", href: "/relay/activities", label: "Activities" },
      ]}
    />
  );
}
