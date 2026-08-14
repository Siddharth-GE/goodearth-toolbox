import { Avatar } from "@/components/ui/avatar";

/**
 * Someone's face, or the coloured initial standing in for it.
 *
 * The fallback is a real design, not a placeholder: the colour is derived
 * from the name and is stable per person, so a directory with no photos in
 * it still reads as a set of distinct people. Most cards will have no
 * photo for months — the catalogue took the same shape.
 *
 * A plain <img>, not next/image: the bucket is private, and
 * next.config.ts only permits /object/public/** as a remote pattern. There
 * is nothing left to optimise in a 40KB 512px JPEG in any case.
 *
 * The ?v= is the object path, which changes on every replacement — so a
 * new photo appears immediately instead of behind an hour of browser
 * cache.
 */
export function PersonPhoto({
  personId,
  name,
  photoPath,
  size = 40,
}: {
  personId: string;
  name: string;
  photoPath: string | null;
  size?: number;
}) {
  if (!photoPath) return <Avatar name={name} size={size} />;

  const version = photoPath.split("/").pop() ?? "1";

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/directory/photo/${personId}?v=${encodeURIComponent(version)}`}
      alt={name}
      width={size}
      height={size}
      loading="lazy"
      className="shrink-0 rounded-full object-cover"
      style={{ width: size, height: size }}
    />
  );
}
