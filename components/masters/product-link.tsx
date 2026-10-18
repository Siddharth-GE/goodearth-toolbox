import { cn } from "@/lib/utils";
import { ExternalLink } from "lucide-react";

export function isWebLink(url: string | null | undefined): url is string {
  return !!url && /^https?:\/\//i.test(url);
}

/** The vendor's product page in a new tab. `items.source_url` comes from vendor spreadsheets, so anything not http(s) renders nothing. */
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
