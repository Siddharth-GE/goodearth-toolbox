/**
 * Colours are CSS tokens, never hexes (DESIGN.md). Slots follow entity order, not rank, so a filter never repaints survivors.
 * Eight is the ceiling; status colours are never series colours; single-series charts use the accent.
 */

export const CHART_SLOT_COUNT = 8;

export const OTHER_SERIES = "Other";

export function chartToken(slot: number): string {
  const clamped = Math.min(CHART_SLOT_COUNT, Math.max(1, Math.round(slot)));
  return `var(--chart-${clamped})`;
}

export const ACCENT_TOKEN = "var(--accent)";

/** What a de-emphasised series wears when one series is the point. */
export const EMPHASIS_REST_TOKEN = "var(--muted)";

export type SlotAssignment = {
  id: string;
  slot: number;
  token: string;
};

export type SlotPlan = {
  series: SlotAssignment[];
  folded: string[];
};

/**
 * Slots belong to universe positions (default: `present`); past slot 7, entities fold into "Other" on slot 8.
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

/** Single measure: the accent; emphasised: accent, rest grey; otherwise slots in measure order. */
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
