import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { LinkButton } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import { listMixes } from "@/lib/estimator/mixes-queries";
import { listUomNames } from "@/lib/estimator/shared";
import { Blend } from "lucide-react";
import Link from "next/link";
import { MixFormDialog } from "./_components/mix-forms";

export default async function MixesPage() {
  const [mixes, uoms] = await Promise.all([listMixes(), listUomNames()]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="max-w-2xl">
          <p className="text-muted text-xs font-semibold tracking-widest uppercase">Mixes</p>
          <p className="text-muted mt-1 text-sm">
            A recipe several works share — M20 concrete, cement mortar. Set what goes into one unit
            of it once, and every work using it follows. Change the mix later and every estimate
            updates.
          </p>
        </div>
        <MixFormDialog uoms={uoms} />
      </div>

      {mixes.length === 0 ? (
        <EmptyState
          icon={Blend}
          title="No mixes yet"
          description="Add M20 concrete or a mortar, then say what goes into one unit of it."
        />
      ) : (
        <Card className="p-4">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Mix</TableHeaderCell>
                <TableHeaderCell>Per</TableHeaderCell>
                <TableHeaderCell>Materials</TableHeaderCell>
                <TableHeaderCell>Used by</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell></TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {mixes.map((mix) => (
                <TableRow key={mix.id}>
                  <TableCell className="text-foreground font-medium">
                    <Link href={`/estimator/mixes/${mix.id}`} className="hover:underline">
                      {mix.name}
                    </Link>
                    {mix.description && (
                      <span className="text-muted block text-xs">{mix.description}</span>
                    )}
                  </TableCell>
                  <TableCell>{mix.uom}</TableCell>
                  <TableCell>
                    {mix.componentCount === 0 ? (
                      <Badge variant="warning">Nothing in it yet</Badge>
                    ) : (
                      `${mix.componentCount} ${mix.componentCount === 1 ? "material" : "materials"}`
                    )}
                  </TableCell>
                  <TableCell>
                    {mix.useCount === 0
                      ? "—"
                      : `${mix.useCount} ${mix.useCount === 1 ? "work" : "works"}`}
                  </TableCell>
                  <TableCell>
                    <Badge variant={mix.isActive ? "success" : "neutral"}>
                      {mix.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {/* The visible door in. The name link alone was missed by
                        the first real user — "cant edit a mix" meant this. */}
                    <div className="flex justify-end">
                      <LinkButton href={`/estimator/mixes/${mix.id}`} variant="ghost" size="sm">
                        Edit
                      </LinkButton>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
