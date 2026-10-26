"use server";

import { getMyPlate, plateCount } from "./plate";

/** The sidebar's count, asked for after the page has shown, so no page waits on it. Null when it could not be read. */
export async function readPlateCount(): Promise<number | null> {
  try {
    return plateCount(await getMyPlate());
  } catch (error) {
    console.error("readPlateCount failed:", error);
    return null;
  }
}
