import "server-only";

// The one sanctioned exception to "no tool imports another" (CLAUDE.md): Turing presses each tool's
// own save, and only after the admin pressed Save on the proposal. Actions only — never queries or
// screens — each tool's in its own runners file.
import type { EntryKey } from "./catalogue-fields";
import { BILL_RUNNERS } from "./runners/bills";
import { BUSINESS_PLANNING_RUNNERS } from "./runners/business-planning";
import { BIRDWING_RUNNERS } from "./runners/birdwing";
import { BIRDWING_BOOKS_RUNNERS } from "./runners/birdwing-books";
import { CLIENT_RELATIONS_RUNNERS } from "./runners/client-relations";
import { DESIGN_MANAGEMENT_RUNNERS } from "./runners/design-management";
import { DIRECTORY_RUNNERS } from "./runners/directory";
import { SELECTIONS_BUDGETS_RUNNERS } from "./runners/selections-budgets";
import { ESTIMATOR_RATES_RUNNERS } from "./runners/estimator-rates";
import { ESTIMATOR_ESTIMATES_RUNNERS } from "./runners/estimator-estimates";
import { INDENT_RUNNERS } from "./runners/indents";
import { INVENTORY_RUNNERS } from "./runners/inventory";
import { MASTERS_RUNNERS } from "./runners/masters";
import { MONEY_RUNNERS } from "./runners/money";
import { CASH_REQUEST_RUNNERS } from "./runners/cash-requests";
import { PO_RUNNERS } from "./runners/purchase-orders";
import { RELAY_RUNNERS } from "./runners/relay";
import { REPORTER_DEXTER_RUNNERS } from "./runners/reporter-dexter";
import { SAARANG_COLLECTIONS_RUNNERS } from "./runners/saarang-collections";
import type { Runners } from "./runners/kit";
import { SUPERVISOR_RUNNERS } from "./runners/supervisors";
import { SUPERVISORS_SITE_RUNNERS } from "./runners/supervisors-site";
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
  ...DESIGN_MANAGEMENT_RUNNERS,
  ...SELECTIONS_BUDGETS_RUNNERS,
  ...ESTIMATOR_RATES_RUNNERS,
  ...ESTIMATOR_ESTIMATES_RUNNERS,
  ...RELAY_RUNNERS,
  ...DIRECTORY_RUNNERS,
  ...SUPERVISORS_SITE_RUNNERS,
  ...MONEY_RUNNERS,
  ...CASH_REQUEST_RUNNERS,
  ...BUSINESS_PLANNING_RUNNERS,
  ...REPORTER_DEXTER_RUNNERS,
  ...SAARANG_COLLECTIONS_RUNNERS,
};
