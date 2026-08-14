import { PageTitle } from "@/components/ui/page-title";
import { requireApp } from "@/lib/auth/access";
import { requireUser } from "@/lib/auth/dal";

import { DirectoryNav } from "./_components/directory-nav";

export default async function DirectoryLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  await requireApp(user, "/directory");

  return (
    <div className="space-y-4">
      <PageTitle title="Directory" description="Everyone who works here, and how to reach them." />
      <DirectoryNav isAdmin={user.profile?.role === "admin"} />
      {children}
    </div>
  );
}
