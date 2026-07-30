export function HeroCounter({ total, label }: { total: number; label: string }) {
  return (
    <div className="text-center">
      <div className="bg-gradient-to-r from-[#0071E3] via-[#AF52DE] to-[#FF2D55] bg-clip-text text-7xl font-extrabold tracking-tight text-transparent tabular-nums">
        {total}
      </div>
      <p className="mt-1 text-sm font-semibold text-muted">{label}</p>
    </div>
  );
}
