import { PageTitle } from "@/components/ui/page-title";
import { requireApp } from "@/lib/auth/access";
import { requireUser } from "@/lib/auth/dal";

export default async function DexterLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  await requireApp(user, "/dexter");

  return (
    <div className="space-y-4">
      <PageTitle
        title="Dexter"
        description="Client presentations as links — upload a deck, send the link."
      />
      {children}
    </div>
  );
}
