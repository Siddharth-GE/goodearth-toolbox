import { Avatar } from "@/components/ui/avatar";

/**
 * Someone's face, or the coloured initial standing in for it.
 *
 * The shape is settled here from day one even though `photoPath` is
 * always null until 0061 ships the bucket — so turning photos on changes
 * the inside of this one component and nothing that renders it.
 */
export function PersonPhoto({
  name,
  photoPath,
  size = 40,
}: {
  name: string;
  photoPath: string | null;
  size?: number;
}) {
  // Photos arrive with 0061. Until then everyone gets the initial, which
  // is a real design (colour derived from the name, stable per person),
  // not a placeholder waiting to be replaced.
  void photoPath;
  return <Avatar name={name} size={size} />;
}
