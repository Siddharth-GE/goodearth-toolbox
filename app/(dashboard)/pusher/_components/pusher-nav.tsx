import { NavTabs } from "@/components/ui/tabs";

export function PusherNav({ active }: { active: string }) {
  return (
    <NavTabs
      active={active}
      // Projects first: the tool opens on the project picture, and
      // /pusher redirects here. Then your own batons, then everyone's.
      tabs={[
        { key: "projects", href: "/pusher/projects", label: "Projects" },
        { key: "court", href: "/pusher/court", label: "Your court" },
        { key: "trails", href: "/pusher/trails", label: "All trails" },
        { key: "activities", href: "/pusher/activities", label: "Activities" },
      ]}
    />
  );
}
