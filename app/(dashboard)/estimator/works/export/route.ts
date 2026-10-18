import { csvResponse, csvRow } from "@/lib/csv";
import { listWorksForModel } from "@/lib/estimator/model-import-queries";

/** The works list Goodearth QS for SketchUp tags by (0118): every active work's code, name, unit and measure, in the extension's works.csv columns.
 * A unit changed after SketchUp loaded its list is refused on import until the list is sent again. A blank measure means "from the unit". */
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
