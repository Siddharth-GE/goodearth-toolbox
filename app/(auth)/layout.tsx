import { ThemeIconButton } from "@/components/ui/theme-toggle";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-background relative flex min-h-screen flex-1 items-center justify-center px-4">
      {/* The switch lives here too: someone in bright sun should fix the screen before typing a password. */}
      <ThemeIconButton className="absolute top-4 right-4" />
      {children}
    </div>
  );
}
