"use client";

import { CataloguePickerDialog, type PickedLine } from "@/components/masters/catalogue-picker";
import { Button } from "@/components/ui/button";
import { addLines } from "@/lib/selections/actions";
import type { CatalogueItem } from "@/lib/masters/catalogue";
import { RequestItemDialog } from "./request-item-dialog";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Space = { id: string; label: string };

/**
 * Selections' "Add items" — a thin wrapper around the shared
 * CataloguePickerDialog that keeps this tool's two extras: the space
 * chips (which rooms receive the basket) and the request-item escape
 * hatch (a provisional item, created on the spot, dropped straight into
 * the basket).
 */
export function CataloguePicker({
  selectionId,
  unitId,
  spaces,
  currentSpaceId,
  categories,
  brands,
}: {
  selectionId: string;
  unitId: string;
  spaces: Space[];
  currentSpaceId: string;
  categories: { id: string; name: string }[];
  brands: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // Re-synced every time the dialog opens, never trusted from mount.
  // Switching space in the rail is a client-side navigation, so this
  // component is reused and a useState initial value would keep pointing
  // at whichever space was open when the page first loaded — silently
  // writing items into the wrong room.
  const [targetSpaces, setTargetSpaces] = useState<string[]>([currentSpaceId]);

  const commit = async (lines: PickedLine[]) => {
    const targets = targetSpaces;
    const outcome = await addLines(
      selectionId,
      unitId,
      targets,
      lines.map((line) => ({ itemId: line.item.id, quantity: line.quantity })),
    );
    if (outcome?.error) return outcome;
    // Adding into spaces you aren't looking at is a normal thing to do
    // here, but it leaves the screen unchanged and looks like nothing
    // happened. Go to the first space that received the items.
    if (!targets.includes(currentSpaceId)) {
      router.push(`/selections/${selectionId}?space=${targets[0]}`);
    }
  };

  const provisionalItem = (itemId: string, name: string): CatalogueItem => ({
    id: itemId,
    code: null,
    name,
    brand_name: null,
    thumb_url: null,
    indicative_price: null,
    default_uom: "each",
    is_provisional: true,
  });

  return (
    <>
      <Button onClick={() => setOpen(true)}>Add items</Button>
      <CataloguePickerDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          // Opening resets the target to the space you're actually
          // looking at.
          if (next) setTargetSpaces([currentSpaceId]);
        }}
        title="Add items"
        targetLabel={`${targetSpaces.length} ${targetSpaces.length === 1 ? "space" : "spaces"}`}
        categories={categories}
        brands={brands}
        valueMultiplier={targetSpaces.length}
        commitDisabled={targetSpaces.length === 0}
        headerSlot={
          /* Which spaces receive the basket. Defaults to the space you
             came from; tick more to specify four identical bathrooms at
             once. */
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-muted text-xs font-semibold tracking-widest uppercase">
              Add to
            </span>
            {spaces.map((space) => {
              const on = targetSpaces.includes(space.id);
              return (
                <button
                  key={space.id}
                  type="button"
                  onClick={() =>
                    setTargetSpaces((current) =>
                      current.includes(space.id)
                        ? current.filter((id) => id !== space.id)
                        : [...current, space.id],
                    )
                  }
                  className={[
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    on
                      ? "border-accent bg-accent text-accent-foreground"
                      : "border-border text-muted hover:text-foreground",
                  ].join(" ")}
                >
                  {space.label}
                </button>
              );
            })}
          </div>
        }
        extraAction={(addToBasket, search) => (
          <RequestItemDialog
            categories={categories}
            brands={brands}
            prefillName={search}
            onCreated={(itemId, name) => addToBasket(provisionalItem(itemId, name))}
          />
        )}
        onCommit={commit}
      />
    </>
  );
}
