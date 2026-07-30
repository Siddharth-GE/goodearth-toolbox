import { cn } from "@/lib/utils";

// Bolder than category-badge's tint — this card is the runner's hand-off,
// meant to be glanced at (and eventually printed), not just a small label.
// Static lookup for the same reason as category-badge: Tailwind can't see
// dynamically-built class names.
const CARD_COLOR_CLASSES: Record<string, string> = {
  green: "bg-green-600",
  blue: "bg-blue-600",
  pink: "bg-pink-600",
  indigo: "bg-indigo-600",
  purple: "bg-purple-600",
  orange: "bg-orange-600",
  teal: "bg-teal-600",
};
const FALLBACK = "bg-neutral-700";

export function BibCard({
  bib,
  runnerName,
  categoryName,
  runName,
  teeSize,
  color,
}: {
  bib: string;
  runnerName: string;
  categoryName: string;
  runName: string;
  teeSize: string;
  color: string;
}) {
  return (
    <div
      className={cn(
        "mb-5 overflow-hidden rounded-2xl text-white shadow-sm",
        CARD_COLOR_CLASSES[color] ?? FALLBACK,
      )}
    >
      <div className="px-5 pt-5 pb-4 text-center">
        <p className="text-xs font-medium uppercase tracking-wide text-white/70">Bib Number</p>
        <p className="mt-1 text-5xl font-extrabold tracking-tight">{bib}</p>
      </div>
      <div className="flex items-center justify-between border-t border-white/15 bg-black/10 px-5 py-3 text-sm">
        <div>
          <p className="font-semibold">{runnerName}</p>
          <p className="text-white/70">
            {categoryName} · {runName}
          </p>
        </div>
        <span className="rounded-full bg-white/15 px-2.5 py-1 text-xs font-semibold">{teeSize}</span>
      </div>
    </div>
  );
}
