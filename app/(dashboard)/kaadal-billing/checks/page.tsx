import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { HealthPill } from "@/components/ui/health-pill";
import { SectionHead } from "@/components/ui/section-head";
import { runChecks, totals } from "@/lib/kaadal-billing/ledger";
import { getLedger } from "@/lib/kaadal-billing/queries";
import { CheckCircle2 } from "lucide-react";
import { TotalsBand } from "../_components/parts";

export default async function ChecksPage() {
  const ledger = await getLedger();
  const checks = runChecks(ledger, ledger.today);
  const bad = checks.filter((c) => c.level === "bad").length;
  const review = checks.length - bad;

  return (
    <div className="space-y-4">
      <TotalsBand totals={totals(ledger, "All")} scope="All plots" />
      {checks.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="All checks passed"
          description="Every payment adds up, no order is overpaid, and every split matches its total."
        />
      ) : (
        <section className="space-y-2.5">
          <SectionHead
            title={`${bad ? `${bad} error${bad > 1 ? "s" : ""}` : "No errors"}${review ? ` · ${review} to review` : ""}`}
            tone={bad ? "danger" : undefined}
            hint="These checks run on every change."
          />
          {checks.map((c, i) => {
            const href = c.orderId
              ? `/kaadal-billing/orders/${c.orderId}${c.paymentId ? `?payment=${c.paymentId}` : ""}`
              : c.vendorId
                ? `/kaadal-billing/vendors/${c.vendorId}`
                : null;
            return (
              <Card
                key={i}
                className="grid gap-x-4 gap-y-2 p-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-start"
              >
                <HealthPill
                  label={c.level === "bad" ? "Error" : "Review"}
                  tone={c.level === "bad" ? "danger" : "warning"}
                />
                <div className="min-w-0 space-y-1.5">
                  <p className="text-foreground text-sm">{c.text}</p>
                  <p className="border-accent bg-background text-foreground/80 rounded-r-lg border-l-2 px-2.5 py-1.5 text-xs">
                    {c.fix}
                  </p>
                </div>
                {href ? (
                  <LinkButton href={href} variant="secondary" size="sm">
                    Open
                  </LinkButton>
                ) : null}
              </Card>
            );
          })}
        </section>
      )}
    </div>
  );
}
