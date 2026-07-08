/**
 * Gráficas SVG livianas (server components).
 * Una sola serie por gráfica, color de marca, grid recesivo,
 * tooltips nativos vía <title>.
 */

export function BarChart({
  data,
  height = 160,
}: {
  data: { date: string; count: number }[];
  height?: number;
}) {
  const max = Math.max(1, ...data.map((d) => d.count));
  const barWidth = 100 / data.length;

  return (
    <svg
      viewBox={`0 0 100 ${height / 4}`}
      className="w-full"
      style={{ height }}
      role="img"
      aria-label="Leads capturados por día"
      preserveAspectRatio="none"
    >
      {data.map((d, i) => {
        const h = (d.count / max) * (height / 4 - 6);
        return (
          <g key={d.date}>
            <rect
              x={i * barWidth + barWidth * 0.15}
              y={height / 4 - h}
              width={barWidth * 0.7}
              height={Math.max(h, d.count > 0 ? 1 : 0.3)}
              rx={0.8}
              fill={d.count > 0 ? "#1d62f1" : "#e2e8f0"}
            >
              <title>{`${d.date}: ${d.count} leads`}</title>
            </rect>
          </g>
        );
      })}
    </svg>
  );
}

export function FunnelBars({
  stages,
}: {
  stages: { label: string; count: number }[];
}) {
  const max = Math.max(1, ...stages.map((s) => s.count));
  return (
    <div className="space-y-1.5">
      {stages.map((stage) => (
        <div key={stage.label} className="flex items-center gap-2 text-xs">
          <span className="w-36 shrink-0 truncate text-slate-600" title={stage.label}>
            {stage.label}
          </span>
          <div className="h-4 flex-1 rounded bg-slate-100">
            <div
              className="h-4 rounded bg-brand-500"
              style={{ width: `${Math.max((stage.count / max) * 100, stage.count > 0 ? 2 : 0)}%` }}
              title={`${stage.label}: ${stage.count}`}
            />
          </div>
          <span className="w-8 text-right font-medium tabular-nums text-slate-700">
            {stage.count}
          </span>
        </div>
      ))}
    </div>
  );
}

export function MetricCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "default" | "good" | "warn" | "bad";
}) {
  const toneClass = {
    default: "text-slate-900",
    good: "text-emerald-700",
    warn: "text-amber-700",
    bad: "text-red-700",
  }[tone];
  return (
    <div className="card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${toneClass}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}
