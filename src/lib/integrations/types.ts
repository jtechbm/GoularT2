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

/**
 * Um dia da operação.
 *
 * O fechamento mensal continua sendo a verdade do mês, porque é o número
 * que a equipe corrige à mão. Isto aqui é o histórico: dia que passou não
 * muda mais, e é o que permite comparar semana com semana.
 */
export interface DailyResult {
  day: string;
  revenue: number;
  orders: number;
  units: number;
  fees: number;
  shipping: number;
  tax: number;
  ads: number;
  ads_revenue: number;
  clicks: number;
  prints: number;
}

export function emptyDay(day: string): DailyResult {
  return {
    day,
    revenue: 0,
    orders: 0,
    units: 0,
    fees: 0,
    shipping: 0,
    tax: 0,
    ads: 0,
    ads_revenue: 0,
    clicks: 0,
    prints: 0,
  };
}

/** Números fechados que o Elleva consome de cada loja. */
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
  /**
   * Fechamento dia a dia. undefined = o adaptador não sabe abrir por dia,
   * e o histórico diário simplesmente não é gravado para essa loja.
   */
  days?: DailyResult[];
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

/**
 * O mês no fuso de Brasília, não em UTC.
 *
 * Os marketplaces devolvem a data do pedido no horário local do vendedor, e
 * é essa data que aparece no painel dele. Com a janela em UTC, um pedido
 * fechado às 22h do dia 31 entrava no mês seguinte pela apuração mensal e
 * ficava no mês anterior no histórico diário. A soma dos dias não batia com
 * o fechamento, e a diferença era exatamente esse pedido.
 */
const FUSO_BR_MS = 3 * 3600e3;

export function monthRange(refMonth: string): { start: Date; end: Date } {
  const [y, m] = refMonth.split("-").map(Number);
  return {
    start: new Date(Date.UTC(y, m - 1, 1) + FUSO_BR_MS),
    end: new Date(Date.UTC(y, m, 1) + FUSO_BR_MS),
  };
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
