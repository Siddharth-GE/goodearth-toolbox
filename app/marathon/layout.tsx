import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Peravoor Marathon 2026",
};

export default function MarathonLayout({ children }: { children: React.ReactNode }) {
  // 480px on purpose: Marathon is a single-device kiosk, phone-width on any browser (DESIGN.md, Spacing & radius).
  return <div className="bg-background mx-auto min-h-screen max-w-[480px]">{children}</div>;
}
