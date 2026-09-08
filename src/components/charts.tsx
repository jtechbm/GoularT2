import { brlShort, monthLabel } from "@/lib/format";

/**
 * Faturamento (barras roxas) + lucro (linha laranja) por mês.
 * SVG puro, renderizado no servidor — sem biblioteca de gráfico.
 */
export function RevenueProfitChart({
  data,
  height = 200,
}: {
  data: { ref_month: string; revenue: number; profit: number }[];
  height?: number;
}) {
  if (!data.length) return null;
  const W = 720;
  const H = height;
  const padX = 44;
  const padTop = 16;
  const padBottom = 26;
  const max = Math.max(1, ...data.map((d) => Math.max(d.revenue, d.profit)));
  const innerW = W - padX * 2;
  const innerH = H - padTop - padBottom;
  const step = innerW / data.length;
  const barW = Math.min(38, step * 0.5);
  const y = (v: number) => padTop + innerH - (Math.max(0, v) / max) * innerH;
  const cx = (i: number) => padX + step * i + step / 2;

  const line = data.map((d, i) => `${i === 0 ? "M" : "L"}${cx(i).toFixed(1)},${y(d.profit).toFixed(1)}`).join(" ");
  const grid = [0, 0.25, 0.5, 0.75, 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Faturamento e lucro por mês">
      <defs>
        <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.95" />
          <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.35" />
        </linearGradient>
      </defs>

      {grid.map((g) => {
        const gy = padTop + innerH * g;
        return (
          <g key={g}>
            <line x1={padX} x2={W - padX} y1={gy} y2={gy} stroke="var(--border)" strokeDasharray="3 4" />
            <text x={padX - 8} y={gy + 3.5} textAnchor="end" fontSize="9" fill="var(--text-dim)">
              {brlShort(max * (1 - g)).replace("R$ ", "")}
            </text>
          </g>
        );
      })}

      {data.map((d, i) => (
        <g key={d.ref_month}>
          <rect
            x={cx(i) - barW / 2}
            y={y(d.revenue)}
            width={barW}
            height={Math.max(1, padTop + innerH - y(d.revenue))}
            rx="4"
            fill="url(#barGrad)"
          />
          <text x={cx(i)} y={H - 8} textAnchor="middle" fontSize="9.5" fill="var(--text-dim)">
            {monthLabel(d.ref_month)}
          </text>
        </g>
      ))}

      <path d={line} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinejoin="round" />
      {data.map((d, i) => (
        <circle key={d.ref_month} cx={cx(i)} cy={y(d.profit)} r="3.5" fill="var(--accent)" stroke="var(--surface)" strokeWidth="1.5">
          <title>{`${monthLabel(d.ref_month)} — lucro ${brlShort(d.profit)} / faturamento ${brlShort(d.revenue)}`}</title>
        </circle>
      ))}
    </svg>
  );
}

export function ChartLegend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-4">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5 text-xs text-muted">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

/** Barra de composição (faturamento por marketplace, etc). */
export function SplitBar({ parts }: { parts: { label: string; value: number; color: string }[] }) {
  const total = parts.reduce((s, p) => s + Math.max(0, p.value), 0);
  if (total <= 0) return <div className="h-2.5 w-full rounded-full bg-surface-3" />;
  return (
    <div className="space-y-2">
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-surface-3">
        {parts.map((p) => (
          <div
            key={p.label}
            style={{ width: `${(Math.max(0, p.value) / total) * 100}%`, background: p.color }}
            title={`${p.label}: ${brlShort(p.value)}`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {parts.map((p) => (
          <span key={p.label} className="flex items-center gap-1.5 text-xs">
            <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
            <span className="text-muted">{p.label}</span>
            <span className="font-semibold text-ink">{brlShort(p.value)}</span>
            <span className="text-dim">({Math.round((Math.max(0, p.value) / total) * 100)}%)</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** Mini gráfico de linha para tabelas. */
export function Sparkline({ values, tone = "var(--primary)" }: { values: number[]; tone?: string }) {
  if (values.length < 2) return <span className="text-dim">—</span>;
  const W = 72;
  const H = 22;
  const max = Math.max(...values);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const pts = values
    .map((v, i) => `${(i / (values.length - 1)) * W},${H - ((v - min) / span) * (H - 4) - 2}`)
    .join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="overflow-visible">
      <polyline points={pts} fill="none" stroke={tone} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
