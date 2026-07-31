import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/table";
import { listBrands } from "@/lib/masters/brands";
import { listItemCategories } from "@/lib/masters/item-categories";
import { BrandForm } from "./_components/brand-form";
import { CategoryForm } from "./_components/category-form";

export default async function CategoriesPage() {
  const [categories, brands] = await Promise.all([listItemCategories(), listBrands()]);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="space-y-4 p-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted">Categories</p>
        </div>
        <CategoryForm />
        {categories.length > 0 && (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Name</TableHeaderCell>
                <TableHeaderCell>Kind</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {categories.map((category) => (
                <TableRow key={category.id}>
                  <TableCell className="font-medium text-foreground">{category.name}</TableCell>
                  <TableCell className="capitalize">{category.kind}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Card className="space-y-4 p-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted">Brands</p>
        </div>
        <BrandForm />
        {brands.length > 0 && (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Name</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {brands.map((brand) => (
                <TableRow key={brand.id}>
                  <TableCell className="font-medium text-foreground">{brand.name}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
