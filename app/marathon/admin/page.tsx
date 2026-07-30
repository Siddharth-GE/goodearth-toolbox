import { getAdminSession } from "@/lib/marathon/session";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminPinPad } from "./_components/admin-pin-pad";

export default async function MarathonAdminPage() {
  const session = await getAdminSession();
  if (session) redirect("/marathon/admin/members");

  return (
    <div className="px-7 py-14 text-center">
      <h1 className="text-xl font-bold text-foreground">Admin</h1>
      <p className="mt-1 text-sm text-muted">Enter the admin PIN</p>

      <AdminPinPad />

      <Link href="/marathon" className="mt-6 inline-block text-sm font-medium text-accent">
        Back
      </Link>
    </div>
  );
}
