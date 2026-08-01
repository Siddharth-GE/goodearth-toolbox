"use client";

import { FormMessage } from "@/components/ui/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { createItemCategory } from "@/lib/masters/item-categories-actions";
import { useActionState, useEffect, useRef } from "react";

export function CategoryForm() {
  const [state, formAction, pending] = useActionState(createItemCategory, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state?.error) formRef.current?.reset();
    wasPending.current = pending;
  }, [pending, state]);

  return (
    <form ref={formRef} action={formAction} className="space-y-2">
      <div className="flex items-end gap-2">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="category-name">Category name</Label>
          <Input id="category-name" name="name" required autoComplete="off" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="category-kind">Kind</Label>
          <Select id="category-kind" name="kind" defaultValue="catalogue">
            <option value="catalogue">Catalogue</option>
            <option value="material">Material</option>
          </Select>
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Adding…" : "Add"}
        </Button>
      </div>
      <FormMessage error={state?.error} />
    </form>
  );
}
