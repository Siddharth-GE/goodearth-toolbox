/** What a day's labour or an issue of material was for (0132): the job itself, extra work, or work done again. */
export const WORK_CLASSES = ["standard", "additional", "rework"] as const;
export type WorkClass = (typeof WORK_CLASSES)[number];

export const WORK_CLASS_LABEL: Record<WorkClass, string> = {
  standard: "Standard work",
  additional: "Additional work",
  rework: "Rework",
};

export const isWorkClass = (value: string): value is WorkClass =>
  (WORK_CLASSES as readonly string[]).includes(value);

/** A form's work class: blank is standard, anything else unknown is refused by the caller. */
export const workClassOf = (value: string | null | undefined): WorkClass | null =>
  !value ? "standard" : isWorkClass(value) ? value : null;
