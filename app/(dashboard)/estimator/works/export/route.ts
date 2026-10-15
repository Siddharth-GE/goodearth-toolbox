import { csvResponse, csvRow } from "@/lib/csv";
import { listWorksForModel } from "@/lib/estimator/model-import-queries";

/**
 * The works list Goodearth QS for SketchUp tags by — every active work's
 * code, name, rate-book unit and how the model measures it (0118), in the
 * extension's own columns (its works.csv). Downloaded here, or handed to
 * SketchUp in one press from the From the model page, so the model's tags
 * always match the rate book: a unit changed here after SketchUp loaded
 * its list is refused on import until the list is sent again.
 *
 * A blank measure means "from the unit" — the extension's own default.
 * The note column is the extension's; the toolbox leaves it empty.
 * listWorksForModel enforces the /estimator grant.
 */
export async function GET() {
  const works = await listWorksForModel();
  const lines = [
    csvRow([
      "code",
      "name",
      "uom",
      "measure",
      "category",
      "category_name",
      "group",
      "group_name",
      "note",
    ]),
    ...works
      .filter((work) => work.isActive)
      .map((work) =>
        csvRow([
          work.code,
          work.name,
          work.uom ?? "",
          work.modelMeasure ?? "",
          work.categoryCode,
          work.categoryName,
          work.groupCode ?? "",
          work.groupName ?? "",
          "",
        ]),
      ),
  ];
  return csvResponse(lines, "goodearth-qs-works.csv");
}
