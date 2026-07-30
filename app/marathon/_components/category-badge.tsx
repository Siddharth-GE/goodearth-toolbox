import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// Static lookup, not a template literal — Tailwind can only see class names
// that appear literally in source, so `bg-${color}-100` would silently be
// dropped from the production build.
const COLOR_CLASSES: Record<string, string> = {
  green: "bg-green-100 text-green-800 dark:bg-green-500/20 dark:text-green-300",
  blue: "bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-300",
  pink: "bg-pink-100 text-pink-800 dark:bg-pink-500/20 dark:text-pink-300",
  indigo: "bg-indigo-100 text-indigo-800 dark:bg-indigo-500/20 dark:text-indigo-300",
  purple: "bg-purple-100 text-purple-800 dark:bg-purple-500/20 dark:text-purple-300",
  orange: "bg-orange-100 text-orange-800 dark:bg-orange-500/20 dark:text-orange-300",
  teal: "bg-teal-100 text-teal-800 dark:bg-teal-500/20 dark:text-teal-300",
};
const FALLBACK = "bg-black/[0.06] text-foreground dark:bg-white/[0.08]";

export function CategoryBadge({
  name,
  color,
  className,
}: {
  name: string;
  color: string;
  className?: string;
}) {
  return <Badge className={cn(COLOR_CLASSES[color] ?? FALLBACK, className)}>{name}</Badge>;
}
