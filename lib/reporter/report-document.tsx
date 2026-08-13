/**
 * A report on paper: the same composed page the screen shows — headline
 * figures, chart, then the table with subtotals — through the shared
 * document shell (lib/pdf/document.tsx), so it prints on the same
 * letterhead as every other Goodearth document.
 *
 * Money renders through formatAmount (digits, no ₹ — Helvetica cannot
 * draw one), dates through formatDate: the same lib/format.ts the
 * screen uses, so paper and screen never disagree about a number.
 *
 * The DETAIL view mirrors the screen's row limit and says "first N of
 * M" honestly; the CSV is the export that carries every line. Grouped
 * reports print all their groups — that is the summary someone takes
 * to a meeting.
 */

import { Document, StyleSheet, Text, View } from "@react-pdf/renderer";

import type { ChartModel } from "@/lib/charts/series";
import { formatAmount, formatCount, formatDate, formatQuantity } from "@/lib/format";
import { PdfChart } from "@/lib/pdf/chart";
import { DocumentPage, DocumentTable, type Column } from "@/lib/pdf/document";
import { pdf } from "@/lib/pdf/theme";

import type { GroupRow, ReportResult, ReportValue } from "./aggregate";
import type { DatasetDef, FieldType } from "./datasets";
import { measureLabel } from "./labels";
import { measureId, type ReportSpec } from "./spec";

const styles = StyleSheet.create({
  title: { fontFamily: pdf.fontBold, fontSize: pdf.size.display, marginBottom: 2 },
  description: { fontSize: pdf.size.body, color: pdf.color.muted, marginBottom: 2 },
  metaLine: { fontSize: pdf.size.tiny, color: pdf.color.muted, marginBottom: pdf.space.block },

  figures: {
    flexDirection: "row",
    flexWrap: "wrap",
    backgroundColor: pdf.color.wash,
    borderRadius: 4,
    padding: 10,
    marginBottom: pdf.space.block,
  },
  figure: { marginRight: 24, marginBottom: 2 },
  figureLabel: {
    fontSize: pdf.size.tiny,
    color: pdf.color.muted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  figureValue: { fontFamily: pdf.fontBold, fontSize: pdf.size.title, marginTop: 1 },

  totalRow: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: pdf.color.ruleStrong,
    paddingVertical: 5,
  },
  totalCell: { fontFamily: pdf.fontBold, fontSize: pdf.size.body, paddingRight: 6 },
  note: { fontSize: pdf.size.tiny, color: pdf.color.muted, marginTop: 6 },
});

function formatValue(type: FieldType, value: ReportValue): string {
  if (value === null) return "—";
  switch (type) {
    case "money":
      return typeof value === "number" ? formatAmount(value) : String(value);
    case "number":
      return typeof value === "number" ? formatQuantity(value) : String(value);
    case "date":
      return formatDate(String(value));
    case "bool":
      return value === true ? "Yes" : "No";
    case "text":
      return String(value);
  }
}

function formatMeasure(type: FieldType, agg: string, value: number | null): string {
  if (value === null) return "—";
  if (agg === "count" || agg === "count_distinct") return formatCount(value);
  if (type === "money") return formatAmount(value);
  return formatQuantity(value);
}

export function ReportDocument({
  name,
  description,
  dataset,
  spec,
  result,
  chartModel,
  generatedOn,
}: {
  name: string;
  description: string | null;
  dataset: DatasetDef;
  spec: ReportSpec;
  result: ReportResult;
  chartModel: ChartModel | null;
  /** Passed in, not read from the clock — documents stay testable. */
  generatedOn: string;
}) {
  const meta = {
    documentType: "REPORT",
    reference: name,
    footerLeft: `Generated ${generatedOn} · Goodearth Toolbox`,
  };

  const filterNote =
    spec.filters.length > 0
      ? `${spec.filters.length} filter${spec.filters.length === 1 ? "" : "s"} applied · `
      : "";

  return (
    <Document title={name} author="Goodearth Toolbox">
      <DocumentPage meta={meta}>
        <Text style={styles.title}>{name}</Text>
        {description && <Text style={styles.description}>{description}</Text>}
        <Text style={styles.metaLine}>
          {dataset.label} · {filterNote}
          {formatCount(result.matched)} lines · generated {generatedOn}
        </Text>

        {spec.measures.length > 0 && (
          <View style={styles.figures} wrap={false}>
            {spec.measures.map((measure) => {
              const field = dataset.fields[measure.field];
              return (
                <View key={measureId(measure)} style={styles.figure}>
                  <Text style={styles.figureLabel}>{measureLabel(field.label, measure.agg)}</Text>
                  <Text style={styles.figureValue}>
                    {formatMeasure(
                      field.type,
                      measure.agg,
                      result.totals[measureId(measure)] ?? null,
                    )}
                  </Text>
                </View>
              );
            })}
            <View style={styles.figure}>
              <Text style={styles.figureLabel}>Lines</Text>
              <Text style={styles.figureValue}>{formatCount(result.matched)}</Text>
            </View>
          </View>
        )}

        {chartModel && <PdfChart model={chartModel} />}

        {result.groups ? (
          <GroupedTable dataset={dataset} spec={spec} result={result} />
        ) : (
          <DetailTable dataset={dataset} result={result} />
        )}
      </DocumentPage>
    </Document>
  );
}

// No `spec` here on purpose: an ungrouped report prints the columns the
// result carries, so the detail table needs the dataset's labels and the
// rows, nothing about how the report was specified.
function DetailTable({ dataset, result }: { dataset: DatasetDef; result: ReportResult }) {
  const columns: Column<Record<string, ReportValue>>[] = result.columns.map((key) => {
    const field = dataset.fields[key];
    const numeric = field.type === "number" || field.type === "money";
    return {
      header: field.label,
      width: numeric ? 1 : 1.6,
      align: numeric ? "right" : "left",
      render: (row) => formatValue(field.type, row[key] ?? null),
    };
  });

  return (
    <View>
      <DocumentTable columns={columns} rows={result.detail} />
      {result.truncated && (
        <Text style={styles.note}>
          Showing the first {formatCount(result.detail.length)} of {formatCount(result.matched)}{" "}
          lines — the CSV download carries them all.
        </Text>
      )}
    </View>
  );
}

function GroupedTable({
  dataset,
  spec,
  result,
}: {
  dataset: DatasetDef;
  spec: ReportSpec;
  result: ReportResult;
}) {
  const twoLevel = spec.groupBy.length === 2;
  type Row = { keys: ReportValue[]; count: number; measures: Record<string, number | null>; child: boolean }; // prettier-ignore

  const rows: Row[] = [];
  for (const group of result.groups ?? []) {
    rows.push({ keys: group.keys, count: group.rowCount, measures: group.measures, child: false });
    for (const child of (group.children ?? []) as GroupRow[]) {
      rows.push({ keys: child.keys, count: child.rowCount, measures: child.measures, child: true });
    }
  }

  const columns: Column<Row>[] = [
    {
      header: dataset.fields[spec.groupBy[0]].label,
      width: 1.6,
      render: (row) =>
        row.child ? "" : formatValue(dataset.fields[spec.groupBy[0]].type, row.keys[0]),
    },
    ...(twoLevel
      ? [
          {
            header: dataset.fields[spec.groupBy[1]].label,
            width: 1.6,
            render: (row: Row) =>
              row.child ? formatValue(dataset.fields[spec.groupBy[1]].type, row.keys[1]) : "All",
          },
        ]
      : []),
    { header: "Lines", width: 0.7, align: "right", render: (row) => formatCount(row.count) },
    ...spec.measures.map((measure) => {
      const field = dataset.fields[measure.field];
      return {
        header: measureLabel(field.label, measure.agg),
        width: 1,
        align: "right" as const,
        render: (row: Row) =>
          formatMeasure(field.type, measure.agg, row.measures[measureId(measure)] ?? null),
      };
    }),
  ];

  return (
    <View>
      <DocumentTable columns={columns} rows={rows} />
      <View style={styles.totalRow} wrap={false}>
        <Text style={[styles.totalCell, { flex: 1.6 }]}>All lines</Text>
        {twoLevel && <Text style={[styles.totalCell, { flex: 1.6 }]} />}
        <Text style={[styles.totalCell, { flex: 0.7, textAlign: "right" }]}>
          {formatCount(result.matched)}
        </Text>
        {spec.measures.map((measure) => {
          const field = dataset.fields[measure.field];
          return (
            <Text
              key={measureId(measure)}
              style={[styles.totalCell, { flex: 1, textAlign: "right" }]}
            >
              {formatMeasure(field.type, measure.agg, result.totals[measureId(measure)] ?? null)}
            </Text>
          );
        })}
      </View>
    </View>
  );
}
