import { PageTitle } from "@/components/ui/page-title";
import { getSignatureSettings } from "@/lib/bills/signature-queries";
import { SignaturesForm } from "./_components/signatures-form";

export default async function BillSignaturesPage() {
  const settings = await getSignatureSettings();

  return (
    <div className="space-y-4">
      <PageTitle
        title="Signatures"
        description="Printed on every approved bill. Approved by is whoever approved that bill; the other boxes are the people chosen here."
        backHref="/bills"
      />
      <SignaturesForm settings={settings} />
    </div>
  );
}
