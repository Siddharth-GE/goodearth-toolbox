import { LogOut } from "lucide-react";

// Shared by every screen with an Exit action (entry, list, admin) — no
// client interactivity needed, the submit just posts to a server action.
export function ExitButton({ action }: { action: () => Promise<void> }) {
  return (
    <form action={action}>
      <button type="submit" className="flex items-center gap-1.5 text-sm font-medium text-accent">
        <LogOut className="size-4" />
        Exit
      </button>
    </form>
  );
}
