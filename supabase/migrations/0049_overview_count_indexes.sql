-- 0049 — Indexes for the Overview pipeline counts.
--
-- PREVENTATIVE, NOT A FIX. Applying this today will not make anything
-- measurably faster, and the audit that produced it says so plainly.
-- Every table below currently holds under a hundred rows (indents 16,
-- indent_lines 28, purchase_orders 9, bills 4, measured 2026-08-11), and
-- Postgres will keep choosing a sequential scan over any index here
-- until they are far larger. Nothing about the 5.5s LCP lives in these
-- queries — that is cold starts, and no index touches it.
--
-- The reason to add them anyway is that these are the only unindexed
-- predicates on the one page EVERY signed-in person loads. The Overview
-- pipeline (lib/overview/queries.ts) runs thirteen exact head-counts on
-- every visit to "/", and five of them filter on a date column with no
-- index behind it:
--
--   indents.created_at        gte, twice  (queries.ts:39, :49)
--   indent_lines.created_at   gte         (queries.ts:42)
--   purchase_orders.issued_at gte, via po_facts   (queries.ts:80)
--   bills.created_at          gte, via bill_facts (queries.ts:143)
--   bills.paid_at             gte, via bill_facts (queries.ts:153)
--
-- goods_receipts.received_at is deliberately absent: it already has
-- goods_receipts_received_at_idx from 0023. The status columns beside
-- these are all indexed already (indents_status_idx, bills_status_idx,
-- purchase_orders_status_idx), so the date column is the only half of
-- each predicate without support.
--
-- The cost of being wrong in each direction is what settles it: adding
-- five small indexes to tables this size costs nothing now, whereas
-- noticing them for the first time when the homepage has gone slow means
-- diagnosing it under pressure, on the screen with the widest audience.
--
-- Additive and reversible. Safe to apply at any time; safe to leave
-- unapplied. Plain CREATE INDEX rather than CONCURRENTLY on purpose —
-- concurrent builds cannot run inside a transaction block, which is how
-- the Studio SQL editor submits a file, and at these row counts each of
-- these completes in single-digit milliseconds with no meaningful lock.

create index if not exists indents_created_at_idx on indents (created_at);

create index if not exists indent_lines_created_at_idx on indent_lines (created_at);

create index if not exists purchase_orders_issued_at_idx on purchase_orders (issued_at);

create index if not exists bills_created_at_idx on bills (created_at);

create index if not exists bills_paid_at_idx on bills (paid_at);
