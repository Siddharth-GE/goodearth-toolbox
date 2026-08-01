"use client";

import { RecordFormDialog } from "@/components/masters/record-form-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ClientRow } from "@/lib/masters/clients";
import { createClientRecord, updateClientRecord } from "@/lib/masters/clients-actions";

export function ClientFormDialog({ client }: { client?: ClientRow }) {
  const isEdit = !!client;

  return (
    <RecordFormDialog
      label="Client"
      isEdit={isEdit}
      action={isEdit ? updateClientRecord.bind(null, client.id) : createClientRecord}
    >
      <div className="space-y-1.5">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" defaultValue={client?.name} required autoComplete="off" />
      </div>
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
      <div className="space-y-1.5">
        <Label htmlFor="notes">Notes</Label>
        <Input id="notes" name="notes" defaultValue={client?.notes ?? ""} autoComplete="off" />
      </div>
    </RecordFormDialog>
  );
}
