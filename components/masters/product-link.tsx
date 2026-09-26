import { cn } from "@/lib/utils";
import { ExternalLink } from "lucide-react";

/** Only web links become an href — see ProductLink. */
export function isWebLink(url: string | null | undefined): url is string {
  return !!url && /^https?:\/\//i.test(url);
}

/**
 * The vendor's product page for an item, opened in a new tab — the
 * photos, sizes and finishes a catalogue tile has no room for, and what a
 * designer needs to choose between twenty items called "Bench".
 *
 * `items.source_url` arrives from vendor spreadsheets, so anything that is
 * not an http(s) address renders nothing rather than becoming an href.
 */
export function ProductLink({
  href,
  itemName,
  className,
}: {
  href: string | null;
  itemName: string;
  className?: string;
}) {
  if (!isWebLink(href)) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label={`View ${itemName} on the vendor's site`}
      className={cn(
        "text-accent inline-flex items-center gap-1 text-[11px] font-medium hover:underline",
        className,
      )}
    >
      View product
      <ExternalLink className="size-3" aria-hidden />
    </a>
  );
}
