import { PageTitle } from "@/components/ui/page-title";
import { listBrands } from "@/lib/masters/brands";
import { listItemCategories } from "@/lib/masters/item-categories";
import { listMargins } from "@/lib/budgets/queries";
import { MarginsBrowser } from "../_components/margins-browser";

export default async function MarginsPage() {
  const [margins, categories, brands] = await Promise.all([
    listMargins(),
    listItemCategories(),
    listBrands(),
  ]);

  return (
    <div className="space-y-4">
      <PageTitle
        title="Product margins"
        backHref="/budgets/interiors"
        backLabel="All budgets"
        description="The default markup applied when a product is priced. Changing one here only affects pricing done from now on — budgets already priced keep their own figures."
      />

      <MarginsBrowser
        // Only products with a margin are sent up front; the rest are searched on demand (~2,600 items).
        initialMargins={Object.fromEntries(margins)}
        categories={categories.map((category) => ({ id: category.id, name: category.name }))}
        brands={brands.map((brand) => ({ id: brand.id, name: brand.name }))}
      />
    </div>
  );
}
