import { getWelcomeCounts } from "@/lib/kaadal-billing/queries";
import { ToolWelcome } from "../_components/tool-welcome";

// The welcome screen. Counts only — the rupees are one click in.
export default async function KaadalBillingPage() {
  const counts = await getWelcomeCounts();

  return (
    <ToolWelcome
      icon="Wallet"
      intro={[
        "Every vendor order for the Kaadal plots, and what has been paid on it, by Kaadal or by the client. Record a payment as it is made; a payment for one order can be shared across its plots, put on one plot, or split by amount.",
        "Plots shows each plot's balance vendor by vendor, Vendors keeps their bank details to copy, and Checks lists anything that doesn't add up. Export to Excel gives the whole ledger as a workbook.",
      ]}
      stats={[
        { label: "Orders open", value: counts.open, hint: `of ${counts.orders}` },
        { label: "Vendors", value: counts.vendors },
        { label: "Checks to review", value: counts.review, hint: "on the Checks tab" },
      ]}
      links={[
        { label: "Orders", href: "/kaadal-billing/orders", primary: true },
        { label: "Payments", href: "/kaadal-billing/payments" },
        { label: "Plots", href: "/kaadal-billing/plots" },
        { label: "Vendors", href: "/kaadal-billing/vendors" },
        { label: "Checks", href: "/kaadal-billing/checks" },
      ]}
    />
  );
}
