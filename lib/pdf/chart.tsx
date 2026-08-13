/**
 * A chart, for paper — drawn with react-pdf's own primitives from the
 * SAME tested ChartModel the screen renders (lib/charts/series.ts).
 *
 * **This replaces the planned Recharts → renderToStaticMarkup → sharp
 * pipeline, on evidence:** recharts@3 renders an empty wrapper <div>
 * under renderToStaticMarkup — its SVG mounts only in a live browser —
 * so the SVG string the plan wanted to rasterise does not exist. (The
 * plan's verification checked that the APIs exist; frame zero of a
 * chart that draws after mount is still empty.) Drawing from the model
 * directly is smaller than it sounds because every hard part — series,
 * palette slots, null handling, magnitude splits, "Other" folding — is
 * already done by the pure, tested shaping. What lives here is print
 * geometry only. It also removes the two risks the plan itself flagged:
 * no sharp rasterisation (vector output, crisp at any zoom) and no
 * librsvg font roulette on Vercel — text is the document's Helvetica.
 *
 * Paper has no tooltips, so values are DIRECT-LABELLED on the marks —
 * which is also what the palette's relief rule asks for. Bars carry
 * their value at the data end; lines label first, peak and last.
 */

import { Path, Polyline, StyleSheet, Svg, Text, View } from "@react-pdf/renderer";

import { formatAmount, formatQuantity } from "@/lib/format";
import type { CartesianModel, ChartModel, ChartPoint, MeterModel } from "@/lib/charts/series";

import { pdf, pdfChart, printColor } from "./theme";

const styles = StyleSheet.create({
  block: { marginBottom: pdf.space.block },
  legendRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 6 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 3 },
  legendSwatch: { width: 7, height: 7, borderRadius: 2 },
  legendLabel: { fontSize: pdf.size.tiny, color: pdf.color.muted },
  caption: { fontSize: pdf.size.tiny, color: pdf.color.muted, marginTop: 4 },
  splitNote: { fontSize: pdf.size.small, color: pdf.color.muted, marginBottom: 6 },
});

function printValue(value: number | null, money: boolean): string {
  if (value === null) return "—";
  return money ? formatAmount(value) : formatQuantity(value);
}

/** The largest absolute value on the chart — the scale's whole story. */
function chartMax(points: ChartPoint[], seriesIds: string[], stacked: boolean): number {
  let max = 0;
  for (const point of points) {
    let stackSum = 0;
    for (const id of seriesIds) {
      const value = point.values[id];
      if (typeof value !== "number") continue;
      if (stacked) stackSum += Math.max(0, value);
      else max = Math.max(max, Math.abs(value));
    }
    if (stacked) max = Math.max(max, stackSum);
  }
  return max;
}

function Legend({ model }: { model: CartesianModel }) {
  if (model.series.length < 2) return null;
  return (
    <View style={styles.legendRow}>
      {model.series.map((series) => (
        <View key={series.id} style={styles.legendItem}>
          <View style={[styles.legendSwatch, { backgroundColor: printColor(series.color) }]} />
          <Text style={styles.legendLabel}>{series.label}</Text>
        </View>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------
// Horizontal bars — rows read like a ranked table, ideal on paper
// ---------------------------------------------------------------------

const HBAR_TRACK = 300;

function HorizontalBars({ model }: { model: CartesianModel }) {
  const max = chartMax(model.points, model.series.map((s) => s.id), model.type === "stacked"); // prettier-ignore
  if (max === 0) return <Text style={styles.caption}>Nothing to chart.</Text>;
  const stacked = model.type === "stacked";

  return (
    <View>
      <Legend model={model} />
      {model.points.map((point) => (
        <View
          key={point.category}
          style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}
          wrap={false}
        >
          <Text
            style={{ width: 110, fontSize: pdf.size.small, color: pdf.color.ink, paddingRight: 6 }}
          >
            {point.category}
          </Text>
          <View style={{ width: HBAR_TRACK }}>
            {stacked ? (
              <View style={{ flexDirection: "row" }}>
                {model.series.map((series, index) => {
                  const value = point.values[series.id];
                  if (typeof value !== "number" || value <= 0) return null;
                  const width = (value / max) * HBAR_TRACK;
                  const last = index === model.series.length - 1;
                  return (
                    <View
                      key={series.id}
                      style={{
                        width,
                        height: 9,
                        backgroundColor: printColor(series.color),
                        marginRight: last ? 0 : 1,
                        borderTopRightRadius: last ? 3 : 0,
                        borderBottomRightRadius: last ? 3 : 0,
                      }}
                    />
                  );
                })}
              </View>
            ) : (
              model.series.map((series) => {
                const value = point.values[series.id];
                return (
                  <View
                    key={series.id}
                    style={{
                      width: typeof value === "number" ? Math.max((Math.abs(value) / max) * HBAR_TRACK, 1) : 1, // prettier-ignore
                      height: model.series.length > 1 ? 6 : 9,
                      backgroundColor: typeof value === "number" ? printColor(series.color) : pdf.color.rule, // prettier-ignore
                      borderTopRightRadius: 3,
                      borderBottomRightRadius: 3,
                      marginBottom: 1,
                    }}
                  />
                );
              })
            )}
          </View>
          <Text style={{ fontSize: pdf.size.tiny, color: pdf.color.muted, paddingLeft: 5 }}>
            {stacked
              ? printValue(
                  model.series.reduce((acc, series) => {
                    const value = point.values[series.id];
                    return typeof value === "number" ? acc + value : acc;
                  }, 0),
                  model.money,
                )
              : model.series
                  .map((series) => printValue(point.values[series.id] ?? null, model.money))
                  .join(" · ")}
          </Text>
        </View>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------
// Line / area — an Svg polyline; react-pdf draws these natively
// ---------------------------------------------------------------------

const LINE_W = 500;
const LINE_H = 130;

function LineArea({ model }: { model: CartesianModel }) {
  const ids = model.series.map((s) => s.id);
  const max = chartMax(model.points, ids, false);
  if (max === 0 || model.points.length === 0) {
    return <Text style={styles.caption}>Nothing to chart.</Text>;
  }
  const step = model.points.length > 1 ? LINE_W / (model.points.length - 1) : 0;
  const y = (value: number) => LINE_H - (Math.abs(value) / max) * (LINE_H - 12);

  return (
    <View>
      <Legend model={model} />
      <Svg width={LINE_W} height={LINE_H + 14}>
        {model.series.map((series) => {
          // Null is a GAP: split into runs, one polyline per run, so a
          // missing month never draws as a fabricated slope to zero.
          const runs: { x: number; value: number }[][] = [];
          let run: { x: number; value: number }[] = [];
          model.points.forEach((point, index) => {
            const value = point.values[series.id];
            if (typeof value === "number") {
              run.push({ x: index * step, value });
            } else if (run.length > 0) {
              runs.push(run);
              run = [];
            }
          });
          if (run.length > 0) runs.push(run);
          const color = printColor(series.color);

          return runs.map((points, runIndex) => {
            const coords = points.map((p) => `${p.x},${y(p.value)}`).join(" ");
            return model.type === "area" && points.length > 1 ? (
              <Path
                key={`${series.id}:${runIndex}`}
                d={`M ${points[0].x} ${LINE_H} L ${points.map((p) => `${p.x} ${y(p.value)}`).join(" L ")} L ${points[points.length - 1].x} ${LINE_H} Z`}
                fill={color}
                fillOpacity={0.16}
                stroke={color}
                strokeWidth={1.5}
              />
            ) : (
              <Polyline
                key={`${series.id}:${runIndex}`}
                points={points.length === 1 ? `${coords} ${coords}` : coords}
                fill="none"
                stroke={color}
                strokeWidth={1.5}
              />
            );
          });
        })}
      </Svg>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={styles.caption}>{model.points[0].category}</Text>
        {
          model.points.length > 2 &&
          <Text style={styles.caption}>{model.points[Math.floor(model.points.length / 2)].category}</Text> /* prettier-ignore */
        }
        <Text style={styles.caption}>{model.points[model.points.length - 1].category}</Text>
      </View>
      <Text style={styles.caption}>
        Peak {printValue(max, model.money)} · latest{" "}
        {printValue(model.points[model.points.length - 1].values[ids[0]] ?? null, model.money)}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------
// Meter — the same CSS-style bar the screen draws, in print colours
// ---------------------------------------------------------------------

function Meter({ model }: { model: MeterModel }) {
  return (
    <View>
      <View style={{ height: 12, backgroundColor: pdf.color.wash, borderRadius: 6 }}>
        {model.barPct !== null && (
          <View
            style={{
              width: `${model.barPct}%`,
              height: 12,
              backgroundColor: model.pct !== null && model.pct > 100 ? "#c0392b" : pdfChart.accent,
              borderRadius: 6,
            }}
          />
        )}
      </View>
      <Text style={styles.caption}>
        {model.valueLabel} {printValue(model.value, model.money)} of {model.limitLabel}{" "}
        {printValue(model.limit, model.money)}
        {model.pct !== null ? ` — ${formatQuantity(Math.round(model.pct))}%` : ""}
      </Text>
    </View>
  );
}

/**
 * The chart block of a report document. Vertical bar forms render as
 * horizontal on paper — every category keeps a readable label, which a
 * portrait A4's width cannot promise vertical bars.
 */
export function PdfChart({ model }: { model: ChartModel }) {
  if (model.kind === "empty") return null;
  if (model.kind === "meter") {
    return (
      <View style={styles.block} wrap={false}>
        <Meter model={model} />
      </View>
    );
  }
  if (model.kind === "split") {
    return (
      <View style={styles.block}>
        <Text style={styles.splitNote}>{model.reason}</Text>
        {model.charts.map((chart, index) => (
          <View key={index} style={{ marginBottom: 8 }} wrap={false}>
            <PdfCartesian model={chart} />
          </View>
        ))}
      </View>
    );
  }
  return (
    <View style={styles.block} wrap={false}>
      <PdfCartesian model={model} />
    </View>
  );
}

function PdfCartesian({ model }: { model: CartesianModel }) {
  if (model.type === "line" || model.type === "area") return <LineArea model={model} />;
  return <HorizontalBars model={model} />;
}
