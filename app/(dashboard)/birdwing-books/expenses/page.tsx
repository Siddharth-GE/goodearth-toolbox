import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Figure } from "@/components/ui/figure";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableFoot,
  TableHead,
  TableHeaderCell,
  TableRow,
  TableTotalCell,
} from "@/components/ui/table";
import { listExpenses, listHeads } from "@/lib/birdwing-books/queries";
import { formatDate, formatMoney, todayInIndia } from "@/lib/format";
import { idParam } from "@/lib/list-params";
import { listVendors } from "@/lib/masters/vendors";
import { Receipt } from "lucide-react";
import { MonthSwitcher, monthParam } from "../_components/month-switcher";
import { ExpenseDialog } from "./expense-dialog";
import { ExpenseRowActions } from "./expense-row-actions";

const money = (value: number) => formatMoney(value, { paise: value % 1 !== 0 });

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; head?: string }>;
}) {
  const params = await searchParams;
  const month = monthParam(params.month, todayInIndia());
  const headId = idParam(params.head);

  const [{ rows, byHead, total }, heads, vendors] = await Promise.all([
    listExpenses(month, headId),
    listHeads(),
    listVendors(true),
  ]);
  const headOptions = heads.filter((head) => head.isActive && !head.isSalary);
  const vendorOptions = vendors.map((vendor) => ({ value: vendor.id, label: vendor.name }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthSwitcher
          month={month}
          hrefFor={(target) =>
            `/birdwing-books/expenses?month=${target}${headId ? `&head=${headId}` : ""}`
          }
        />
        <div className="flex flex-wrap gap-2">
          <LinkButton
            href={`/birdwing-books/expenses/export?month=${month}`}
            variant="secondary"
            size="sm"
            plain
          >
            Download CSV
          </LinkButton>
          <LinkButton href="/birdwing-books/expenses/upload" variant="secondary" size="sm">
            Upload the sheet
          </LinkButton>
          <ExpenseDialog heads={headOptions} vendors={vendorOptions} month={month} />
        </div>
      </div>

      <form action="/birdwing-books/expenses" className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="month" value={month} />
        <div className="w-full space-y-1.5 sm:w-56">
          <Label htmlFor="head-filter">Head</Label>
          <Select id="head-filter" name="head" defaultValue={headId ?? ""}>
            <option value="">Every head</option>
            {heads.map((head) => (
              <option key={head.id} value={head.id}>
                {head.name}
              </option>
            ))}
          </Select>
        </div>
        <Button type="submit" variant="secondary">
          Apply
        </Button>
      </form>

      {rows.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="Nothing recorded for this month"
          description="Add a line, or upload the expenses sheet."
        />
      ) : (
        <>
          <Card className="grid gap-4 p-5 sm:grid-cols-[auto_1fr]">
            <Figure label="Spent" value={money(total)} hint={`${rows.length} lines`} size="hero" />
            <ul className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
              {byHead.map((head) => (
                <li key={head.name} className="flex justify-between gap-3">
                  <span className="text-muted">{head.name}</span>
                  <span className="font-mono">{money(head.amount)}</span>
                </li>
              ))}
            </ul>
          </Card>

          <Table>
            <TableHead>
              <tr>
                <TableHeaderCell>What</TableHeaderCell>
                <TableHeaderCell className="hidden md:table-cell">Paid</TableHeaderCell>
                <TableHeaderCell className="text-right">Amount</TableHeaderCell>
                <TableHeaderCell className="w-px" />
              </tr>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <span className="font-medium">{row.description}</span>
                    <div className="text-muted mt-0.5 text-xs">
                      {[
                        row.headName,
                        row.vendorName ?? row.payee,
                        row.billRef && `bill ${row.billRef}`,
                        row.status === "confirmed" ? "confirmed" : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                    {row.reviewNote && (
                      <div className="text-warning mt-0.5 text-xs">{row.reviewNote}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-muted hidden whitespace-nowrap md:table-cell">
                    {row.spentOn ? formatDate(row.spentOn) : "—"}
                    {row.paymentDetails && (
                      <div className="max-w-56 truncate text-xs">{row.paymentDetails}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono whitespace-nowrap">
                    {money(row.amount)}
                  </TableCell>
                  <TableCell className="py-2">
                    <ExpenseRowActions row={row} heads={headOptions} vendors={vendorOptions} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFoot>
              <tr>
                <TableTotalCell>Total</TableTotalCell>
                <TableTotalCell className="hidden md:table-cell" />
                <TableTotalCell className="text-right font-mono">{money(total)}</TableTotalCell>
                <TableTotalCell />
              </tr>
            </TableFoot>
          </Table>
        </>
      )}
    </div>
  );
}
