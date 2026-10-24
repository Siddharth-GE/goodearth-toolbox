import "server-only";

// The one sanctioned exception to "no tool imports another" (CLAUDE.md): Turing presses each tool's
// own save, and only after the admin pressed Save on the proposal. Actions only — never queries or
// screens — each tool's in its own runners file.
import type { EntryKey } from "./catalogue-fields";
import { INDENT_RUNNERS } from "./runners/indents";
import { MASTERS_RUNNERS } from "./runners/masters";
import type { Runners } from "./runners/kit";
import { SUPERVISOR_RUNNERS } from "./runners/supervisors";

/** Every entry's runner: the type refuses an entry without one. */
export const RUNNERS: Runners<EntryKey> = {
  ...SUPERVISOR_RUNNERS,
  ...MASTERS_RUNNERS,
  ...INDENT_RUNNERS,
};
