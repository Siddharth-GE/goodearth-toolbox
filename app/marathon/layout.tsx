import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Peravoor Marathon 2026",
};

export default function MarathonLayout({ children }: { children: React.ReactNode }) {
  // 480px is deliberate, not arbitrary — Marathon is a single-device
  // kiosk, so the whole app stays phone-width even on a desktop
  // browser. See DESIGN.md's Spacing & radius section before reusing
  // this for a tool that isn't genuinely kiosk-style.
  return <div className="mx-auto min-h-screen max-w-[480px] bg-background">{children}</div>;
}
