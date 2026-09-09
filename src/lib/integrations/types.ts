import type { Marketplace } from "@/lib/types";

/** Uma campanha de Ads no mês, como o marketplace a reporta. */
export interface AdsCampaign {
  /** id da campanha no marketplace — chave para atualizar em vez de duplicar */
  external_id: string;
  name: string;
  invested: number;
  /** receita atribuída à campanha (venda direta + indireta) */
  revenue: number;
  clicks: number;
  /** unidades vendidas via anúncio; é o que o marketplace reporta como conversão */
  orders: number;
}

/** Números fechados que o GoularT consome de cada marketplace. */
export interface MonthlyResult {
  ref_month: string;
  revenue: number;
  orders: number;
  units: number;
  fees: number;
  shipping: number;
  tax: number;
  ads: number;
  cogs: number;
  profit: number;
  /**
   * Detalhe do investimento em Ads, quando a API abre por campanha.
   * undefined = a API não respondeu; não apague o que já está gravado.
   */
  adsCampaigns?: AdsCampaign[];
}

export interface StoredCredentials {
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
  shop_id?: string;
  user_id?: string;
  scope?: string;
}

export interface AdapterContext {
  externalId: string | null;
  credentials: StoredCredentials | null;
  /** Persiste tokens renovados durante a chamada. */
  saveCredentials: (next: StoredCredentials) => void | Promise<void>;
}

export interface MarketplaceAdapter {
  marketplace: Marketplace;
  label: string;
  /** Env vars necessárias para a integração funcionar. */
  requiredEnv: string[];
  isConfigured(): boolean;
  /** URL de consentimento OAuth. */
  authorizeUrl(state: string): string;
  /** Troca o código do callback por tokens. */
  exchangeCode(code: string, extra?: Record<string, string>): Promise<StoredCredentials>;
  /** Busca os valores fechados do mês (YYYY-MM). */
  fetchMonth(ctx: AdapterContext, refMonth: string): Promise<MonthlyResult>;
}

export class IntegrationError extends Error {
  // campo explícito em vez de parameter property: assim o módulo também
  // roda nos scripts com --experimental-strip-types
  readonly kind: "config" | "auth" | "api";

  constructor(message: string, kind: "config" | "auth" | "api" = "api") {
    super(message);
    this.name = "IntegrationError";
    this.kind = kind;
  }
}

export function monthRange(refMonth: string): { start: Date; end: Date } {
  const [y, m] = refMonth.split("-").map(Number);
  return { start: new Date(Date.UTC(y, m - 1, 1)), end: new Date(Date.UTC(y, m, 1)) };
}

export function emptyMonth(refMonth: string): MonthlyResult {
  return {
    ref_month: refMonth,
    revenue: 0,
    orders: 0,
    units: 0,
    fees: 0,
    shipping: 0,
    tax: 0,
    ads: 0,
    cogs: 0,
    profit: 0,
  };
}

/**
 * Executa em paralelo com limite de simultaneidade e um prazo.
 * Devolve o que conseguiu e avisa se o prazo estourou — melhor uma
 * resposta honesta de "incompleto" do que a função ser cortada no meio.
 */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  deadline: number,
  fn: (item: T) => Promise<R>,
): Promise<{ results: R[]; done: number; timedOut: boolean }> {
  const results: R[] = [];
  let next = 0;
  let timedOut = false;

  async function worker() {
    while (true) {
      if (Date.now() > deadline) {
        timedOut = true;
        return;
      }
      const i = next++;
      if (i >= items.length) return;
      results.push(await fn(items[i]));
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return { results, done: results.length, timedOut };
}

/** Prazo padrão de uma sincronização, deixando folga para gravar o resultado. */
export function syncDeadline(seconds = 45): number {
  return Date.now() + seconds * 1000;
}
