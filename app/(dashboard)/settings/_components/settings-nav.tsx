import { NavTabs } from "@/components/ui/tabs";

/** The section nav Settings screens share — real routes, not panel state. */
export function SettingsNav({ active }: { active: "people" | "roles" | "overview" }) {
  return (
    <NavTabs
      active={active}
      tabs={[
        { key: "people", href: "/settings", label: "People" },
        { key: "roles", href: "/settings/roles", label: "Roles" },
        { key: "overview", href: "/settings/overview", label: "Overview" },
      ]}
    />
  );
}
