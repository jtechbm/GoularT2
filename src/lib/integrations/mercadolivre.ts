import {
  emptyMonth,
  IntegrationError,
  monthRange,
  type AdapterContext,
  type AdsCampaign,
  type MarketplaceAdapter,
  type MonthlyResult,
  mapLimit,
  syncDeadline,
  type StoredCredentials,
} from "./types.ts";

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

/**
 * Investimento em Product Ads no período.
 *
 * São duas chamadas com contratos diferentes, o que não é óbvio:
 *  - o anunciante vem de /advertising/advertisers com Api-Version 1
 *  - as campanhas vivem sob o site do anunciante (/advertising/MLB/...) e
 *    exigem api-version 2. Sem o site no caminho a rota responde 404, e sem a
 *    versão 2 ela recusa com "Type mismatch".
 *
 * Devolve null quando não há como saber: conta sem Product Ads (404), token
 * sem a permissão de publicidade (403) ou qualquer falha. Null preserva o
 * valor lançado à mão, em vez de zerá-lo por engano.
 */
async function buscarAds(token: string, refMonth: string): Promise<AdsCampaign[] | null> {
  const autorizacao = { authorization: `Bearer ${token}`, accept: "application/json" };
  const { start, end } = monthRange(refMonth);
  const de = start.toISOString().slice(0, 10);
  const ate = new Date(end.getTime() - 864e5).toISOString().slice(0, 10);

  const resAnunciante = await fetch(`${API}/advertising/advertisers?product_id=PADS`, {
    headers: { ...autorizacao, "Api-Version": "1" },
  });
  if (!resAnunciante.ok) return null; // 404 = conta não anuncia; 403 = sem permissão

  const anunciantes =
    ((await resAnunciante.json()) as { advertisers?: { advertiser_id: number; site_id: string }[] }).advertisers ?? [];
  if (!anunciantes.length) return null;

  const campanhas: AdsCampaign[] = [];
  let algumRespondeu = false;

  for (const a of anunciantes) {
    const qs = new URLSearchParams({
      limit: "100",
      offset: "0",
      date_from: de,
      date_to: ate,
      // total_amount = venda direta + indireta atribuída ao anúncio, que é
      // o número do ROAS; units_quantity é a conversão em unidades
      metrics: "cost,clicks,prints,total_amount,units_quantity",
    });
    const res = await fetch(
      `${API}/advertising/${a.site_id}/advertisers/${a.advertiser_id}/product_ads/campaigns/search?${qs}`,
      { headers: { ...autorizacao, "api-version": "2" } },
    );
    if (!res.ok) continue;

    const corpo = (await res.json()) as {
      results?: {
        id: number;
        name?: string;
        metrics?: { cost?: number; clicks?: number; total_amount?: number; units_quantity?: number };
      }[];
    };
    algumRespondeu = true;

    for (const c of corpo.results ?? []) {
      campanhas.push({
        external_id: String(c.id),
        name: c.name ?? `Campanha ${c.id}`,
        invested: c.metrics?.cost ?? 0,
        revenue: c.metrics?.total_amount ?? 0,
        clicks: c.metrics?.clicks ?? 0,
        orders: c.metrics?.units_quantity ?? 0,
      });
    }
  }

  return algumRespondeu ? campanhas : null;
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
   * Só o agregado interessa ao Elleva — pedido a pedido não é persistido.
   */
  async fetchMonth(ctx: AdapterContext, refMonth: string): Promise<MonthlyResult> {
    const token = await refreshIfNeeded(ctx);
    const sellerId = ctx.credentials?.user_id ?? ctx.externalId;
    if (!sellerId) throw new IntegrationError("Seller ID do Mercado Livre não informado.", "config");

    const { start, end } = monthRange(refMonth);
    const out = emptyMonth(refMonth);
    const limit = 50;
    const prazo = syncDeadline();
    const envios = new Set<number>();

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
          // shipping_cost aqui é o frete que o COMPRADOR pagou — não é custo do
          // vendedor. O custo dele vem de /shipments/{id}/costs, mais abaixo.
          out.tax += payment.taxes_amount ?? 0;
        }
        if (order.shipping?.id) envios.add(order.shipping.id);
      }
    };

    // a primeira página informa o total; as demais vão em paralelo
    const primeira = await buscarPagina(0);
    somar(primeira.results ?? []);

    const total = Math.min(primeira.paging?.total ?? 0, 10000);
    const offsets: number[] = [];
    for (let offset = limit; offset < total; offset += limit) offsets.push(offset);

    if (offsets.length) {
      const { results, done, timedOut } = await mapLimit(offsets, 5, prazo, buscarPagina);
      for (const page of results) somar(page.results ?? []);
      if (timedOut) {
        throw new IntegrationError(
          `Mês grande demais para sincronizar de uma vez: ${(done + 1) * limit} de ${total} pedidos ` +
            "processados antes do tempo limite.",
        );
      }
    }

    // frete que o VENDEDOR paga: uma chamada por envio, em paralelo.
    // Se falhar ou faltar tempo, o faturamento já apurado continua valendo e o
    // frete fica zerado para lançamento manual — melhor do que perder tudo.
    if (envios.size) {
      try {
        const { results } = await mapLimit([...envios], 8, prazo, async (envioId) => {
          const res = await fetch(`${API}/shipments/${envioId}/costs`, { headers: { authorization: `Bearer ${token}`, accept: "application/json" } });
          if (!res.ok) return null;
          return (await res.json()) as { senders?: { cost?: number }[] };
        });
        for (const custo of results) {
          for (const remetente of custo?.senders ?? []) out.shipping += remetente.cost ?? 0;
        }
      } catch {
        out.shipping = 0;
      }
    }

    // investimento em Ads, quando a conta anuncia e o token tem a permissão
    try {
      const campanhas = await buscarAds(token, refMonth);
      if (campanhas !== null) {
        out.adsCampaigns = campanhas;
        out.ads = campanhas.reduce((s, c) => s + c.invested, 0);
      }
    } catch {
      /* Ads é complemento: nunca derruba a apuração do faturamento */
    }

    // custo de produto não vem da API — fica com o time e entra pela tela do cliente
    out.profit = out.revenue - out.fees - out.shipping - out.tax - out.ads - out.cogs;
    return out;
  },
};
