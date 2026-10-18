import { redirect } from "next/navigation";

// Labour contracts became work orders; the old address still lands somewhere useful.
export default function LabourContractsMoved() {
  redirect("/bills/work-orders");
}
