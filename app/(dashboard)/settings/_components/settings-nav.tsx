import { NavTabs } from "@/components/ui/tabs";

/** The section nav Settings screens share — real routes, not panel state. */
export function SettingsNav({ active }: { active: "people" | "overview" }) {
  return (
    <NavTabs
      active={active}
      tabs={[
        { key: "people", href: "/settings", label: "People" },
        { key: "overview", href: "/settings/overview", label: "Overview" },
      ]}
    />
  );
}
