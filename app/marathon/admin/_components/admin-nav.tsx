import { adminLogout } from "@/lib/marathon/actions";
import { cn } from "@/lib/utils";
import Link from "next/link";

const TABS = [
  { key: "entries", href: "/marathon/admin/entries", label: "Entries" },
  { key: "members", href: "/marathon/admin/members", label: "Members" },
  { key: "groups", href: "/marathon/admin/groups", label: "Groups" },
] as const;

export function AdminNav({ active }: { active: "entries" | "members" | "groups" }) {
  return (
    <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background/95 px-5 py-4 backdrop-blur">
      <div className="flex gap-2">
        {TABS.map((tab) => (
          <Link
            key={tab.key}
            href={tab.href}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-sm font-medium",
              active === tab.key
                ? "border-accent bg-accent text-accent-foreground"
                : "border-border text-foreground",
            )}
          >
            {tab.label}
          </Link>
        ))}
      </div>
      <form action={adminLogout}>
        <button type="submit" className="text-sm font-medium text-accent">
          Exit
        </button>
      </form>
    </div>
  );
}
