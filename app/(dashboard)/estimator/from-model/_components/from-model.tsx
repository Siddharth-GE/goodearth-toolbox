"use client";

import { Badge } from "@/components/ui/badge";
import { Button, LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormMessage } from "@/components/ui/form-message";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import {
  importModelTakeoff,
  previewModelImport,
  type ModelImportPreview,
  type ModelImportResult,
} from "@/lib/estimator/model-import-actions";
import {
  MODEL_MEASURE_SHORT,
  isModelMeasure,
  parseTakeoff,
  type PlanEntry,
  type PlanRemoval,
} from "@/lib/estimator/model-takeoff";
import { formatCount, formatQuantity } from "@/lib/format";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";

/** Bridge with Goodearth QS for SketchUp: it opens this page in an HtmlDialog and injects window.sketchup; it answers through the window functions below.
 * Outside SketchUp the page takes the takeoff file instead. Whatever arrives is re-read and checked on the server. */
declare global {
  interface Window {
    sketchup?: {
      geqsTakeoff?: () => void;
      geqsImported?: (json: string) => void;
      geqsWorksList?: (csv: string) => void;
    };
    geqsReceive?: (json: string) => void;
    geqsFailed?: (message: string) => void;
    geqsWorksListSaved?: (count: number) => void;
  }
}

export type VillaOption = { unitId: string; name: string; projectName: string };

type Received = { text: string; from: "sketchup" | "file"; fileName?: string };

const noSubscription = () => () => {};
/** Inside SketchUp's window the bridge exists from the first paint; on the server and in any browser it never does. */
const bridgePresent = () => typeof window.sketchup?.geqsTakeoff === "function";

export function FromModel({ villas }: { villas: VillaOption[] }) {
  const inSketchUp = useSyncExternalStore(noSubscription, bridgePresent, () => false);
  const [asking, setAsking] = useState(false);
  const [bridgeError, setBridgeError] = useState<string>();
  const [worksListNote, setWorksListNote] = useState<{ error?: string; done?: string }>();
  const [received, setReceived] = useState<Received | null>(null);
  const [unitId, setUnitId] = useState("");
  const [preview, setPreview] = useState<ModelImportPreview | null>(null);
  const [previewError, setPreviewError] = useState<string>();
  const [imported, setImported] = useState<ModelImportResult | null>(null);
  const [importError, setImportError] = useState<string>();
  const [previewing, startPreview] = useTransition();
  const [importing, startImport] = useTransition();
  const [sendingList, startSendingList] = useTransition();
  const request = useRef(0);

  // Read in the browser for the summary only; the server reads it again for real.
  const parsed = useMemo(() => (received ? parseTakeoff(received.text) : null), [received]);
  const takeoff = parsed && "takeoff" in parsed ? parsed.takeoff : null;
  const villaNames = useMemo(() => new Map(villas.map((v) => [v.unitId, v.name])), [villas]);
  const waiting = inSketchUp && (asking || (!received && !bridgeError));

  /** A fresh preview for this takeoff and villa; only the newest answer is shown. */
  const runPreview = (text: string, unit: string) => {
    setPreview(null);
    setPreviewError(undefined);
    setImportError(undefined);
    const mine = ++request.current;
    if (!unit) return;
    startPreview(async () => {
      const result = await previewModelImport(text, unit);
      if (mine !== request.current) return;
      if (result.error) setPreviewError(result.error);
      else setPreview(result.preview ?? null);
    });
  };

  /** A takeoff arrived; a villa the model remembers is picked if it is one of ours and none is picked. */
  const receive = (next: Received) => {
    setAsking(false);
    setImported(null);
    setReceived(next);
    const read = parseTakeoff(next.text);
    if (read.problem !== undefined) {
      runPreview(next.text, "");
      return;
    }
    const suggested = read.takeoff.model.villa?.unitId;
    const unit = unitId || (suggested && villaNames.has(suggested) ? suggested : "");
    setUnitId(unit);
    runPreview(next.text, unit);
  };

  const askSketchUp = () => {
    setBridgeError(undefined);
    setAsking(true);
    window.sketchup?.geqsTakeoff?.();
  };

  // SketchUp calls these whenever it answers; they always reach this render's handlers.
  const bridge = useRef<{
    receive: (next: Received) => void;
    failed: (message: string) => void;
    listSaved: (count: number) => void;
  } | null>(null);
  useEffect(() => {
    bridge.current = {
      receive,
      failed: (message) => {
        setAsking(false);
        setBridgeError(message || "SketchUp could not prepare the takeoff.");
      },
      listSaved: (count) => {
        setWorksListNote({
          done: `SketchUp now uses the rate book's works list — ${formatCount(count)} works. Measuring the model again…`,
        });
        askSketchUp();
      },
    };
  });

  useEffect(() => {
    if (!inSketchUp) return;
    window.geqsReceive = (text) =>
      bridge.current?.receive({ text: String(text), from: "sketchup" });
    window.geqsFailed = (message) => bridge.current?.failed(String(message ?? ""));
    window.geqsWorksListSaved = (count) => bridge.current?.listSaved(Number(count) || 0);
    window.sketchup?.geqsTakeoff?.();
    return () => {
      delete window.geqsReceive;
      delete window.geqsFailed;
      delete window.geqsWorksListSaved;
    };
  }, [inSketchUp]);

  const chooseVilla = (unit: string) => {
    setUnitId(unit);
    setImported(null);
    if (received && takeoff) runPreview(received.text, unit);
  };

  const runImport = () => {
    if (!received || !unitId) return;
    setImportError(undefined);
    startImport(async () => {
      const result = await importModelTakeoff(received.text, unitId);
      if (result.error || !result.imported) {
        setImportError(result.error ?? "Could not import the takeoff. Try again.");
        return;
      }
      const done = result.imported;
      request.current += 1;
      setPreview(null);
      setImported(done);
      window.sketchup?.geqsImported?.(
        JSON.stringify({
          unit_id: done.villa.unitId,
          villa: done.villa.name,
          estimate_url: `${window.location.origin}/estimator/estimates/${done.estimateId}`,
        }),
      );
    });
  };

  const sendWorksList = () => {
    setWorksListNote(undefined);
    startSendingList(async () => {
      try {
        const response = await fetch("/estimator/works/export", { cache: "no-store" });
        const type = response.headers.get("content-type") ?? "";
        if (!response.ok || !type.includes("text/csv")) {
          setWorksListNote({
            error: "Could not read the works list — reload the page and try again.",
          });
          return;
        }
        window.sketchup?.geqsWorksList?.(await response.text());
      } catch {
        setWorksListNote({
          error: "Could not read the works list — check the connection and try again.",
        });
      }
    });
  };

  const readFile = async (file: File | undefined) => {
    if (!file) return;
    receive({ text: await file.text(), from: "file", fileName: file.name });
  };

  const byProject = useMemo(() => {
    const groups = new Map<string, VillaOption[]>();
    for (const villa of villas) {
      groups.set(villa.projectName, [...(groups.get(villa.projectName) ?? []), villa]);
    }
    return [...groups];
  }, [villas]);

  const toMeasureCount =
    takeoff?.notMeasured.filter((item) => item.reason === "manual").length ?? 0;
  const suggestedVilla = takeoff?.model.villa;

  return (
    <div className="space-y-4">
      <Card className="space-y-4 p-5">
        <p className="text-muted text-[11px] font-medium tracking-[0.14em] uppercase">
          The takeoff
        </p>

        {!received && waiting && (
          <div className="text-muted flex items-center gap-2 text-sm">
            <Spinner className="size-4 border-2" /> Asking SketchUp for the model&apos;s takeoff…
          </div>
        )}
        {!received && !inSketchUp && (
          <p className="text-muted text-sm">
            In SketchUp, <strong>Extensions → Goodearth QS → Send to the toolbox</strong> opens this
            page with the model&apos;s takeoff already in it. Or choose the takeoff file SketchUp
            saved (<strong>Save the takeoff as a file…</strong>).
          </p>
        )}
        <FormMessage error={bridgeError} />
        {parsed?.problem && <FormMessage error={parsed.problem} />}

        {takeoff && (
          <div>
            <p className="text-foreground text-sm font-medium">
              {takeoff.model.file || takeoff.model.title || "A model not saved yet"}
            </p>
            <p className="text-muted text-sm">
              {formatCount(takeoff.lines.length)} {takeoff.lines.length === 1 ? "work" : "works"} ·{" "}
              {formatCount(takeoff.rowCount)} {takeoff.rowCount === 1 ? "row" : "rows"} ·{" "}
              <span className={takeoff.errorCount > 0 ? "text-danger" : undefined}>
                {formatCount(takeoff.errorCount)}{" "}
                {takeoff.errorCount === 1 ? "problem" : "problems"}
              </span>{" "}
              · {formatCount(toMeasureCount)} to measure by hand ·{" "}
              {received?.from === "file" ? `from ${received.fileName}` : "from SketchUp"}
            </p>
          </div>
        )}

        <div className="flex flex-wrap items-end gap-3">
          {inSketchUp && (
            <Button type="button" variant="secondary" disabled={waiting} onClick={askSketchUp}>
              {waiting ? "Asking SketchUp…" : "Measure the model again"}
            </Button>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="takeoff-file">
              {inSketchUp ? "…or a takeoff file" : "The takeoff file"}
            </Label>
            <input
              id="takeoff-file"
              type="file"
              accept=".json,application/json"
              className="text-muted file:border-border file:bg-surface-raised file:text-foreground block w-full text-sm file:mr-3 file:rounded-xl file:border file:px-3 file:py-2 file:text-sm"
              onChange={(event) => readFile(event.target.files?.[0])}
            />
          </div>
        </div>

        {takeoff && (
          <div className="max-w-md space-y-1.5">
            <Label htmlFor="villa">Villa</Label>
            <Select id="villa" value={unitId} onChange={(event) => chooseVilla(event.target.value)}>
              <option value="" disabled>
                Pick the villa this model is
              </option>
              {byProject.map(([projectName, options]) => (
                <optgroup key={projectName} label={projectName}>
                  {options.map((villa) => (
                    <option key={villa.unitId} value={villa.unitId}>
                      {villa.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
            {suggestedVilla && (
              <p className="text-muted text-xs">
                {villaNames.has(suggestedVilla.unitId)
                  ? `SketchUp remembers this model was last sent to ${villaNames.get(suggestedVilla.unitId)}.`
                  : `This model was last sent to ${suggestedVilla.name || "a villa"}, which is no longer in the list.`}
              </p>
            )}
          </div>
        )}
      </Card>

      {previewing && (
        <div className="text-muted flex items-center gap-2 text-sm">
          <Spinner className="size-4 border-2" /> Working out what the import would do…
        </div>
      )}
      <FormMessage error={previewError} />

      {preview && <PreviewCard preview={preview} importing={importing} onImport={runImport} />}
      <FormMessage error={importError} />

      {imported && <ImportedCard imported={imported} inSketchUp={inSketchUp} />}

      {takeoff && takeoff.issues.length > 0 && (
        <Card className="space-y-3 p-5">
          <div>
            <p className="text-muted text-[11px] font-medium tracking-[0.14em] uppercase">
              What the model flagged
            </p>
            <p className="text-muted mt-1 text-sm">
              Fixed in SketchUp, never imported. An element with a problem is left out of the
              takeoff until it is fixed.
            </p>
          </div>
          <ul className="divide-border divide-y">
            {takeoff.issues.slice(0, 60).map((issue, index) => (
              <li key={index} className="flex flex-wrap items-start gap-2 py-2">
                <Badge
                  variant={
                    issue.level === "error"
                      ? "danger"
                      : issue.level === "warning"
                        ? "warning"
                        : "neutral"
                  }
                >
                  {issue.level === "error"
                    ? "Problem"
                    : issue.level === "warning"
                      ? "Check"
                      : "Note"}
                </Badge>
                <span className="min-w-0 flex-1 text-sm">
                  <span className="text-foreground">{issue.title}</span>
                  {issue.detail && <span className="text-muted block text-xs">{issue.detail}</span>}
                </span>
              </li>
            ))}
          </ul>
          {takeoff.issues.length > 60 && (
            <p className="text-muted text-xs">
              The first 60 of {formatCount(takeoff.issues.length)} — SketchUp lists them all.
            </p>
          )}
        </Card>
      )}

      <Card className="space-y-3 p-5">
        <div>
          <p className="text-muted text-[11px] font-medium tracking-[0.14em] uppercase">
            The works list
          </p>
          <p className="text-muted mt-1 text-sm">
            SketchUp tags by the rate book&apos;s work codes, units and how each is measured. When
            the rate book changes, give SketchUp the new list — a work whose unit no longer matches
            is refused until it has.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {inSketchUp ? (
            <Button
              type="button"
              variant="secondary"
              disabled={sendingList}
              onClick={sendWorksList}
            >
              {sendingList ? "Sending…" : "Send the works list to SketchUp"}
            </Button>
          ) : (
            <>
              <LinkButton href="/estimator/works/export" variant="secondary" plain>
                Download works list for SketchUp
              </LinkButton>
              <span className="text-muted text-xs">
                then in SketchUp: Goodearth QS → Choose works list…
              </span>
            </>
          )}
        </div>
        <FormMessage error={worksListNote?.error} success={worksListNote?.done} />
      </Card>
    </div>
  );
}

function PreviewCard({
  preview,
  importing,
  onImport,
}: {
  preview: ModelImportPreview;
  importing: boolean;
  onImport: () => void;
}) {
  const { plan, villa } = preview;
  const { counts } = plan;
  const summary = [
    counts.add > 0 && `${formatCount(counts.add)} new`,
    counts.replace > 0 && `${formatCount(counts.replace)} replaced`,
    counts.toMeasure > 0 && `${formatCount(counts.toMeasure)} to measure by hand`,
    counts.removed > 0 && `${formatCount(counts.removed)} coming off`,
  ].filter(Boolean);

  return (
    <Card className="space-y-4 p-5">
      <div className="space-y-1">
        <p className="text-muted text-[11px] font-medium tracking-[0.14em] uppercase">
          What importing into {villa.name} does
        </p>
        <p className="text-sm">
          <span className="text-foreground">{summary.join(" · ") || "Nothing changes"}</span>
          {counts.refused > 0 && (
            <span className="text-danger">
              {" "}
              · {formatCount(counts.refused)} refused — the rest still imports
            </span>
          )}
        </p>
        {preview.startsEstimate && (
          <p className="text-muted text-sm">
            {villa.name} has no working estimate yet — Import starts a blank one and fills it.
          </p>
        )}
        {plan.differentModel && (
          <p className="text-warning text-sm">
            {villa.name}&apos;s estimate was measured from{" "}
            {plan.differentModel.file ?? "another model"} — a different model. Importing replaces
            that model&apos;s rows with this one&apos;s. Check this is the right villa.
          </p>
        )}
      </div>

      <Table>
        <TableHead>
          <TableRow>
            <TableHeaderCell>Work</TableHeaderCell>
            <TableHeaderCell className="text-right">Rows</TableHeaderCell>
            <TableHeaderCell className="text-right">Quantity</TableHeaderCell>
            <TableHeaderCell>What happens</TableHeaderCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {plan.entries.map((entry) => (
            <TableRow key={entry.key}>
              <TableCell className="text-sm">
                <span className="text-foreground">{entry.name}</span>
                <span className="text-muted ml-2 font-mono text-xs">{entry.code}</span>
              </TableCell>
              <TableCell className="text-right font-mono text-sm">
                {entry.rows > 0 ? formatCount(entry.rows) : ""}
              </TableCell>
              <TableCell className="text-right font-mono text-sm whitespace-nowrap">
                {entry.qty !== null ? `${formatQuantity(entry.qty)} ${entry.uom ?? ""}` : ""}
              </TableCell>
              <TableCell className="text-sm">
                <Outcome entry={entry} />
              </TableCell>
            </TableRow>
          ))}
          {plan.removals.map((removal) => (
            <TableRow key={`off-${removal.code}`}>
              <TableCell className="text-sm">
                <span className="text-foreground">{removal.name}</span>
                <span className="text-muted ml-2 font-mono text-xs">{removal.code}</span>
              </TableCell>
              <TableCell />
              <TableCell />
              <TableCell className="text-sm">
                <Removal removal={removal} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" disabled={importing || !plan.canImport} onClick={onImport}>
          {importing ? "Importing…" : `Import into ${villa.name}`}
        </Button>
        {!plan.canImport && (
          <span className="text-muted text-sm">Nothing here can be imported yet.</span>
        )}
      </div>
    </Card>
  );
}

function Outcome({ entry }: { entry: PlanEntry }) {
  const rows = (n: number) => `${formatCount(n)} ${n === 1 ? "row" : "rows"}`;
  const typed = (n: number) => `${formatCount(n)} typed ${n === 1 ? "row" : "rows"} kept`;
  const notes: string[] = [];
  if (entry.typedQty !== null) {
    notes.push(`Replaces the typed ${formatQuantity(entry.typedQty)} ${entry.uom ?? ""}.`);
  }
  if (entry.modelQtyDiffers !== null) {
    notes.push(
      `The model made it ${formatQuantity(entry.modelQtyDiffers)}; the toolbox adds the rows up itself.`,
    );
  }
  if (entry.measuredDifferently) {
    const model = isModelMeasure(entry.measuredDifferently.model)
      ? MODEL_MEASURE_SHORT[entry.measuredDifferently.model]
      : entry.measuredDifferently.model.replace(/_/g, " ");
    notes.push(
      `The model measured it by ${model}; the rate book says by ${MODEL_MEASURE_SHORT[entry.measuredDifferently.rateBook]} — send the works list to SketchUp.`,
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        {entry.kind === "add" && <Badge variant="success">Adds</Badge>}
        {entry.kind === "replace" && <Badge variant="info">Replaces</Badge>}
        {entry.kind === "refused" && <Badge variant="danger">Refused</Badge>}
        {entry.kind === "to_measure" && <Badge variant="neutral">To measure</Badge>}
        {entry.kind === "already_on" && <Badge variant="neutral">Already on</Badge>}
        <span className="text-muted">
          {entry.kind === "add" &&
            [rows(entry.rows), entry.handRows > 0 && typed(entry.handRows)]
              .filter(Boolean)
              .join(" · ")}
          {entry.kind === "replace" &&
            [
              `the model's ${rows(entry.replacesRows)} with ${formatCount(entry.rows)}`,
              entry.handRows > 0 && typed(entry.handRows),
            ]
              .filter(Boolean)
              .join(" · ")}
          {entry.kind === "to_measure" && "goes on the estimate, to measure by hand"}
          {entry.kind === "already_on" && "already on the estimate — measure it there"}
        </span>
      </div>
      {entry.why && <p className="text-danger text-xs">{entry.why}</p>}
      {notes.map((note) => (
        <p key={note} className="text-warning text-xs">
          {note}
        </p>
      ))}
    </div>
  );
}

function Removal({ removal }: { removal: PlanRemoval }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="warning">Comes off</Badge>
      <span className="text-muted">
        the model no longer measures it:{" "}
        {removal.modelRows === 1
          ? "its row from the last send comes off"
          : `its ${formatCount(removal.modelRows)} rows from the last send come off`}
        {removal.backToMeasure
          ? ", and the work is to measure again"
          : ` · ${formatCount(removal.handRows)} typed ${removal.handRows === 1 ? "row stays" : "rows stay"}`}
      </span>
    </div>
  );
}

function ImportedCard({
  imported,
  inSketchUp,
}: {
  imported: ModelImportResult;
  inSketchUp: boolean;
}) {
  const works = imported.counts.add + imported.counts.replace;
  return (
    <Card className="space-y-3 p-5">
      <FormMessage
        success={
          `Imported into ${imported.villa.name}'s working estimate — ${formatCount(imported.rows)} ${imported.rows === 1 ? "row" : "rows"} on ${formatCount(works)} ${works === 1 ? "work" : "works"}` +
          (imported.counts.toMeasure > 0
            ? `, ${formatCount(imported.counts.toMeasure)} to measure by hand`
            : "") +
          (imported.counts.removed > 0
            ? `, ${formatCount(imported.counts.removed)} no longer measured by the model`
            : "") +
          "."
        }
      />
      {imported.unsynced > 0 && (
        <FormMessage
          error={`${formatCount(imported.unsynced)} ${imported.unsynced === 1 ? "work's quantity" : "works' quantities"} could not be added up — import again to finish.`}
        />
      )}
      <div className="flex flex-wrap items-center gap-3">
        <LinkButton href={`/estimator/estimates/${imported.estimateId}`}>
          Open the estimate
        </LinkButton>
        {inSketchUp && (
          <span className="text-muted text-sm">
            SketchUp will send this model to {imported.villa.name} next time.
          </span>
        )}
      </div>
    </Card>
  );
}
