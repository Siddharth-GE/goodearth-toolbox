import { PageTitle } from "@/components/ui/page-title";
import { getSiteSequence } from "@/lib/supervisors/sequence-queries";
import { AddStage, SequenceList, TypicalSize } from "./_components/sequence-editor";

// One order of stages for every villa: what each follows, the wait after it, and its typical days. Every villa's dates follow it.
export default async function SequencePage() {
  const sequence = await getSiteSequence();

  return (
    <div className="space-y-4">
      <PageTitle
        title="Sequence"
        description="The order stages run on site, and how long each takes on a typical villa."
        backHref="/supervisors"
        backLabel="Supervisors"
        actions={<AddStage missing={sequence.missing} />}
      />
      <TypicalSize sqft={sequence.typicalSqft} />
      {sequence.rows.length === 0 ? (
        <p className="text-muted text-sm">
          No stages in the sequence yet. Add stage puts the first one in.
        </p>
      ) : (
        <SequenceList rows={sequence.rows} />
      )}
    </div>
  );
}
