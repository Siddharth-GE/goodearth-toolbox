import { colorForName } from "@/lib/color-hash";
import { cn } from "@/lib/utils";
import Image from "next/image";

/**
 * An item's picture — or, far more often, its stand-in.
 *
 * Only ~900 of the 2,633 catalogue items have a thumbnail, so the
 * no-image case is the majority, not the exception. It gets a tinted tile
 * carrying the item's code rather than a broken-image icon: same shape,
 * same weight, zero network requests, and it reads as a design decision
 * instead of something that failed to load.
 *
 * Colour comes from lib/color-hash.ts — the same by-name hashing used for
 * avatars and Marathon's category badges, so an item keeps its colour
 * everywhere it appears.
 */
export function ItemThumb({
  code,
  name,
  thumbUrl,
  className,
  sizes = "160px",
}: {
  code: string | null;
  name: string;
  thumbUrl: string | null;
  className?: string;
  sizes?: string;
}) {
  const color = colorForName(code ?? name);

  return (
    <div
      className={cn(
        "relative aspect-square overflow-hidden rounded-xl border border-border bg-surface",
        className,
      )}
    >
      {thumbUrl ? (
        <Image
          src={thumbUrl}
          // Decorative: the item's name is always rendered next to this.
          alt=""
          fill
          sizes={sizes}
          className="object-contain p-1.5"
        />
      ) : (
        <div
          className="flex size-full items-center justify-center"
          // Hash colours are a deliberate non-token system (see DESIGN.md);
          // 0x14 alpha keeps the tint quiet enough to sit behind text.
          style={{ backgroundColor: `${color}14` }}
        >
          <span
            className="px-1.5 text-center text-[11px] font-semibold uppercase tracking-wider"
            style={{ color }}
          >
            {code ?? name.slice(0, 12)}
          </span>
        </div>
      )}
    </div>
  );
}
