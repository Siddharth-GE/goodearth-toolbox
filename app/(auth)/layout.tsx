import { Wordmark } from "@/components/ui/logo";
import { ThemeIconButton } from "@/components/ui/theme-toggle";

// Outside the app: a full burgundy ground, the Kaadal wordmark, and the form on a white panel.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="ground-burgundy dark:ground-teal bg-ground text-on-ground relative flex min-h-screen flex-1 flex-col items-center justify-center gap-8 px-4 py-12">
      {/* The switch lives here too: someone in bright sun should fix the screen before typing a password. */}
      <ThemeIconButton className="text-on-ground/70 hover:text-on-ground hover:bg-on-ground/10 absolute top-4 right-4" />
      <div className="flex items-end gap-3" role="img" aria-label="Kaadal Toolbox">
        <Wordmark className="fill-ground-mark h-10 sm:h-12" />
        <span className="text-on-ground/75 pb-0.5 text-xs font-medium tracking-[0.14em] uppercase">
          Toolbox
        </span>
      </div>
      <main className="bg-surface-raised text-foreground flex w-full max-w-md justify-center rounded-3xl p-6 sm:p-10">
        {children}
      </main>
      <p className="font-display text-on-ground/70 text-center text-lg italic">
        Designs that grow from the inside out
      </p>
    </div>
  );
}
