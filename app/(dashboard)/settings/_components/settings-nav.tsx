import { NavTabs } from "@/components/ui/tabs";

export function SettingsNav({ active }: { active: "people" | "roles" | "overview" | "teams" }) {
  return (
    <NavTabs
      active={active}
      tabs={[
        { key: "people", href: "/settings", label: "People" },
        { key: "roles", href: "/settings/roles", label: "Roles" },
        { key: "overview", href: "/settings/overview", label: "Overview" },
        { key: "teams", href: "/settings/teams", label: "Teams" },
      ]}
    />
  );
}
