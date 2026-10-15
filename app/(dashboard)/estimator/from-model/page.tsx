import { listVillas } from "@/lib/estimator/estimate-queries";
import { FromModel } from "./_components/from-model";

/**
 * From the model (0118; root plan.md, sixth piece): a SketchUp model's
 * takeoff becomes a villa's working estimate. SketchUp opens this page in
 * its own window (Goodearth QS → Send to the toolbox) and hands the
 * takeoff over the window's bridge; anywhere else it takes the takeoff
 * file. The villa is picked here; the preview writes nothing; Import
 * reads the file again on the server before it writes.
 */
export default async function FromModelPage() {
  const villas = await listVillas();

  return (
    <div className="space-y-4">
      <div className="max-w-2xl">
        <p className="text-muted text-[11px] font-medium tracking-[0.14em] uppercase">
          From a SketchUp model
        </p>
        <p className="text-muted mt-1 text-sm">
          The model measures each work it can see; this puts those measurements on a villa&apos;s
          working estimate as rows of its measurement sheets. Send it again after changing the model
          and the model&apos;s rows are replaced — rows typed by hand are never touched.
        </p>
      </div>
      <FromModel
        villas={villas.map((villa) => ({
          unitId: villa.unitId,
          name: villa.unitName,
          projectName: villa.projectName,
        }))}
      />
    </div>
  );
}
