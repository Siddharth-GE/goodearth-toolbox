import { colorForName } from "@/lib/color-hash";

/**
 * A person's face where there is no photo: their colour, their initial.
 * `letters={2}` shows two letters, for a small team whose names share an initial (Sa / Se).
 */
export function Avatar({
  name,
  size = 40,
  letters = 1,
}: {
  name: string;
  size?: number;
  letters?: 1 | 2;
}) {
  const first = name.trim().split(/\s+/)[0] ?? "";
  const initial =
    (letters === 2
      ? first.charAt(0).toUpperCase() + first.charAt(1).toLowerCase()
      : first.charAt(0).toUpperCase()) || "?";
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full font-bold text-white"
      style={{
        backgroundColor: colorForName(name),
        width: size,
        height: size,
        fontSize: size * (letters === 2 ? 0.36 : 0.4),
      }}
    >
      {initial}
    </span>
  );
}
