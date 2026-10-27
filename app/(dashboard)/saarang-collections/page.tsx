import { formatDate } from "@/lib/format";
import { getWelcomeCounts } from "@/lib/saarang-collections/queries";
import { ToolWelcome } from "../_components/tool-welcome";

// The welcome screen. Counts and dates only — the rupees are one click in.
export default async function SaarangCollectionsPage() {
  const counts = await getWelcomeCounts();

  return (
    <ToolWelcome
      icon="Banknote"
      intro={[
        "The Saarang collection meeting, worked out from Zoho. Each month, export the eight reports — payments received, outstanding invoices, sold units and milestones, for Plot and for Villa — and drop them in. The summary fills itself; the shaded figures are typed by hand.",
        "Click any calculated figure to see the rows behind it, and what was left out of it. Download Excel gives the meeting's sheet with its supporting rows.",
      ]}
      stats={[
        {
          label: "Reports loaded",
          value: counts.reportsLoaded,
          hint: counts.reportDate ? `of 8, as of ${formatDate(counts.reportDate)}` : "of 8",
        },
        { label: "Receipts left out", value: counts.excludedReceipts, hint: "on the rules" },
        { label: "Corrections", value: counts.corrections, hint: "to milestones" },
        { label: "Units added by hand", value: counts.extraUnits, hint: "sold, missing from Zoho" },
      ]}
      links={[
        { label: "Summary", href: "/saarang-collections/summary", primary: true },
        { label: "Reports", href: "/saarang-collections/reports" },
        { label: "Rules", href: "/saarang-collections/rules" },
      ]}
    />
  );
}
