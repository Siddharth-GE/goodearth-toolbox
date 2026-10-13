import { PageTitle } from "@/components/ui/page-title";
import { requireApp } from "@/lib/auth/access";
import { requireUser } from "@/lib/auth/dal";
import { BooksNav } from "./_components/books-nav";

export default async function BirdwingBooksLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  await requireApp(user, "/birdwing-books");

  return (
    <div className="space-y-4">
      <PageTitle
        title="Birdwing Books"
        description="Birdwing's expenses, staff attendance and salaries."
      />
      <BooksNav isAdmin={user.profile?.role === "admin"} />
      {children}
    </div>
  );
}
