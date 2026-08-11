import { ThemeIconButton } from "@/components/ui/theme-toggle";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-background relative flex min-h-screen flex-1 items-center justify-center px-4">
      {/* The switch lives here too, not only behind the sign-in — someone
          on a bright site in the sun should be able to fix the screen
          before typing a password into it. */}
      <ThemeIconButton className="absolute top-4 right-4" />
      {children}
    </div>
  );
}
