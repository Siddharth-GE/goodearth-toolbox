import { PageTitle } from "@/components/ui/page-title";
import { requireApp } from "@/lib/auth/access";
import { requireUser } from "@/lib/auth/dal";
import { BirdwingNav } from "./_components/birdwing-nav";

export default async function BirdwingLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  await requireApp(user, "/birdwing");

  return (
    <div className="space-y-4">
      <PageTitle
        title="Birdwing Stays"
        description="Bookings, rooms, invoices and collections at Birdwing Farmstay."
      />
      <BirdwingNav isAdmin={user.profile?.role === "admin"} />
      {children}
    </div>
  );
}
