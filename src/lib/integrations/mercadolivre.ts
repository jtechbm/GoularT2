import {
  emptyMonth,
  IntegrationError,
  monthRange,
  type AdapterContext,
  type MarketplaceAdapter,
  type MonthlyResult,
  mapLimit,
  syncDeadline,
  type StoredCredentials,
} from "./types";

const API = "https://api.mercadolibre.com";
const AUTH = "https://auth.mercadolivre.com.br/authorization";
/** Só leitura, e offline_access para receber o refresh_token. */
const SCOPE = "offline_access read";

interface MLOrder {
  id: number;
  status: string;
  total_amount: number;
  paid_amount?: number;
  date_closed?: string;
  order_items?: { quantity: number; sale_fee?: number; unit_price: number }[];
  payments?: { shipping_cost?: number; taxes_amount?: number; total_paid_amount?: number }[];
  shipping?: { id?: number };
}

function env() {
  return {
    clientId: process.env.ML_CLIENT_ID ?? "",
    clientSecret: process.env.ML_CLIENT_SECRET ?? "",
    redirectUri: process.env.ML_REDIRECT_URI ?? "http://localhost:3000/api/integracoes/mercado-livre/callback",
  };
}

async function refreshIfNeeded(ctx: AdapterContext): Promise<string> {
  const creds = ctx.credentials;
  if (!creds?.access_token) throw new IntegrationError("Conta do Mercado Livre ainda não autorizada.", "auth");

  const stillValid = !creds.expires_at || creds.expires_at > Date.now() + 60_000;
  if (stillValid) return creds.access_token;
  if (!creds.refresh_token) {
    throw new IntegrationError(
      "Token expirado e sem refresh_token. A conta foi autorizada sem offline_access — " +
        "peça uma nova autorização ao lojista.",
      "auth",
    );
  }

  const { clientId, clientSecret } = env();
  const res = await fetch(`${API}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: creds.refresh_token,
    }),
  });
  if (!res.ok) throw new IntegrationError(`Falha ao renovar token do ML (${res.status}).`, "auth");

  const json = (await res.json()) as { access_token: string; refresh_token: string; expires_in: number };
  const next: StoredCredentials = {
    ...creds,
    access_token: json.access_token,
    refresh_token: json.refresh_token ?? creds.refresh_token,
    expires_at: Date.now() + json.expires_in * 1000,
  };
  await ctx.saveCredentials(next);
  return next.access_token!;
}

export const mercadoLivre: MarketplaceAdapter = {
  marketplace: "mercado_livre",
  label: "Mercado Livre",
  requiredEnv: ["ML_CLIENT_ID", "ML_CLIENT_SECRET", "ML_REDIRECT_URI"],

  isConfigured() {
    const { clientId, clientSecret } = env();
    return Boolean(clientId && clientSecret);
  },

  authorizeUrl(state: string) {
    const { clientId, redirectUri } = env();
    const qs = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      // offline_access é o que garante o refresh_token; sem ele a conexão
      // morre em 6 horas. read basta: o sistema só consulta pedidos.
      scope: SCOPE,
      state,
    });
    return `${AUTH}?${qs}`;
  },

  async exchangeCode(code: string) {
    const { clientId, clientSecret, redirectUri } = env();
    const res = await fetch(`${API}/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    });
    if (!res.ok) throw new IntegrationError(`Mercado Livre recusou o código (${res.status}).`, "auth");

    const json = (await res.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
      user_id: number;
      scope?: string;
    };
    return {
      access_token: json.access_token,
      refresh_token: json.refresh_token,
      expires_at: Date.now() + json.expires_in * 1000,
      user_id: String(json.user_id),
      scope: json.scope,
    };
  },

  /**
   * Percorre /orders/search no período e consolida os valores finais.
   * Só o agregado interessa ao GoularT — pedido a pedido não é persistido.
   */
  async fetchMonth(ctx: AdapterContext, refMonth: string): Promise<MonthlyResult> {
    const token = await refreshIfNeeded(ctx);
    const sellerId = ctx.credentials?.user_id ?? ctx.externalId;
    if (!sellerId) throw new IntegrationError("Seller ID do Mercado Livre não informado.", "config");

    const { start, end } = monthRange(refMonth);
    const out = emptyMonth(refMonth);
    const limit = 50;

    const buscarPagina = async (offset: number) => {
      const qs = new URLSearchParams({
        seller: String(sellerId),
        "order.status": "paid",
        "order.date_closed.from": start.toISOString(),
        "order.date_closed.to": end.toISOString(),
        sort: "date_asc",
        limit: String(limit),
        offset: String(offset),
      });
      const res = await fetch(`${API}/orders/search?${qs}`, {
        headers: { authorization: `Bearer ${token}`, accept: "application/json" },
      });
      if (!res.ok) throw new IntegrationError(`Erro ao listar pedidos do ML (${res.status}).`);
      return (await res.json()) as { results: MLOrder[]; paging: { total: number } };
    };

    const somar = (orders: MLOrder[]) => {
      for (const order of orders) {
        out.orders += 1;
        out.revenue += order.total_amount ?? 0;
        for (const item of order.order_items ?? []) {
          out.units += item.quantity ?? 0;
          out.fees += item.sale_fee ?? 0;
        }
        for (const payment of order.payments ?? []) {
          out.shipping += payment.shipping_cost ?? 0;
          out.tax += payment.taxes_amount ?? 0;
        }
      }
    };

    // a primeira página informa o total; as demais vão em paralelo
    const primeira = await buscarPagina(0);
    somar(primeira.results ?? []);

    const total = Math.min(primeira.paging?.total ?? 0, 10000);
    const offsets: number[] = [];
    for (let offset = limit; offset < total; offset += limit) offsets.push(offset);

    if (offsets.length) {
      const { results, done, timedOut } = await mapLimit(offsets, 5, syncDeadline(), buscarPagina);
      for (const page of results) somar(page.results ?? []);
      if (timedOut) {
        throw new IntegrationError(
          `Mês grande demais para sincronizar de uma vez: ${(done + 1) * limit} de ${total} pedidos ` +
            "processados antes do tempo limite.",
        );
      }
    }

    // custo de produto não vem da API — fica com o time e entra pela tela do cliente
    out.profit = out.revenue - out.fees - out.shipping - out.tax - out.ads - out.cogs;
    return out;
  },
};
