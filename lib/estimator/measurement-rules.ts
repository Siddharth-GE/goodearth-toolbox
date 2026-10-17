import { TEXT_LIMIT } from "./limits";

/** One rule for a row typed on the sheet and a row the SketchUp model sends (0118): the model can never write a row a person could not type. */

export type MeasurementFields = {
  description: string | null;
  nos: number | null;
  length: number | null;
  breadth: number | null;
  depth: number | null;
};

/** Blank is "not used"; anything typed must be a number above zero, and a row must measure something. */
export function checkMeasurement(fields: MeasurementFields): string | undefined {
  const boxes = [
    ["Nos", fields.nos],
    ["Length", fields.length],
    ["Breadth", fields.breadth],
    ["Depth", fields.depth],
  ] as const;
  for (const [label, value] of boxes) {
    if (value !== null && (!Number.isFinite(value) || value <= 0)) {
      return `${label} must be a number more than zero, or left blank.`;
    }
  }
  if (boxes.every(([, value]) => value === null)) {
    return "Enter at least one of number, length, breadth or depth.";
  }
  if (fields.description && fields.description.length > TEXT_LIMIT) {
    return "That description is too long.";
  }
  return undefined;
}
