import { PageTitle } from "@/components/ui/page-title";
import { formatDate } from "@/lib/format";
import { getPage, requireTuring } from "@/lib/turing/queries";
import { notFound } from "next/navigation";
import { PageFrame } from "./page-frame";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export default async function TuringPageViewer({ params }: { params: Promise<{ id: string }> }) {
  await requireTuring();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const page = await getPage(id);
  if (!page) notFound();
  return (
    <div className="space-y-4">
      <PageTitle
        title={page.title}
        description={`Built by Turing on ${formatDate(page.created_at)}; today's data each time it opens.`}
        backHref="/turing/pages"
        backLabel="Pages"
      />
      <PageFrame id={page.id} title={page.title} />
    </div>
  );
}
