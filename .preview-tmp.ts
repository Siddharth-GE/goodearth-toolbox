/**
 * Draws the villa-wave board as one SVG so the curves can actually be
 * looked at. Uses the real wave model, not a re-implementation.
 */
import { writeFileSync } from "node:fs";
import sharp from "sharp";

import { buildSchedule, type ProjectStage } from "./lib/relay/schedule";
import { buildWave, waveAmpUnit, wavePath, type WaveTrail } from "./lib/relay/wave";

const stages: ProjectStage[] = [
  { id: "s1", name: "Masterplan", weeks: 12, sort_order: 10 },
  { id: "s2", name: "Approvals", weeks: 16, sort_order: 20 },
  { id: "s3", name: "Design", weeks: 4, sort_order: 30 },
  { id: "s4", name: "Technical Drawings", weeks: 16, sort_order: 40 },
  { id: "s5", name: "Construction", weeks: 4, sort_order: 50 },
  { id: "s6", name: "Finishing", weeks: 16, sort_order: 60 },
  { id: "s7", name: "Interiors", weeks: 16, sort_order: 70 },
  { id: "s8", name: "Handover", weeks: 8, sort_order: 80 },
];

const t = (
  stageId: string | null,
  o: Partial<WaveTrail> = {},
): WaveTrail => ({
  projectStageId: stageId,
  isFinished: false,
  isStuck: false,
  isQueued: false,
  ...o,
});

// A spread of the states a real page mixes together.
const villas: { name: string; trails: WaveTrail[] }[] = [
  { name: "Villa 12", trails: [t("s3", { isStuck: true }), t("s3"), t("s4"), t("s2")] },
  { name: "Villa 9", trails: [t("s6"), t("s6", { isStuck: true }), t("s7")] },
  { name: "Villa 14", trails: [t("s4"), t("s4"), t("s5")] },
  { name: "Villa 15", trails: [t("s2", { isWithClient: true })] },
  { name: "Villa 18", trails: [t("s1"), t("s2")] },
  { name: "Villa 6", trails: [t("s1", { isFinished: true }), t("s5", { isFinished: true })] },
  { name: "Villa 21", trails: [t("s3", { isQueued: true }), t("s4", { isQueued: true })] },
  { name: "Villa 30", trails: [] },
];

const planned = buildSchedule(stages, [], "2026-04-01", "2026-08-14T06:30:00.000Z");
const ampUnit = waveAmpUnit(villas.map((v) => v.trails));

const W = 760;
const CARD_W = 712;
const CARD_H = 108;
const WAVE_W = 600;
const WAVE_H = 72;
const PAD = 8;
const GAP = 12;
const TOP = 60;

let body = "";
villas.forEach((v, i) => {
  const wave = buildWave(planned.stages, v.trails, { ampUnit, planPct: planned.planPct });
  if (!wave) return;
  const y = TOP + i * (CARD_H + GAP);
  const tone =
    wave.status === "stuck"
      ? "#dc2626"
      : wave.status === "withClient"
        ? "#d97706"
        : wave.status === "complete"
          ? "#16a34a"
          : "#6b6b66";
  const stroke =
    wave.status === "complete"
      ? "#16a34a"
      : wave.status === "quiet" || wave.status === "waiting"
        ? "#6b6b66"
        : "#1c1c1a";
  const fill = wave.status === "quiet" || wave.status === "waiting" ? "#6b6b66" : "#1f7a5c";
  const baseline = WAVE_H - PAD;
  const d = wavePath(wave.points, WAVE_W, WAVE_H, PAD);
  const area = `${d} L ${WAVE_W} ${baseline} L 0 ${baseline} Z`;
  const hasBody = wave.points.some((p) => p.y > 0);
  const px = (x: number) => x * WAVE_W;
  const py = (yy: number) => baseline - yy * (WAVE_H - PAD * 2);

  body += `
<g transform="translate(24 ${y})">
  <rect width="${CARD_W}" height="${CARD_H}" rx="16" fill="#ffffff" stroke="${wave.status === "stuck" ? "#dc262666" : "#e7e5e2"}"/>
  <text x="16" y="26" font-family="system-ui" font-size="13" font-weight="600" fill="#1c1c1a">${v.name}</text>
  <text x="${CARD_W - 16}" y="26" text-anchor="end" font-family="system-ui" font-size="12" font-weight="500" fill="${tone}">${wave.label}</text>
  <g transform="translate(16 34)">
    ${wave.bands
      .slice(1)
      .map(
        (b) =>
          `<line x1="${px(b.x0)}" y1="${PAD}" x2="${px(b.x0)}" y2="${baseline}" stroke="#e7e5e2" stroke-width="1" stroke-dasharray="3 4"/>`,
      )
      .join("")}
    <line x1="0" y1="${baseline}" x2="${WAVE_W}" y2="${baseline}" stroke="#e7e5e2" stroke-width="1"/>
    ${hasBody ? `<path d="${area}" fill="${fill}" fill-opacity="0.1"/>` : ""}
    <path d="${d}" fill="none" stroke="${stroke}" stroke-width="2.5" stroke-linecap="round"/>
    ${wave.planX !== null ? `<line x1="${px(wave.planX)}" y1="${PAD}" x2="${px(wave.planX)}" y2="${baseline}" stroke="#d97706" stroke-width="1.5" stroke-dasharray="5 4"/>` : ""}
    ${wave.markers
      .map(
        (m) =>
          `<circle cx="${px(m.x)}" cy="${py(m.y)}" r="5" fill="${m.kind === "stuck" ? "#dc2626" : "#d97706"}" stroke="#ffffff" stroke-width="2"/>`,
      )
      .join("")}
  </g>
</g>`;
});

const header = buildWave(planned.stages, [], { ampUnit, planPct: planned.planPct })!;
const headerLabels = header.bands
  .map(
    (b) =>
      `<text x="${40 + ((b.x0 + b.x1) / 2) * WAVE_W}" y="46" text-anchor="middle" font-family="system-ui" font-size="9" font-weight="600" letter-spacing="1" fill="#6b6b66">${b.name.toUpperCase()}</text>`,
  )
  .join("");

const H = TOP + villas.length * (CARD_H + GAP) + 20;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<rect width="${W}" height="${H}" fill="#faf9f7"/>
<text x="24" y="28" font-family="system-ui" font-size="16" font-weight="700" fill="#1c1c1a">Saarang — every villa, one glance</text>
${headerLabels}
${body}
</svg>`;

writeFileSync("board.svg", svg);
sharp(Buffer.from(svg)).png().toFile("board.png").then(() => console.log("png done"));
console.log("wrote board.png", W, "x", H);
