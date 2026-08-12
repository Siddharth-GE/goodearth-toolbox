/**
 * Slot assignment for the categorical chart palette — the pure half of
 * the fourth colour system (see app/globals.css for the tokens and the
 * measured ordering, and DESIGN.md for the rules).
 *
 * Colours are TOKENS, not hexes: Recharts passes colour props straight
 * through to SVG attributes, which resolve CSS variables normally in
 * the DOM, so light/dark swap in one file and DESIGN.md's "never
 * hardcode a hex in a component" holds with the library in place. The
 * print palette for PDFs is separate (lib/pdf/theme.ts, Stage 9) —
 * a detached SVG string cannot resolve CSS variables.
 *
 * The rules the tests lock down:
 * - Slots follow ENTITY ORDER, never rank: a filter that drops a series
 *   must not repaint the survivors, so assignment runs against the full
 *   known universe of series, not whoever is present today.
 * - Eight is the ceiling. The ninth and later entities fold into
 *   "Other" on the last slot; a ninth hue is never generated.
 * - Status colours (success/warning/danger/info) are never issued as
 *   series colours — they keep their fixed meanings.
 * - Single-series and emphasis charts use the brand accent, not slot 1,
 *   so most of Reporter's charts read as Goodearth green.
 */

export const CHART_SLOT_COUNT = 8;

/** The label the folded tail renders under. */
export const OTHER_SERIES = "Other";

/** 1-based slot → the CSS token Recharts is handed. */
export function chartToken(slot: number): string {
  const clamped = Math.min(CHART_SLOT_COUNT, Math.max(1, Math.round(slot)));
  return `var(--chart-${clamped})`;
}

/** The accent for single-series and emphasised marks. */
export const ACCENT_TOKEN = "var(--accent)";

/** What a de-emphasised series wears when one series is the point. */
export const EMPHASIS_REST_TOKEN = "var(--muted)";

export type SlotAssignment = {
  id: string;
  slot: number;
  token: string;
};

export type SlotPlan = {
  /** Present series in universe order, each with its stable slot. */
  series: SlotAssignment[];
  /** Entity ids folded into OTHER_SERIES (universe position > ceiling). */
  folded: string[];
};

/**
 * Assign palette slots to the present series.
 *
 * `universe` is every series id that COULD appear, in first-appearance
 * order; it defaults to `present`. Slots belong to universe positions,
 * so filtering away one series leaves every survivor wearing the colour
 * it had. When the universe outgrows the palette, entities past slot
 * 7 fold into one "Other" bucket on slot 8.
 */
export function assignSlots(present: string[], universe: string[] = present): SlotPlan {
  const order = [...new Set(universe)];
  for (const id of present) if (!order.includes(id)) order.push(id);

  const overflowing = order.length > CHART_SLOT_COUNT;
  const directCount = overflowing ? CHART_SLOT_COUNT - 1 : CHART_SLOT_COUNT;

  const series: SlotAssignment[] = [];
  const folded: string[] = [];
  const presentSet = new Set(present);

  order.forEach((id, index) => {
    if (index < directCount) {
      if (presentSet.has(id)) {
        series.push({ id, slot: index + 1, token: chartToken(index + 1) });
      }
    } else {
      folded.push(id);
    }
  });

  if (folded.some((id) => presentSet.has(id))) {
    series.push({
      id: OTHER_SERIES,
      slot: CHART_SLOT_COUNT,
      token: chartToken(CHART_SLOT_COUNT),
    });
  }

  return { series, folded };
}

/**
 * Colours for measure-series charts (one colour per measure): a single
 * measure wears the accent; an emphasised measure wears the accent and
 * greys the rest; otherwise slots in measure order — which the spec
 * fixed, so the mapping is stable by construction.
 */
export function measureColors(measureIds: string[], emphasis?: string): Record<string, string> {
  const colors: Record<string, string> = {};
  if (measureIds.length === 1) {
    colors[measureIds[0]] = ACCENT_TOKEN;
    return colors;
  }
  if (emphasis && measureIds.includes(emphasis)) {
    for (const id of measureIds) colors[id] = id === emphasis ? ACCENT_TOKEN : EMPHASIS_REST_TOKEN;
    return colors;
  }
  measureIds.forEach((id, index) => {
    colors[id] = chartToken(index + 1);
  });
  return colors;
}
