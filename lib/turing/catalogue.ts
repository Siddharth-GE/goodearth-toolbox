import "server-only";

// The one sanctioned exception to "no tool imports another" (CLAUDE.md): Turing presses each tool's
// own save, and only after the admin pressed Save on the proposal. Actions only — never queries or
// screens — each tool's in its own runners file.
import type { EntryKey } from "./catalogue-fields";
import { BILL_RUNNERS } from "./runners/bills";
import { BIRDWING_RUNNERS } from "./runners/birdwing";
import { BIRDWING_BOOKS_RUNNERS } from "./runners/birdwing-books";
import { CLIENT_RELATIONS_RUNNERS } from "./runners/client-relations";
import { INDENT_RUNNERS } from "./runners/indents";
import { INVENTORY_RUNNERS } from "./runners/inventory";
import { MASTERS_RUNNERS } from "./runners/masters";
import { PO_RUNNERS } from "./runners/purchase-orders";
import type { Runners } from "./runners/kit";
import { SUPERVISOR_RUNNERS } from "./runners/supervisors";
import { WORK_ORDER_RUNNERS } from "./runners/work-orders";

/** Every entry's runner: the type refuses an entry without one. */
export const RUNNERS: Runners<EntryKey> = {
  ...SUPERVISOR_RUNNERS,
  ...MASTERS_RUNNERS,
  ...INDENT_RUNNERS,
  ...PO_RUNNERS,
  ...INVENTORY_RUNNERS,
  ...WORK_ORDER_RUNNERS,
  ...BILL_RUNNERS,
  ...CLIENT_RELATIONS_RUNNERS,
  ...BIRDWING_RUNNERS,
  ...BIRDWING_BOOKS_RUNNERS,
};
