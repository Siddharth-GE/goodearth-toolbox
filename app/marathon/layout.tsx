import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Peravoor Marathon 2026",
};

export default function MarathonLayout({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto min-h-screen max-w-[480px] bg-background">{children}</div>;
}
