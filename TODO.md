# TODO

Phase 9 has no approved plan yet — read `STATUS.md` first; its "Next
up" list holds the loose ends and Phase 9's shape (Overview fully real

- one real project run end to end). This file gets the Phase 9 build
  plan once the founder approves one.

## Structure pass (from the 2026-08-04 architecture audit)

The audit's bucket C — approved for a session of its own, not mixed
into feature work. Leaks and speed (buckets A and B) were fixed on
`feature/audit-fixes` the same day. In order:

1. **Give Overview its own module** — new `lib/overview/queries.ts`
   owning the four `count*Pipeline` reads (parked today in
   bills/indents/inventory/purchase-orders `queries.ts`, each ungated
   and consumed only by
   `app/(dashboard)/_components/operations-pipeline.tsx`) and the
   Marathon home read (`marathon-live-card.tsx` currently routes a
   service-role read through the dashboard). Clears the worst
   coupling: the home page imports five tools' internals.
2. **Move `lib/selections/catalogue.ts` → `lib/masters/catalogue.ts`**
   — 24 lines of types + a constant; 4 of its 5 consumers are outside
   Selections, including shared
   `components/masters/catalogue-picker.tsx`, which transitively
   couples Budgets, Indents and Inventory to Selections.
3. **Move `getPoReceipts`/`PoReceiptRow` out of
   `lib/inventory/queries.ts`** into `lib/purchase-orders/queries.ts`
   — it's gated on `/purchase-orders` and consumed only by the PO
   detail page; its own docstring admits it.
4. **Move Marathon-only components out of `components/ui`** —
   `animated-reveal.tsx` and `page-header.tsx` are consumed only under
   `app/marathon/`; they belong in `app/marathon/_components/`.
5. **Split `lib/inventory/queries.ts` (~1,600 lines)** into
   `receipts.ts` / `stock.ts` / `issues.ts` plus shared lookups —
   the split Budgets already made (`queries.ts` / `construction.ts`).
6. **Migrate Selections onto the shared catalogue-picker** (long in
   the backlog; the largest duplication in the tree, 421 vs 330
   lines).
7. **Pagination on the unbounded lists** — `/selections` (every unit
   with embedded selections) and `/masters/units` first; the shared
   `<Pagination>` already does N-of-M and URL paging.
8. **Unify `loading.tsx`** into one shared `<PageLoading />` — two
   divergent spinner layouts across 15 near-identical files (inventory
   jumps differently from every other tool).

## Smaller, any session

- PO-anchor picker in the Bills record form: move to server-side
  search (the `/api/catalogue` route-handler pattern) once the PO list
  makes the form payload noticeable — it currently ships every
  issued/completed PO.
- `lib/selections/views.ts` moves to `lib/design-views/` the moment a
  third consumer appears (verified 2026-08-04: still two — Selections
  and the Budgets quote).
