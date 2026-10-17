import { Avatar } from "@/components/ui/avatar";

/**
 * A face, or a coloured initial derived from the name (stable per person). Plain <img>, not next/image: the bucket is private.
 * The ?v= is the object path, so a new photo appears immediately, not behind browser cache.
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
