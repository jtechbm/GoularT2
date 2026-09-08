import { brlShort, monthLabel, num } from "@/lib/format";

/**
 * Faturamento e lucro lado a lado, em barras — como no material de marca:
 * laranja cheio para faturamento, laranja claro para lucro.
 */
export function RevenueProfitChart({
  data,
  height = 220,
}: {
  data: { ref_month: string; revenue: number; profit: number }[];
  height?: number;
}) {
  if (!data.length) return null;
  const W = 760;
  const H = height;
  const padLeft = 52;
  const padRight = 12;
  const padTop = 12;
  const padBottom = 28;
  const max = Math.max(1, ...data.map((d) => Math.max(d.revenue, d.profit)));
  const innerW = W - padLeft - padRight;
  const innerH = H - padTop - padBottom;
  const step = innerW / data.length;
  const barW = Math.min(14, step * 0.26);
  const gap = 3;
  const y = (v: number) => padTop + innerH - (Math.max(0, v) / max) * innerH;
  const cx = (i: number) => padLeft + step * i + step / 2;
  const grid = [1, 0.75, 0.5, 0.25, 0];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Faturamento e lucro por mês">
      {grid.map((g) => {
        const gy = padTop + innerH * (1 - g);
        return (
          <g key={g}>
            <line x1={padLeft} x2={W - padRight} y1={gy} y2={gy} stroke="var(--border)" strokeWidth="1" />
            <text x={padLeft - 10} y={gy + 3.5} textAnchor="end" fontSize="10" fill="var(--text-dim)">
              {g === 0 ? "R$ 0" : brlShort(max * g).replace("R$ ", "R$ ")}
            </text>
          </g>
        );
      })}

      {data.map((d, i) => (
        <g key={d.ref_month}>
          <rect
            x={cx(i) - barW - gap / 2}
            y={y(d.revenue)}
            width={barW}
            height={Math.max(1, padTop + innerH - y(d.revenue))}
            rx="3"
            fill="var(--primary)"
          >
            <title>{`${monthLabel(d.ref_month)} — faturamento ${brlShort(d.revenue)}`}</title>
          </rect>
          <rect
            x={cx(i) + gap / 2}
            y={y(d.profit)}
            width={barW}
            height={Math.max(1, padTop + innerH - y(d.profit))}
            rx="3"
            fill="var(--primary-light)"
          >
            <title>{`${monthLabel(d.ref_month)} — lucro ${brlShort(d.profit)}`}</title>
          </rect>
          <text x={cx(i)} y={H - 9} textAnchor="middle" fontSize="10.5" fill="var(--text-muted)">
            {monthLabel(d.ref_month).split("/")[0]}
          </text>
        </g>
      ))}
    </svg>
  );
}

export function ChartLegend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-4">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5 text-xs text-muted">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

/**
 * Rosca com o total no centro e legenda ao lado — o formato de
 * "Pedidos por marketplace" do material de marca.
 */
export function Donut({
  parts,
  total,
  totalLabel,
  formatValue = (v: number) => num(v),
}: {
  parts: { label: string; value: number; color: string }[];
  total?: number;
  totalLabel?: string;
  formatValue?: (v: number) => string;
}) {
  const sum = parts.reduce((s, p) => s + Math.max(0, p.value), 0);
  const shown = total ?? sum;
  const size = 152;
  const r = 58;
  const stroke = 22;
  const c = 2 * Math.PI * r;

  let offset = 0;
  const segments = parts.map((p) => {
    const frac = sum > 0 ? Math.max(0, p.value) / sum : 0;
    const seg = { ...p, frac, dash: frac * c, offset };
    offset += frac * c;
    return seg;
  });

  return (
    <div className="flex flex-wrap items-center justify-center gap-6">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={totalLabel ?? "Composição"}>
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
          {sum > 0 &&
            segments.map((s) => (
              <circle
                key={s.label}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={stroke}
                strokeDasharray={`${s.dash} ${c - s.dash}`}
                strokeDashoffset={-s.offset}
              >
                <title>{`${s.label}: ${formatValue(s.value)}`}</title>
              </circle>
            ))}
        </g>
        <text
          x={size / 2}
          y={size / 2 - 2}
          textAnchor="middle"
          fontSize="22"
          fontWeight="700"
          fill="var(--text)"
        >
          {formatValue(shown)}
        </text>
        {totalLabel && (
          <text x={size / 2} y={size / 2 + 16} textAnchor="middle" fontSize="11" fill="var(--text-muted)">
            {totalLabel}
          </text>
        )}
      </svg>

      <ul className="space-y-2.5">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-2.5 text-sm">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
            <span className="flex-1 text-muted">{s.label}</span>
            <span className="font-medium text-ink">{Math.round(s.frac * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Barra de composição para espaços estreitos. */
export function SplitBar({ parts }: { parts: { label: string; value: number; color: string }[] }) {
  const total = parts.reduce((s, p) => s + Math.max(0, p.value), 0);
  if (total <= 0) return <div className="h-2 w-full rounded-full bg-surface-3" />;
  return (
    <div className="space-y-3">
      <div className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full bg-surface-3">
        {parts.map((p) => (
          <div
            key={p.label}
            style={{ width: `${(Math.max(0, p.value) / total) * 100}%`, background: p.color }}
            title={`${p.label}: ${brlShort(p.value)}`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {parts.map((p) => (
          <span key={p.label} className="flex items-center gap-1.5 text-xs">
            <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
            <span className="text-muted">{p.label}</span>
            <span className="font-medium text-ink">{brlShort(p.value)}</span>
            <span className="text-dim">{Math.round((Math.max(0, p.value) / total) * 100)}%</span>
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
