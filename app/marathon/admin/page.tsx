import { verifyAdminPinAction } from "@/lib/marathon/actions";
import { getAdminSession } from "@/lib/marathon/session";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PinPad } from "../_components/pin-pad";

export default async function MarathonAdminPage() {
  const session = await getAdminSession();
  if (session) redirect("/marathon/admin/entries");

  return (
    <div className="px-7 py-14 text-center">
      <h1 className="text-foreground text-xl font-bold">Admin</h1>
      <p className="text-muted mt-1 text-sm">Enter the admin PIN</p>

      <PinPad action={verifyAdminPinAction} />

      <Link
        href="/marathon"
        className="text-accent mt-6 inline-flex items-center gap-1.5 text-sm font-medium"
      >
        <ArrowLeft className="size-4" />
        Back
      </Link>
    </div>
  );
}
