import { colorForName } from "@/lib/color-hash";
import { cn } from "@/lib/utils";
import Image from "next/image";
import type { CSSProperties } from "react";

/**
 * The hash colours are one fixed set (lib/color-hash.ts) used on both a
 * white tile and a near-black one, so the same recipe cannot serve both.
 * At 8% the tint is a whisper on white and invisible on dark; the raw
 * colour is legible on white and, for the blue and the indigo, close to
 * unreadable on dark.
 *
 * So the colour arrives as a custom property and the mode decides what to
 * do with it — a heavier tint and a lifted text colour in dark. The
 * palette itself stays untouched, as DESIGN.md requires.
 */
const TILE_TINT =
  "bg-[color-mix(in_srgb,var(--thumb)_8%,transparent)] dark:bg-[color-mix(in_srgb,var(--thumb)_16%,transparent)]";
const TILE_TEXT = "text-[var(--thumb)] dark:text-[color-mix(in_srgb,var(--thumb)_70%,#fff)]";

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
        "border-border bg-surface relative aspect-square overflow-hidden rounded-xl border",
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
          className={cn("flex size-full items-center justify-center", TILE_TINT)}
          // Custom properties aren't in React's CSSProperties, hence the cast.
          style={{ "--thumb": color } as CSSProperties}
        >
          <span
            className={cn(
              "px-1.5 text-center text-[11px] font-semibold tracking-wider uppercase",
              TILE_TEXT,
            )}
          >
            {code ?? name.slice(0, 12)}
          </span>
        </div>
      )}
    </div>
  );
}
