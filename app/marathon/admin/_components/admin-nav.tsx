import { adminLogout } from "@/lib/marathon/actions";
import { cn } from "@/lib/utils";
import Link from "next/link";

export function AdminNav({ active }: { active: "members" | "groups" }) {
  return (
    <div className="mb-5 flex items-center justify-between">
      <div className="flex gap-2">
        <Link
          href="/marathon/admin/members"
          className={cn(
            "rounded-full border px-3.5 py-1.5 text-sm font-medium",
            active === "members" ? "border-accent bg-accent text-accent-foreground" : "border-border text-foreground",
          )}
        >
          Members
        </Link>
        <Link
          href="/marathon/admin/groups"
          className={cn(
            "rounded-full border px-3.5 py-1.5 text-sm font-medium",
            active === "groups" ? "border-accent bg-accent text-accent-foreground" : "border-border text-foreground",
          )}
        >
          Groups
        </Link>
      </div>
      <form action={adminLogout}>
        <button type="submit" className="text-sm font-medium text-accent">
          Exit
        </button>
      </form>
    </div>
  );
}
