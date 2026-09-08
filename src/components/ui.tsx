import Link from "next/link";
import type { ReactNode } from "react";
import { brl, initials, pct } from "@/lib/format";

export function PageHeader({
  title,
  subtitle,
  actions,
  eyebrow,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && (
          <div className="mb-1 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-accent">{eyebrow}</div>
        )}
        <h1 className="text-2xl font-bold tracking-tight text-ink">{title}</h1>
        {subtitle && <div className="mt-1 text-sm text-muted">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Card({
  title,
  subtitle,
  actions,
  children,
  className = "",
  bodyClassName = "p-5",
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold text-ink">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-dim">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

const TONES: Record<string, string> = {
  brand: "bg-brand-soft text-brand border-brand/30",
  accent: "bg-accent-soft text-accent border-accent/30",
  ok: "bg-ok-soft text-ok border-ok/30",
  warn: "bg-warn-soft text-warn border-warn/30",
  bad: "bg-bad-soft text-bad border-bad/30",
  info: "bg-info-soft text-info border-info/30",
  neutral: "bg-surface-2 text-muted border-line",
};

export type Tone = keyof typeof TONES;

export function Chip({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`chip ${TONES[tone] ?? TONES.neutral}`}>{children}</span>;
}

const STATUS_TONE: Record<string, Tone> = {
  ativo: "ok",
  onboarding: "info",
  atencao: "warn",
  pausado: "neutral",
  encerrado: "bad",
  conectado: "ok",
  pendente: "warn",
  erro: "bad",
  desativado: "neutral",
  disponivel: "info",
  em_andamento: "accent",
  concluida: "ok",
  urgente: "bad",
  alta: "warn",
  media: "brand",
  baixa: "neutral",
};

const STATUS_LABEL: Record<string, string> = {
  ativo: "Ativo",
  onboarding: "Onboarding",
  atencao: "Atenção",
  pausado: "Pausado",
  encerrado: "Encerrado",
  conectado: "Conectado",
  pendente: "Pendente",
  erro: "Erro",
  desativado: "Desativado",
  disponivel: "Disponível",
  em_andamento: "Em andamento",
  concluida: "Concluída",
  urgente: "Urgente",
  alta: "Alta",
  media: "Média",
  baixa: "Baixa",
  mercado_livre: "Mercado Livre",
  shopee: "Shopee",
};

export function StatusChip({ value }: { value: string }) {
  return <Chip tone={STATUS_TONE[value] ?? "neutral"}>{STATUS_LABEL[value] ?? value}</Chip>;
}

export function MarketplaceChip({ value }: { value: string }) {
  const tone: Tone = value === "shopee" ? "accent" : "warn";
  return <Chip tone={tone}>{STATUS_LABEL[value] ?? value}</Chip>;
}

export function Avatar({
  name,
  color,
  size = 28,
  title,
}: {
  name: string;
  color?: string | null;
  size?: number;
  title?: string;
}) {
  return (
    <span
      title={title ?? name}
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        background: `linear-gradient(135deg, ${color ?? "#7c3aed"}, color-mix(in srgb, ${color ?? "#7c3aed"} 55%, #f97316))`,
      }}
    >
      {initials(name)}
    </span>
  );
}

export function Stat({
  label,
  value,
  hint,
  delta,
  tone = "brand",
  href,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  delta?: number | null;
  tone?: Tone;
  href?: string;
}) {
  const bar: Record<string, string> = {
    brand: "from-brand to-accent",
    accent: "from-accent to-brand",
    ok: "from-ok to-brand",
    warn: "from-warn to-accent",
    bad: "from-bad to-accent",
    info: "from-info to-brand",
    neutral: "from-line-strong to-line",
  };
  const inner = (
    <div className="card relative overflow-hidden p-4">
      <div className={`absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r ${bar[tone] ?? bar.brand}`} />
      <div className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-dim">{label}</div>
      <div className="mt-1.5 text-xl font-bold tracking-tight text-ink">{value}</div>
      <div className="mt-1 flex items-center gap-2 text-xs">
        {delta !== undefined && delta !== null && <Delta value={delta} />}
        {hint && <span className="text-dim">{hint}</span>}
      </div>
    </div>
  );
  return href ? (
    <Link href={href} className="block transition-transform hover:-translate-y-0.5">
      {inner}
    </Link>
  ) : (
    inner
  );
}

export function Delta({ value, invert = false }: { value: number; invert?: boolean }) {
  if (!Number.isFinite(value)) return <span className="text-dim">—</span>;
  const up = value >= 0;
  const good = invert ? !up : up;
  return (
    <span className={`font-semibold ${Math.abs(value) < 0.001 ? "text-dim" : good ? "text-ok" : "text-bad"}`}>
      {up ? "▲" : "▼"} {pct(Math.abs(value))}
    </span>
  );
}

export function Money({ value, bold = false }: { value: number; bold?: boolean }) {
  return <span className={`num ${bold ? "font-semibold text-ink" : ""}`}>{brl(value)}</span>;
}

export function Empty({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line px-6 py-10 text-center">
      <p className="text-sm font-medium text-muted">{title}</p>
      {hint && <p className="max-w-md text-xs text-dim">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Field({
  label,
  children,
  hint,
  className = "",
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="label">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[0.7rem] text-dim">{hint}</p>}
    </div>
  );
}

export function Divider({ label }: { label?: string }) {
  if (!label) return <hr className="my-5 border-line" />;
  return (
    <div className="my-5 flex items-center gap-3">
      <span className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-dim">{label}</span>
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}
