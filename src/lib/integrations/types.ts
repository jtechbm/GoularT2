import type { Marketplace } from "@/lib/types";

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
  constructor(
    message: string,
    readonly kind: "config" | "auth" | "api" = "api",
  ) {
    super(message);
    this.name = "IntegrationError";
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
