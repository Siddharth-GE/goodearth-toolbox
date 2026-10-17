import { LogOut } from "lucide-react";

export function ExitButton({ action }: { action: () => Promise<void> }) {
  return (
    <form action={action}>
      <button type="submit" className="text-accent flex items-center gap-1.5 text-sm font-medium">
        <LogOut className="size-4" />
        Exit
      </button>
    </form>
  );
}
