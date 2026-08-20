# TODO — what's next

Only the next build lives here (founder, 2026-08-20: this page holds Phase 2 and nothing else). What exists is `STATUS.md`, the rules are `CLAUDE.md`, history is git.

## Phase 2 — Supervisors and over-issue warnings

Founder go-ahead given 2026-08-20. Sketches are in `plan.md` (Phase 2 section); a short plan gets the founder's approval before building starts, and everything lands on staging for the founder's vet before production.

**Prerequisite data task (Masters):** enter the construction raw materials as `kind='material'` items and link each estimator material to its item on the Estimator's Materials screen — unlinked materials cannot feed requests or comparisons.

- **Supervisors app** (`/supervisors`, phone-first): labour logs per plot + work + contractor (`vendors.is_contractor`), a per-work view of the materials issued to the plot, and a "Request an issue" button (plot, work, item, qty → requested / fulfilled / declined) feeding the store-keeper's queue and pre-filling the issue form. Needs: a new grant in both `*_apps_app_known` CHECKs, `lib/tools.ts` registration, the slug added to `estimate_takeoff_facts`' WHERE and its manifest row, and a catalogue-route entry if it picks items.
- **Over-issue warnings**: flag, never refuse. `recordStockIssue` completes the write and answers success-with-a-warning when cumulative issues for a plot + work pass the official takeoff (the arithmetic is `lib/estimator/compare.ts`, already on screen), and the flag is surfaced to the estimate's submitter on the Estimator welcome and the comparison card.
