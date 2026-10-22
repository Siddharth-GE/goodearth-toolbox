// Pure. site_checklists_guard (0134) holds the same rule: sign-off needs every item answered and a
// remark on each Fail and N/A; a signed-off checklist never changes.

export const CHECK_STATUSES = ["pass", "fail", "na"] as const;
export type CheckAnswer = (typeof CHECK_STATUSES)[number];
export type CheckStatus = CheckAnswer | "not_checked";

export const CHECK_STATUS_LABEL: Record<CheckStatus, string> = {
  not_checked: "Not checked",
  pass: "Pass",
  fail: "Fail",
  na: "N/A",
};

export function checkStatusOf(value: unknown): CheckStatus | null {
  return value === "not_checked" || CHECK_STATUSES.includes(value as CheckAnswer)
    ? (value as CheckStatus)
    : null;
}

type ItemAnswer = { status: CheckStatus; remarks: string | null };

export function needsRemark(item: ItemAnswer): boolean {
  return (item.status === "fail" || item.status === "na") && !item.remarks?.trim();
}

export function signOffProblem(items: ItemAnswer[]): string | undefined {
  if (items.length === 0) return "This checklist has no items to answer.";
  const open = items.filter((item) => item.status === "not_checked").length;
  if (open > 0) {
    return `Answer every item before signing off — ${open} ${open === 1 ? "is" : "are"} not checked yet.`;
  }
  if (items.some(needsRemark)) {
    return "Say what was found, or why it does not apply, on every Fail and N/A.";
  }
  return undefined;
}

export function checklistProgress(items: ItemAnswer[]): {
  answered: number;
  total: number;
  failed: number;
} {
  return {
    answered: items.filter((item) => item.status !== "not_checked").length,
    total: items.length,
    failed: items.filter((item) => item.status === "fail").length,
  };
}
