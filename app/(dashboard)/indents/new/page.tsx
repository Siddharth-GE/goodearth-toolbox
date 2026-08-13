import { PageTitle } from "@/components/ui/page-title";
import { getIndentFormOptions } from "@/lib/indents/queries";
import { IndentForm } from "./_components/indent-form";

export default async function NewIndentPage() {
  const options = await getIndentFormOptions();

  return (
    <div className="space-y-4">
      <PageTitle
        title="New indent"
        backHref="/indents/list"
        backLabel="All indents"
        description="Say where the materials are needed. The number is minted on create — items are added on the indent itself."
      />
      <IndentForm options={options} />
    </div>
  );
}
