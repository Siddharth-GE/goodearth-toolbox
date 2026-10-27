import { PageTitle } from "@/components/ui/page-title";
import { requireApp } from "@/lib/auth/access";
import { requireUser } from "@/lib/auth/dal";
import { CollectionsNav } from "./_components/collections-nav";

export default async function SaarangCollectionsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  await requireApp(user, "/saarang-collections");

  return (
    <div className="space-y-4">
      <PageTitle
        title="Saarang Collections"
        description="The monthly Saarang collection meeting, from the Zoho exports."
      />
      <CollectionsNav />
      {children}
    </div>
  );
}
