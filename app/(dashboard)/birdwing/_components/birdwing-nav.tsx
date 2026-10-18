import { ToolNav } from "@/components/ui/tool-nav";

// Settings shows to admins only: every write there is admin-only (0115), so the tab would only turn others away.
const TABS = [
  { key: "calendar", href: "/birdwing/calendar", label: "Calendar" },
  { key: "stays", href: "/birdwing/stays", label: "Stays" },
  { key: "review", href: "/birdwing/review", label: "Review" },
] as const;

const SETTINGS = { key: "settings", href: "/birdwing/settings", label: "Settings" } as const;

export function BirdwingNav({ isAdmin }: { isAdmin: boolean }) {
  return (
    <ToolNav root="/birdwing" tabs={isAdmin ? [...TABS, SETTINGS] : TABS} defaultKey="stays" />
  );
}
