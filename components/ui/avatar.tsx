import { colorForName } from "@/lib/color-hash";

export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full font-bold text-white"
      style={{ backgroundColor: colorForName(name), width: size, height: size, fontSize: size * 0.4 }}
    >
      {initial}
    </span>
  );
}
