"use client";

import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Section } from "@/components/ui/section";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { saveEngagement } from "@/lib/client-relations/actions";
import {
  ACKNOWLEDGEMENTS,
  DEED_STATUSES,
  ORIGINAL_WITH,
  REGISTRATION_STAGES,
} from "@/lib/client-relations/stages";
import type { EngagementDetail } from "@/lib/client-relations/queries";
import { useSaveOnBlur } from "@/lib/hooks/use-save-on-blur";
import { useState } from "react";

import { BottleneckPicker } from "./bottleneck-picker";

type Person = { id: string; name: string };

/**
 * The sheet's sales and legal columns, edited in place.
 *
 * Save on blur rather than a Save button: this is a register people tab
 * through while on the phone to a client, and a form that has to be
 * submitted is a form that gets half-filled and abandoned.
 *
 * NOTE what is NOT here: any design or site status. Those come from Relay
 * and are never typed — see the Relay panel. `design_support` survives
 * because it is a note about what the design team is being asked for,
 * not a claim about where the design has got to.
 */
export function EngagementFields({
  engagement,
  owners,
}: {
  engagement: EngagementDetail;
  owners: Person[];
}) {
  const initial = {
    ownerId: engagement.ownerId ?? "",
    saleDeedStatus: engagement.saleDeedStatus,
    saleDeedOriginalWith: engagement.saleDeedOriginalWith ?? "",
    saleDeedAck: engagement.saleDeedAck ?? "",
    saleDeedSignedOn: engagement.saleDeedSignedOn ?? "",
    caStatus: engagement.caStatus,
    caOriginalWith: engagement.caOriginalWith ?? "",
    caAck: engagement.caAck ?? "",
    caSignedOn: engagement.caSignedOn ?? "",
    registrationStage: engagement.registrationStage,
    registrationNote: engagement.registrationNote ?? "",
    registrationOn: engagement.registrationOn ?? "",
    designSupport: engagement.designSupport ?? "",
    details: engagement.details ?? "",
    checkInOn: engagement.checkInOn ?? "",
    plotValue: engagement.plotValue === null ? "" : String(engagement.plotValue),
    constructionValue:
      engagement.constructionValue === null ? "" : String(engagement.constructionValue),
  };

  const [form, setForm] = useState(initial);
  const set = <K extends keyof typeof initial>(key: K, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const { flush, error, saved } = useSaveOnBlur({
    initial,
    validate: (value) => {
      // Mirrors client_engagements_deed_original_check, so the refusal
      // arrives as a sentence rather than a constraint name.
      if (value.saleDeedStatus !== "signed" && value.saleDeedOriginalWith) {
        return "Only a signed sale deed can have an original with someone.";
      }
      if (value.caStatus !== "signed" && value.caOriginalWith) {
        return "Only a signed construction agreement can have an original with someone.";
      }
      for (const amount of [value.plotValue, value.constructionValue]) {
        if (amount !== "" && (!Number.isFinite(Number(amount)) || Number(amount) < 0)) {
          return "Values must be zero or more.";
        }
      }
      return undefined;
    },
    save: (value) =>
      saveEngagement(engagement.id, {
        ownerId: value.ownerId || null,
        saleDeedStatus: value.saleDeedStatus,
        saleDeedOriginalWith: value.saleDeedOriginalWith || null,
        saleDeedAck: value.saleDeedAck || null,
        saleDeedSignedOn: value.saleDeedSignedOn || null,
        caStatus: value.caStatus,
        caOriginalWith: value.caOriginalWith || null,
        caAck: value.caAck || null,
        caSignedOn: value.caSignedOn || null,
        registrationStage: value.registrationStage,
        registrationNote: value.registrationNote || null,
        registrationOn: value.registrationOn || null,
        designSupport: value.designSupport || null,
        details: value.details || null,
        checkInOn: value.checkInOn || null,
        plotValue: value.plotValue === "" ? null : Number(value.plotValue),
        constructionValue: value.constructionValue === "" ? null : Number(value.constructionValue),
      }),
  });

  // Selects save the moment they change — waiting for a blur that a mouse
  // user never produces is how a changed dropdown gets lost.
  const saveNow = (next: typeof initial) => {
    setForm(next);
    flush(next);
  };
  const save = () => flush(form);
  const id = (name: string) => `engagement-${engagement.id}-${name}`;

  return (
    <div className="space-y-4">
      <Section title="Sale deed">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor={id("deed-status")}>Status</Label>
            <Select
              id={id("deed-status")}
              value={form.saleDeedStatus}
              onChange={(event) => {
                const status = event.target.value;
                // Clearing the status clears the custodian with it, so the
                // pair can never contradict each other on the way to the
                // database check that would refuse them.
                saveNow({
                  ...form,
                  saleDeedStatus: status,
                  saleDeedOriginalWith: status === "signed" ? form.saleDeedOriginalWith : "",
                });
              }}
            >
              {DEED_STATUSES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={id("deed-original")}>Original with</Label>
            <Select
              id={id("deed-original")}
              value={form.saleDeedOriginalWith}
              disabled={form.saleDeedStatus !== "signed"}
              onChange={(event) => saveNow({ ...form, saleDeedOriginalWith: event.target.value })}
            >
              <option value="">—</option>
              {ORIGINAL_WITH.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={id("deed-ack")}>Acknowledgement</Label>
            <Select
              id={id("deed-ack")}
              value={form.saleDeedAck}
              onChange={(event) => saveNow({ ...form, saleDeedAck: event.target.value })}
            >
              <option value="">—</option>
              {ACKNOWLEDGEMENTS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={id("deed-signed")}>Signed on</Label>
            <Input
              id={id("deed-signed")}
              type="date"
              value={form.saleDeedSignedOn}
              onChange={(event) => set("saleDeedSignedOn", event.target.value)}
              onBlur={save}
            />
          </div>
        </div>
      </Section>

      <Section title="Construction agreement">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor={id("ca-status")}>Status</Label>
            <Select
              id={id("ca-status")}
              value={form.caStatus}
              onChange={(event) => {
                const status = event.target.value;
                saveNow({
                  ...form,
                  caStatus: status,
                  caOriginalWith: status === "signed" ? form.caOriginalWith : "",
                });
              }}
            >
              {DEED_STATUSES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={id("ca-original")}>Original with</Label>
            <Select
              id={id("ca-original")}
              value={form.caOriginalWith}
              disabled={form.caStatus !== "signed"}
              onChange={(event) => saveNow({ ...form, caOriginalWith: event.target.value })}
            >
              <option value="">—</option>
              {ORIGINAL_WITH.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={id("ca-ack")}>Acknowledgement</Label>
            <Select
              id={id("ca-ack")}
              value={form.caAck}
              onChange={(event) => saveNow({ ...form, caAck: event.target.value })}
            >
              <option value="">—</option>
              {ACKNOWLEDGEMENTS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={id("ca-signed")}>Signed on</Label>
            <Input
              id={id("ca-signed")}
              type="date"
              value={form.caSignedOn}
              onChange={(event) => set("caSignedOn", event.target.value)}
              onBlur={save}
            />
          </div>
        </div>
      </Section>

      <Section title="Registration">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor={id("reg-stage")}>Stage</Label>
            <Select
              id={id("reg-stage")}
              value={form.registrationStage}
              onChange={(event) => saveNow({ ...form, registrationStage: event.target.value })}
            >
              {REGISTRATION_STAGES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={id("reg-on")}>Registered on</Label>
            <Input
              id={id("reg-on")}
              type="date"
              value={form.registrationOn}
              onChange={(event) => set("registrationOn", event.target.value)}
              onBlur={save}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor={id("reg-note")}>Note</Label>
            <Input
              id={id("reg-note")}
              value={form.registrationNote}
              onChange={(event) => set("registrationNote", event.target.value)}
              onBlur={save}
              placeholder="Thumb impression to be sent…"
              autoComplete="off"
            />
          </div>
        </div>
      </Section>

      <Section title="Where this plot stands">
        <div className="space-y-4">
          <BottleneckPicker engagementId={engagement.id} values={engagement.bottlenecks} />

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor={id("owner")}>Handled by</Label>
              <Select
                id={id("owner")}
                value={form.ownerId}
                onChange={(event) => saveNow({ ...form, ownerId: event.target.value })}
              >
                <option value="">Nobody yet</option>
                {owners.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={id("check-in")}>Check-in done</Label>
              <Input
                id={id("check-in")}
                type="date"
                value={form.checkInOn}
                onChange={(event) => set("checkInOn", event.target.value)}
                onBlur={save}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={id("plot-value")}>Plot value (₹)</Label>
              <Input
                id={id("plot-value")}
                type="number"
                min="0"
                step="1"
                inputMode="decimal"
                value={form.plotValue}
                onChange={(event) => set("plotValue", event.target.value)}
                onBlur={save}
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={id("construction-value")}>Construction value (₹)</Label>
              <Input
                id={id("construction-value")}
                type="number"
                min="0"
                step="1"
                inputMode="decimal"
                value={form.constructionValue}
                onChange={(event) => set("constructionValue", event.target.value)}
                onBlur={save}
                autoComplete="off"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={id("design-support")}>Design support needed</Label>
              <Textarea
                id={id("design-support")}
                rows={3}
                value={form.designSupport}
                onChange={(event) => set("designSupport", event.target.value)}
                onBlur={save}
                placeholder="Flooring to confirm, 3D to be shared…"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={id("details")}>Details</Label>
              <Textarea
                id={id("details")}
                rows={3}
                value={form.details}
                onChange={(event) => set("details", event.target.value)}
                onBlur={save}
                placeholder="Anything worth remembering about this plot."
              />
            </div>
          </div>
        </div>
      </Section>

      <FormMessage error={error} success={saved ? "Saved" : undefined} size="xs" />
    </div>
  );
}
