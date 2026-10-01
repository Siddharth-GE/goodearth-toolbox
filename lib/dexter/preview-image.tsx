import { ImageResponse } from "next/og";

import { PREVIEW_SIZE, previewMarkColor } from "@/lib/dexter/preview";

/**
 * The picture a deck link shows when it is shared on WhatsApp: the
 * Kaadal 'K' mark, centred on the deck's own background colour.
 *
 * Kept apart from `lib/dexter/preview.ts` on purpose — that module is
 * import-free and read by the public viewer on every request, while this
 * one pulls in the image generator. The viewer loads this file LAZILY,
 * inside the one branch that draws a preview, so a deploy that cannot
 * load the generator costs the preview picture and nothing else: the
 * deck itself still opens (BUGCATCHER #15).
 *
 * No text is drawn, so no font is needed — the mark is four vector
 * paths, quoted from the brand's own artwork (`kaadal-k-*.svg`: one
 * drawing, twelve fills). Change the paths only from that artwork.
 */

const MARK_WIDTH = 67.13;
const MARK_HEIGHT = 65.74;
const MARK_PATHS = [
  "M36.57 0.00L63.77 0.00C61.11 9.14 46.99 20.49 30.44 26.74C46.30 9.72 36.57 0.00 36.57 0.00",
  "M24.77 65.74L0.00 65.74C1.73 63.89 2.31 61.57 2.31 58.91L2.31 6.25C2.31 3.82 1.73 1.85 0.00 0.00L21.76 0.00L21.76 58.91C21.76 61.57 22.92 63.89 24.77 65.74",
  "M53.82 65.74L67.13 65.74C61.11 62.73 54.40 40.28 52.78 35.53C52.78 35.53 44.10 41.90 30.44 29.74L39.35 56.25C41.78 64.00 49.54 65.74 53.82 65.74",
];

// The mark stands 240px tall on the 630px card: large enough to read in
// WhatsApp's thumbnail, with the colour left to do the rest.
const DRAWN_HEIGHT = 240;
const DRAWN_WIDTH = Math.round((DRAWN_HEIGHT * MARK_WIDTH) / MARK_HEIGHT);

export function renderPreviewImage(background: string): ImageResponse {
  const fill = previewMarkColor(background);

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: background,
      }}
    >
      <svg
        viewBox={`0 0 ${MARK_WIDTH} ${MARK_HEIGHT}`}
        width={DRAWN_WIDTH}
        height={DRAWN_HEIGHT}
        xmlns="http://www.w3.org/2000/svg"
      >
        {MARK_PATHS.map((d) => (
          <path key={d} d={d} fill={fill} />
        ))}
      </svg>
    </div>,
    { ...PREVIEW_SIZE },
  );
}
