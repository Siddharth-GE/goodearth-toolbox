import { NavTabs } from "@/components/ui/tabs";

export function PusherNav({ active }: { active: string }) {
  return (
    <NavTabs
      active={active}
      tabs={[
        { key: "court", href: "/pusher", label: "Your court" },
        { key: "trails", href: "/pusher/trails", label: "All trails" },
        { key: "activities", href: "/pusher/activities", label: "Activities" },
      ]}
    />
  );
}
