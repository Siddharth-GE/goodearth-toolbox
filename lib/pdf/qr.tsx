import { Path, Svg } from "@react-pdf/renderer";
import { create } from "qrcode";
import { pdf } from "./theme";

/** A QR code drawn as vector squares, so it scans sharp at any print size. Four modules of quiet zone, as scanners expect. */
export function QrCode({ value, size }: { value: string; size: number }) {
  const { modules } = create(value, { errorCorrectionLevel: "M" });
  const quiet = 4;
  const span = modules.size + quiet * 2;
  let d = "";
  for (let row = 0; row < modules.size; row++) {
    for (let col = 0; col < modules.size; col++) {
      if (modules.get(row, col)) d += `M${col + quiet} ${row + quiet}h1v1h-1z`;
    }
  }
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${span} ${span}`}>
      <Path d={d} fill={pdf.color.ink} />
    </Svg>
  );
}
