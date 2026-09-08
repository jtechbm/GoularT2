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
    <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-sm text-muted">{eyebrow}</div>}
        <h1 className="text-[1.6rem] font-bold tracking-tight text-ink">{title}</h1>
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
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-1 pt-4">
          <div className="min-w-0">
            {title && <h2 className="text-[0.95rem] font-semibold text-ink">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

const TONES: Record<string, string> = {
  brand: "bg-brand-soft text-brand",
  accent: "bg-brand-soft text-brand",
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
  info: "bg-info-soft text-info",
  neutral: "bg-surface-3 text-muted",
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
  em_andamento: "brand",
  concluida: "ok",
  urgente: "bad",
  alta: "warn",
  media: "brand",
  baixa: "info",
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

/** Cor de cada marketplace nas listas e nos gráficos. */
export const MARKETPLACE_COLOR: Record<string, string> = {
  mercado_livre: "#facc15",
  shopee: "var(--primary)",
};

export function MarketplaceChip({ value }: { value: string }) {
  return (
    <span className="chip bg-surface-3 text-muted">
      <span
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ background: MARKETPLACE_COLOR[value] ?? "var(--text-dim)" }}
      />
      {STATUS_LABEL[value] ?? value}
    </span>
  );
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
      style={{ width: size, height: size, fontSize: size * 0.38, background: color || "var(--primary)" }}
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
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  delta?: number | null;
  tone?: Tone;
  href?: string;
  icon?: ReactNode;
}) {
  const inner = (
    <div className="card h-full p-4 transition-colors hover:border-line-strong">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted">{label}</span>
        {delta !== undefined && delta !== null && <Delta value={delta} />}
      </div>
      <div className="mt-1.5 text-[1.45rem] font-bold tracking-tight text-ink">{value}</div>
      <div className="mt-1 flex items-end justify-between gap-2">
        <span className="text-xs text-muted">{hint}</span>
        {icon && <span className={`shrink-0 ${TONES[tone]?.split(" ")[1] ?? "text-brand"}`}>{icon}</span>}
      </div>
    </div>
  );
  return href ? (
    <Link href={href} className="block h-full">
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
  const flat = Math.abs(value) < 0.001;
  return (
    <span
      className={`text-xs font-medium ${flat ? "text-dim" : good ? "text-ok" : "text-bad"}`}
    >
      {up ? "↑" : "↓"} {pct(Math.abs(value))}
    </span>
  );
}

export function Money({ value, bold = false }: { value: number; bold?: boolean }) {
  return <span className={`num ${bold ? "font-semibold text-ink" : ""}`}>{brl(value)}</span>;
}

export function Empty({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong px-6 py-10 text-center">
      <p className="text-sm font-medium text-ink">{title}</p>
      {hint && <p className="max-w-md text-xs leading-relaxed text-muted">{hint}</p>}
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
      {hint && <p className="mt-1 text-xs text-dim">{hint}</p>}
    </div>
  );
}

export function Divider({ label }: { label?: string }) {
  if (!label) return <hr className="my-5 border-line" />;
  return (
    <div className="my-5 flex items-center gap-3">
      <span className="text-xs font-medium text-muted">{label}</span>
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}
