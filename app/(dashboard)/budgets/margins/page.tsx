import { listBrands } from "@/lib/masters/brands";
import { listItemCategories } from "@/lib/masters/item-categories";
import { listMargins } from "@/lib/budgets/queries";
import Link from "next/link";
import { MarginsBrowser } from "../_components/margins-browser";

export default async function MarginsPage() {
  const [margins, categories, brands] = await Promise.all([
    listMargins(),
    listItemCategories(),
    listBrands(),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <Link href="/budgets" className="text-muted hover:text-foreground text-xs font-medium">
          ← All budgets
        </Link>
        <h1 className="text-foreground mt-1 text-lg font-bold tracking-tight">Product margins</h1>
        <p className="text-muted text-sm">
          The default markup applied when a product is priced. Changing one here only affects
          pricing done from now on — budgets already priced keep their own figures.
        </p>
      </div>

      <MarginsBrowser
        // Only products that already have a margin are sent up front; the
        // rest are searched for on demand. Shipping all 2,600 to the
        // browser to fill in a handful of fields would be the slow way.
        initialMargins={Object.fromEntries(margins)}
        categories={categories.map((category) => ({ id: category.id, name: category.name }))}
        brands={brands.map((brand) => ({ id: brand.id, name: brand.name }))}
      />
    </div>
  );
}
