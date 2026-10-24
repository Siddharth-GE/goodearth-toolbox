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

function FieldInput({
  field,
  value,
  disabled,
  onChange,
}: {
  field: Field;
  value: Value;
  disabled: boolean;
  onChange: (value: Value) => void;
}) {
  const label = `${field.label}`;
  switch (field.kind) {
    case "yesno":
      return (
        <Checkbox
          aria-label={label}
          checked={value === true}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
        />
      );
    case "choice":
      return (
        <Select
          aria-label={label}
          value={String(value)}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className="h-9 min-w-32"
        >
          {field.optional && <option value="">—</option>}
          {field.choices?.map((choice) => (
            <option key={choice} value={choice}>
              {words(choice)}
            </option>
          ))}
        </Select>
      );
    default:
      return (
        <Input
          aria-label={label}
          type={field.kind === "date" ? "date" : field.kind === "whole" ? "number" : "text"}
          min={field.kind === "whole" ? 0 : undefined}
          value={String(value)}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className={field.kind === "text" ? "h-9 min-w-40" : "h-9 w-auto"}
        />
      );
  }
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
 * Turing's proposed changes as a table: untick a row to leave it, edit what it would set, then
 * Save — each ticked row goes through its tool's own save, as you. What a row is about (its villa,
 * its stage) is fixed; ask Turing again to change that.
 */
export function ProposalCard({
  conversationId,
  proposal,
}: {
  conversationId: string;
  proposal: ShownProposal;
}) {
  const router = useRouter();
  const entry = entryFor(proposal.action);
  const [ticked, setTicked] = useState(() => proposal.rows.map(() => true));
  const [values, setValues] = useState(() => proposal.rows.map((row) => ({ ...row.values })));
  const { pending, error, run } = useActionRunner();
  if (!entry) return null;

  const editable = entry.fields.filter((field) => field.kind !== "id");
  const saved = proposal.saved;
  const results = new Map((saved?.results ?? []).map((result) => [result.row, result]));
  const interrupted = saved?.interrupted === true;
  const locked = saved !== null || pending;
  const count = ticked.filter(Boolean).length;

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
          <Button size="sm" onClick={() => void save()} disabled={pending || count === 0}>
            {pending ? "Saving…" : `Save ${count} row${count === 1 ? "" : "s"}`}
          </Button>
        ) : saved.results === null ? (
          <span className="text-muted text-xs">
            {interrupted ? "Interrupted — check the tool's own screen" : "Saving…"}
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
            {editable.map((field) => (
              <TableHeaderCell key={field.key}>{field.label}</TableHeaderCell>
            ))}
            {saved !== null && <TableHeaderCell>Result</TableHeaderCell>}
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
              <TableCell className="text-sm">{row.label}</TableCell>
              {editable.map((field) => (
                <TableCell key={field.key}>
                  <FieldInput
                    field={field}
                    value={values[index][field.key] ?? ""}
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
              {saved !== null && (
                <TableCell>
                  {saved.results === null ? null : <Outcome result={results.get(index)} />}
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
