/**
 * Reading Birdwing's forms — pure, so the rules a person meets when a
 * form refuses them are tested without a database. Each returns the
 * cleaned value or a sentence saying what is wrong.
 *
 * Import-free but for the shared vocabulary: "use server" files import it.
 */
import { CHANNELS, STAY_USES, oneOf, type Channel, type StayUse } from "./shared";

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

const ok = <T>(value: T): Parsed<T> => ({ ok: true, value });
const no = <T>(error: string): Parsed<T> => ({ ok: false, error });

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A real YYYY-MM-DD date — 2026-02-31 is not one. */
export function isRealDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** Arrival and departure; equal is a day visit, earlier is a mistake. */
export function parseStayDates(
  arrival: string,
  departure: string,
): Parsed<{ arrival: string; departure: string }> {
  if (!isRealDate(arrival)) return no("Pick the arrival date.");
  if (!isRealDate(departure)) return no("Pick the departure date.");
  if (departure < arrival) return no("Departure can't be before arrival.");
  if (Date.parse(departure) - Date.parse(arrival) > 90 * 86_400_000) {
    return no("A stay longer than 90 nights looks like a typing slip — check the dates.");
  }
  return ok({ arrival, departure });
}

/** A room's nights: at least one, inside the stay. */
export function parseRoomNights(
  from: string,
  to: string,
  stay: { arrival: string; departure: string },
): Parsed<{ from: string; to: string }> {
  if (!isRealDate(from) || !isRealDate(to))
    return no("Pick the room's first night and the day they leave.");
  if (to <= from)
    return no("A room needs at least one night — the leaving day comes after the first night.");
  if (from < stay.arrival || to > stay.departure) {
    return no(
      "The room's nights must fall within the stay's dates. Change the stay's dates first.",
    );
  }
  return ok({ from, to });
}

/**
 * A count of people or things: blank is 0, junk or a negative is refused.
 */
export function parseCount(raw: string, label: string, max = 500): Parsed<number> {
  const cleaned = raw.trim();
  if (!cleaned) return ok(0);
  const value = Number(cleaned);
  if (!Number.isInteger(value) || value < 0) return no(`${label} must be a whole number.`);
  if (value > max) return no(`${label} looks too large — check it.`);
  return ok(value);
}

/**
 * Rupees as people type them ("1,20,000", "₹ 450"). Blank is `blank`
 * (0 or null, the caller's choice); paise beyond two places are refused.
 */
export function parseRupees<B extends number | null>(
  raw: string,
  label: string,
  options: { blank: B; positive?: boolean },
): Parsed<number | B> {
  const cleaned = raw.replace(/[,\s₹]/g, "");
  if (!cleaned) return ok(options.blank);
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned))
    return no(`${label}: type an amount like 4500 or 4500.50.`);
  const value = Number(cleaned);
  if (value < 0) return no(`${label} can't be negative.`);
  if (options.positive && value === 0) return no(`${label} must be more than zero.`);
  if (value > 99_99_99_999) return no(`${label} looks too large — check it.`);
  return ok(value);
}

/** A quantity on a charge line: more than zero, two decimals at most. */
export function parseQty(raw: string): Parsed<number> {
  const cleaned = raw.replace(/[,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned) || Number(cleaned) <= 0) {
    return no("Quantity must be more than zero, like 2 or 1.5.");
  }
  return ok(Number(cleaned));
}

export function parseGstPct(raw: string): Parsed<number> {
  const cleaned = raw.replace(/[%\s]/g, "");
  if (!cleaned) return ok(0);
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0 || value > 28)
    return no("GST must be between 0 and 28%.");
  return ok(value);
}

export function parseUse(raw: string): Parsed<StayUse> {
  const use = oneOf(STAY_USES, raw);
  return use ? ok(use) : no("Say who the stay is for.");
}

export function parseChannel(raw: string): Parsed<Channel> {
  const channel = oneOf(CHANNELS, raw || "direct");
  return channel ? ok(channel) : no("Pick how the stay was booked.");
}

/** "YYYY-MM" to the first of the month, as the database stores it. */
export function parseMonth(raw: string): Parsed<string> {
  if (!/^\d{4}-\d{2}$/.test(raw) || !isRealDate(`${raw}-01`)) return no("Pick a month.");
  return ok(`${raw}-01`);
}
