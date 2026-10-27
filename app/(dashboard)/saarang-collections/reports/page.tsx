import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatCount, formatDate, formatTime } from "@/lib/format";
import { PROJECTS, SLOT_LABEL, SLOT_SOURCE, type Kind } from "@/lib/saarang-collections/core";
import { getCollections, type SlotState } from "@/lib/saarang-collections/queries";
import { PROJECT_NAMES } from "@/lib/saarang-collections/shared";
import { DropZone } from "../_components/drop-zone";

function Slot({ state }: { state: SlotState }) {
  const kind = state.slot.split("_")[1] as Kind;
  const upload = state.upload;
  return (
    <Card className="space-y-1 p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-foreground text-sm font-semibold">{SLOT_LABEL[state.slot]}</p>
        {!upload ? (
          <Badge variant="warning">Missing</Badge>
        ) : upload.fresh ? (
          <Badge variant="success">Updated</Badge>
        ) : (
          <Badge variant="neutral">Loaded</Badge>
        )}
      </div>
      <p className="text-muted text-xs">{SLOT_SOURCE[kind]}</p>
      {upload ? (
        <>
          <p className="text-muted text-xs [overflow-wrap:anywhere]">
            {upload.fileName} · {formatCount(upload.rowCount)} rows
            {upload.asOf ? ` · as of ${formatDate(upload.asOf)}` : ""}
          </p>
          <p className="text-muted text-xs">
            Uploaded {upload.uploadedBy ? `by ${upload.uploadedBy} ` : ""}
            on {formatDate(upload.uploadedAt)}, {formatTime(upload.uploadedAt)}
          </p>
        </>
      ) : (
        <p className="text-muted text-xs">Not uploaded yet</p>
      )}
    </Card>
  );
}

export default async function ReportsPage() {
  const { slots } = await getCollections();

  return (
    <div className="space-y-4">
      <DropZone />
      {PROJECTS.map((project) => (
        <section key={project} className="space-y-2">
          <h2 className="text-muted text-[11px] font-medium tracking-[0.14em] uppercase">
            {PROJECT_NAMES[project]}
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {slots
              .filter((state) => state.slot.startsWith(`${project}_`))
              .map((state) => (
                <Slot key={state.slot} state={state} />
              ))}
          </div>
        </section>
      ))}
      <p className="text-muted text-sm">
        Uploads and hand-entered figures are saved, so everyone with this tool sees the same report.
      </p>
    </div>
  );
}
