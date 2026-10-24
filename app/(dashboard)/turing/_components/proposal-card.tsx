"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Pill } from "@/components/ui/pill";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import { useActionRunner } from "@/lib/hooks/use-action-runner";
import { saveProposal } from "@/lib/turing/actions";
import { entryFor, type Field, type Value } from "@/lib/turing/catalogue-fields";
import type { SaveResult, ShownProposal } from "@/lib/turing/display";
import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

const words = (value: string) => value.replace(/_/g, " ");

/**
 * An editable value; a field left out of the row reads "keeps what is there", or is blank on a
 * row that adds a new record.
 */
function FieldInput({
  field,
  value,
  adds,
  disabled,
  onChange,
}: {
  field: Field;
  value: Value | undefined;
  adds: boolean;
  disabled: boolean;
  /** null puts the field back to "Keep as is". */
  onChange: (value: Value | null) => void;
}) {
  const kept = value === undefined && !adds;
  let input;
  switch (field.kind) {
    case "yesno":
      // A change's box left out keeps what is there, which an unticked box would read as "no".
      input =
        field.optional && !adds ? (
          <Select
            aria-label={field.label}
            value={value === undefined ? "" : value === true ? "yes" : "no"}
            disabled={disabled}
            onChange={(event) =>
              onChange(event.target.value === "" ? null : event.target.value === "yes")
            }
            className="h-9 min-w-28"
          >
            <option value="">Keep as is</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </Select>
        ) : (
          <Checkbox
            aria-label={field.label}
            checked={value === true}
            disabled={disabled}
            onChange={(event) => onChange(event.target.checked)}
          />
        );
      break;
    case "choice":
      input = (
        <Select
          aria-label={field.label}
          value={value === undefined ? "" : String(value)}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className="h-9 min-w-32"
        >
          {/* A field that cannot be emptied offers the blank only while it keeps what is there. */}
          {field.optional && (kept || !field.keep) && (
            <option value="">{kept ? "Keep as is" : (field.blank ?? "—")}</option>
          )}
          {field.choices?.map((choice) => (
            <option key={choice} value={choice}>
              {field.labels?.[choice] ?? words(choice)}
            </option>
          ))}
        </Select>
      );
      break;
    default:
      input = (
        <Input
          aria-label={field.label}
          type={
            field.kind === "date"
              ? "date"
              : field.kind === "whole" || field.kind === "amount"
                ? "number"
                : "text"
          }
          min={field.kind === "whole" || field.kind === "amount" ? 0 : undefined}
          step={field.kind === "amount" ? "any" : undefined}
          value={value === undefined ? "" : String(value)}
          placeholder={kept || field.keep ? "Keep as is" : adds ? "Blank" : "Empty — clears it"}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className={
            field.kind === "text"
              ? "h-9 w-36"
              : field.kind === "whole"
                ? "h-9 w-20"
                : field.kind === "amount"
                  ? "h-9 w-24"
                  : "h-9 w-40"
          }
        />
      );
  }
  return (
    <div className="space-y-0.5">
      {input}
      {kept && field.kind === "date" && <p className="text-muted text-xs">Keeps what is there</p>}
    </div>
  );
}

function Outcome({ result }: { result: SaveResult | undefined }) {
  if (!result) return <span className="text-muted text-xs">Not saved</span>;
  if (result.ok) {
    return (
      <Pill tone="success">
        <Check className="size-3.5" aria-hidden />
        Saved
      </Pill>
    );
  }
  return <span className="text-danger text-xs font-medium">{result.message || "Refused"}</span>;
}

/**
 * Turing's proposed changes as a table: what each row is about and whom it names, looked up from
 * the database (never only Turing's own words), then what it would set. Untick a row to leave
 * it, edit a value, then Save — each ticked row goes through its tool's own save, as you.
 */
export function ProposalCard({
  conversationId,
  proposal,
  live,
}: {
  conversationId: string;
  proposal: ShownProposal;
  /** Still being answered: the proposal is not stored yet, so it cannot be saved. */
  live: boolean;
}) {
  const router = useRouter();
  const entry = entryFor(proposal.action);
  // A row that may already exist starts unticked: saving it is the admin's choice.
  const [ticked, setTicked] = useState(() =>
    proposal.rows.map((_, index) => !proposal.alike?.[index]),
  );
  const [values, setValues] = useState(() =>
    proposal.rows.map((row): Record<string, Value | null> => ({ ...row.values })),
  );
  const { pending, error, run } = useActionRunner();
  if (!entry) return null;

  // What a row is about (its villa and stage) reads as one cell; an id it sets gets its own column.
  const about = entry.fields.filter((field) => field.kind === "id" && !field.optional);
  const named = entry.fields.filter((field) => field.kind === "id" && field.optional);
  const editable = entry.fields.filter((field) => field.kind !== "id");
  const saved = proposal.saved;
  const results = new Map((saved?.results ?? []).map((result) => [result.row, result]));
  const locked = saved !== null || pending || live;
  const count = ticked.filter(Boolean).length;
  // A saved row shows what it was saved with, which may differ from what Turing proposed.
  const shown = (index: number) => results.get(index)?.values ?? values[index];

  const nameOf = (field: Field, index: number) => {
    const id = shown(index)[field.key];
    if (id === undefined) return <span className="text-muted">Keep as is</span>;
    if (id === "") return <span className="text-muted">None</span>;
    return (
      proposal.names[String(id)] ??
      results.get(index)?.names?.[String(id)] ?? <span className="text-danger">Unknown</span>
    );
  };

  const save = async () => {
    const result = await run(() =>
      saveProposal({
        conversationId,
        proposalId: proposal.id,
        rows: proposal.rows
          .map((_, row) => ({ row, values: values[row] }))
          .filter((_, row) => ticked[row]),
      }),
    );
    if (!result?.error) router.refresh();
  };

  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-[15px] font-semibold">{proposal.title}</p>
          <p className="text-muted text-xs">
            {entry.title} · {proposal.rows.length} row{proposal.rows.length === 1 ? "" : "s"}
          </p>
        </div>
        {saved === null ? (
          <Button size="sm" onClick={() => void save()} disabled={locked || count === 0}>
            {live
              ? "Save once Turing has finished"
              : pending
                ? "Saving…"
                : `Save ${count} row${count === 1 ? "" : "s"}`}
          </Button>
        ) : saved.results === null ? (
          <span className="text-muted text-xs">
            {saved.interrupted ? "Interrupted — check the tool's own screen" : "Saving…"}
          </span>
        ) : (
          <span className="text-muted text-xs">
            {saved.results.filter((result) => result.ok).length} of {saved.results.length} saved
          </span>
        )}
      </div>
      <FormMessage error={error} />
      <Table>
        <TableHead>
          <TableRow>
            <TableHeaderCell className="w-8">
              <span className="sr-only">Save this row</span>
            </TableHeaderCell>
            <TableHeaderCell>Change</TableHeaderCell>
            {named.map((field) => (
              <TableHeaderCell key={field.key}>{field.label}</TableHeaderCell>
            ))}
            {editable.map((field) => (
              <TableHeaderCell key={field.key}>{field.label}</TableHeaderCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {proposal.rows.map((row, index) => (
            <TableRow key={index}>
              <TableCell>
                <Checkbox
                  aria-label={`Save ${row.label}`}
                  checked={saved === null ? ticked[index] : results.has(index)}
                  disabled={locked}
                  onChange={(event) =>
                    setTicked((all) =>
                      all.map((on, at) => (at === index ? event.target.checked : on)),
                    )
                  }
                />
              </TableCell>
              <TableCell className="min-w-48 text-sm">
                {/* A new record is named by its label; what it sits under (its project, its category) follows. */}
                {(entry.adds || about.length === 0) && (
                  <span className="font-medium">{row.label}</span>
                )}
                {about.map((field, at) => (
                  <span
                    key={field.key}
                    className={at === 0 && !entry.adds ? "font-medium" : undefined}
                  >
                    {(at > 0 || entry.adds) && " · "}
                    {nameOf(field, index)}
                  </span>
                ))}
                {saved === null && proposal.alike?.[index] && (
                  <div className="mt-1">
                    <Pill tone="warning">{proposal.alike[index]}</Pill>
                  </div>
                )}
                {/* The result sits under what it is about, never in a column off the edge. */}
                {saved?.results && (
                  <div className="mt-1">
                    <Outcome result={results.get(index)} />
                  </div>
                )}
              </TableCell>
              {named.map((field) => (
                <TableCell key={field.key} className="text-sm whitespace-nowrap">
                  {nameOf(field, index)}
                </TableCell>
              ))}
              {editable.map((field) => (
                <TableCell key={field.key}>
                  <FieldInput
                    field={field}
                    value={shown(index)[field.key] ?? undefined}
                    adds={entry.adds === true}
                    disabled={locked || !ticked[index]}
                    onChange={(value) =>
                      setValues((all) =>
                        all.map((current, at) =>
                          at === index ? { ...current, [field.key]: value } : current,
                        ),
                      )
                    }
                  />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
