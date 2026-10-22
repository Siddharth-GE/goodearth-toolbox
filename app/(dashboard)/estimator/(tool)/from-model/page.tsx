import { listVillas } from "@/lib/estimator/estimate-queries";
import { FromModel } from "./_components/from-model";

/** From the model (0118): a SketchUp takeoff becomes a villa's working estimate. SketchUp opens this page and hands the takeoff over its bridge; elsewhere it takes the file.
 * The preview writes nothing; Import re-reads the file on the server. */
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
