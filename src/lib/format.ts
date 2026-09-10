export function brl(value: number | null | undefined): string {
  return (value ?? 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  });
}

/** Valores altos em formato compacto: R$ 1,2 mi */
export function brlShort(value: number | null | undefined): string {
  const v = value ?? 0;
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `R$ ${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (abs >= 1_000) return `R$ ${(v / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return brl(v);
}

export function pct(value: number | null | undefined, digits = 1): string {
  return `${((value ?? 0) * 100).toLocaleString("pt-BR", { maximumFractionDigits: digits })}%`;
}

export function num(value: number | null | undefined): string {
  return (value ?? 0).toLocaleString("pt-BR");
}

export function monthLabel(ref: string): string {
  const [y, m] = ref.split("-").map(Number);
  if (!y || !m) return ref;
  const label = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("pt-BR", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });
  return label.replace(".", "").replace(" de ", "/");
}

export function dateBR(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso.length <= 10 ? `${iso}T12:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
}

export function dateTimeBR(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function relativeBR(iso: string | null | undefined): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  if (d < 30) return `há ${d} d`;
  return dateBR(iso);
}

/** 'YYYY-MM' do mes atual. */
export function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Lista de meses ('YYYY-MM') terminando no mes informado. */
export function lastMonths(count: number, end = currentMonth()): string[] {
  const [y, m] = end.split("-").map(Number);
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

export function addMonths(ref: string, delta: number): string {
  const [y, m] = ref.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function toNumber(value: FormDataEntryValue | null, fallback = 0): number {
  if (value === null) return fallback;
  const raw = String(value).trim();
  if (!raw) return fallback;
  // aceita "1.234,56" e "1234.56"
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : fallback;
}

export function str(value: FormDataEntryValue | null): string {
  return value === null ? "" : String(value).trim();
}

export function strOrNull(value: FormDataEntryValue | null): string | null {
  const s = str(value);
  return s === "" ? null : s;
}

/**
 * Como descrever a origem de um conjunto de números de Ads.
 *
 * A tela dizia "N lançamentos" mesmo quando tudo tinha vindo da API e
 * ninguém havia lançado nada. Dizer de onde veio evita que a equipe
 * desconfie do número.
 */
export function origemLabel(automaticos: number, manuais: number): string {
  if (!automaticos && !manuais) return "nada no período";
  if (!manuais) return automaticos === 1 ? "1 campanha, direto da loja" : `${automaticos} campanhas, direto da loja`;
  if (!automaticos) return manuais === 1 ? "1 lançamento à mão" : `${manuais} lançamentos à mão`;
  return `${automaticos} da loja · ${manuais} à mão`;
}
