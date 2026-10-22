/** What each work category belongs to (0131's CHECK holds the same five, in this order). */
export const WORK_FAMILIES = [
  "Site Mobilisation",
  "Infrastructure - Civil",
  "Infrastructure - MEP",
  "Buildings",
  "Maintenance",
] as const;
export type WorkFamily = (typeof WORK_FAMILIES)[number];

export const isWorkFamily = (value: string): value is WorkFamily =>
  (WORK_FAMILIES as readonly string[]).includes(value);
