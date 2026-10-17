// Pure, so the sentences forms refuse with are tested without a database. Import-free: "use server" files import it.
import { CHANNELS, STAY_USES, oneOf, type Channel, type StayUse } from "./shared";

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

const ok = <T>(value: T): Parsed<T> => ({ ok: true, value });
const no = <T>(error: string): Parsed<T> => ({ ok: false, error });

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

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

export function parseCount(raw: string, label: string, max = 500): Parsed<number> {
  const cleaned = raw.trim();
  if (!cleaned) return ok(0);
  const value = Number(cleaned);
  if (!Number.isInteger(value) || value < 0) return no(`${label} must be a whole number.`);
  if (value > max) return no(`${label} looks too large — check it.`);
  return ok(value);
}

/** Rupees as typed ("1,20,000", "₹ 450"); blank gives the caller's `blank`; paise beyond two places are refused. */
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

export function parseMonth(raw: string): Parsed<string> {
  if (!/^\d{4}-\d{2}$/.test(raw) || !isRealDate(`${raw}-01`)) return no("Pick a month.");
  return ok(`${raw}-01`);
}
