"use client";

import { RecordFormDialog } from "@/components/masters/record-form-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createClientForm, updateClientForm } from "@/lib/client-relations/actions";
import { CLIENT_STAGES } from "@/lib/client-relations/stages";
import { useState } from "react";

type Person = { id: string; name: string };

type ClientLike = {
  id: string;
  name: string;
  mobile: string | null;
  email: string | null;
  stage: string;
  ownerId: string | null;
  source: string | null;
  firstContactOn: string | null;
  lostReason: string | null;
  notes: string | null;
};

/** One dialog for prospect and client: the same record at different stages. */
export function ClientFormDialog({
  client,
  owners,
  defaultOwnerId,
  trigger,
}: {
  client?: ClientLike;
  owners: Person[];
  /** Who a NEW prospect goes to: the member adding them, who would otherwise not see them (0123). */
  defaultOwnerId?: string | null;
  trigger?: React.ReactNode;
}) {
  const isEdit = !!client;
  // The "why lost" box shows only when it applies; the database refuses a lost record without a reason.
  const [stage, setStage] = useState(client?.stage ?? "prospect");

  return (
    <RecordFormDialog
      label={isEdit ? "person" : "prospect"}
      isEdit={isEdit}
      trigger={trigger}
      action={isEdit ? updateClientForm.bind(null, client.id) : createClientForm}
      onOpen={() => setStage(client?.stage ?? "prospect")}
    >
      <div className="space-y-1.5">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" defaultValue={client?.name} required autoComplete="off" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="mobile">Mobile</Label>
          <Input id="mobile" name="mobile" defaultValue={client?.mobile ?? ""} autoComplete="off" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            defaultValue={client?.email ?? ""}
            autoComplete="off"
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="stage">Stage</Label>
          <Select
            id="stage"
            name="stage"
            value={stage}
            onChange={(event) => setStage(event.target.value)}
          >
            {CLIENT_STAGES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ownerId">Handled by</Label>
          <Select
            id="ownerId"
            name="ownerId"
            defaultValue={(client ? client.ownerId : defaultOwnerId) ?? ""}
          >
            <option value="">Nobody yet</option>
            {owners.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="source">How they found us</Label>
          <Input
            id="source"
            name="source"
            defaultValue={client?.source ?? ""}
            placeholder="Referral, website…"
            autoComplete="off"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="firstContactOn">First contact</Label>
          <Input
            id="firstContactOn"
            name="firstContactOn"
            type="date"
            defaultValue={client?.firstContactOn ?? ""}
          />
        </div>
      </div>

      {stage === "lost" && (
        <div className="space-y-1.5">
          <Label htmlFor="lostReason">Why was this one lost?</Label>
          <Input
            id="lostReason"
            name="lostReason"
            defaultValue={client?.lostReason ?? ""}
            placeholder="Price, timing, bought elsewhere…"
            autoComplete="off"
          />
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" name="notes" rows={3} defaultValue={client?.notes ?? ""} />
      </div>
    </RecordFormDialog>
  );
}
