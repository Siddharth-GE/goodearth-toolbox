import { redirect } from "next/navigation";

// Labour contracts became work orders (plan.md B6) — the old address
// still lands somewhere useful.
export default function LabourContractsMoved() {
  redirect("/bills/work-orders");
}
