import { getSketchupSetupSource } from "@/lib/estimator/model-import-queries";
import { buildSetup } from "@/lib/estimator/sketchup-setup";

/** The setup Goodearth QS for SketchUp loads (Load toolbox setup…, or the From the model page's button inside SketchUp): works, mixes and rates.
 * It carries money; the read refuses anyone without /estimator. */
export async function GET(request: Request) {
  const now = new Date();
  const setup = buildSetup(
    await getSketchupSetupSource(),
    now.toISOString(),
    new URL(request.url).origin,
  );
  return new Response(JSON.stringify(setup, null, 1), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="goodearth-qs-setup-${now.toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
