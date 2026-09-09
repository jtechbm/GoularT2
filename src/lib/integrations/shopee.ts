import { createHmac } from "node:crypto";
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

function env() {
  return {
    partnerId: process.env.SHOPEE_PARTNER_ID ?? "",
    partnerKey: process.env.SHOPEE_PARTNER_KEY ?? "",
    redirectUri: process.env.SHOPEE_REDIRECT_URI ?? "http://localhost:3000/api/integracoes/shopee/callback",
    host: process.env.SHOPEE_HOST ?? "https://partner.shopeemobile.com",
  };
}

/**
 * Shopee assina cada chamada: HMAC-SHA256 de
 * partner_id + path + timestamp [+ access_token + shop_id].
 */
function sign(path: string, timestamp: number, accessToken?: string, shopId?: string): string {
  const { partnerId, partnerKey } = env();
  const base = `${partnerId}${path}${timestamp}${accessToken ?? ""}${shopId ?? ""}`;
  return createHmac("sha256", partnerKey).update(base).digest("hex");
}

/**
 * O access_token da Shopee vale 4 horas. Renova quando falta menos de 5 minutos,
 * guardando o novo par de tokens — o refresh_token também é rotativo.
 */
async function refreshIfNeeded(ctx: AdapterContext): Promise<StoredCredentials> {
  const creds = ctx.credentials;
  if (!creds?.access_token || !creds.shop_id) {
    throw new IntegrationError("Loja Shopee ainda não autorizada.", "auth");
  }
  if (!creds.expires_at || creds.expires_at > Date.now() + 300_000) return creds;
  if (!creds.refresh_token) throw new IntegrationError("Token da Shopee expirado e sem refresh_token.", "auth");

  const { partnerId, partnerKey, host } = env();
  const path = "/api/v2/auth/access_token/get";
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", partnerKey).update(`${partnerId}${path}${timestamp}`).digest("hex");

  const res = await fetch(`${host}${path}?partner_id=${partnerId}&timestamp=${timestamp}&sign=${signature}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      refresh_token: creds.refresh_token,
      partner_id: Number(partnerId),
      shop_id: Number(creds.shop_id),
    }),
  });
  if (!res.ok) throw new IntegrationError(`Falha ao renovar token da Shopee (${res.status}).`, "auth");

  const json = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expire_in?: number;
    error?: string;
    message?: string;
  };
  if (json.error || !json.access_token) {
    throw new IntegrationError(`Shopee recusou a renovação: ${json.error ?? "resposta sem token"} ${json.message ?? ""}`, "auth");
  }

  const next: StoredCredentials = {
    ...creds,
    access_token: json.access_token,
    refresh_token: json.refresh_token ?? creds.refresh_token,
    expires_at: Date.now() + (json.expire_in ?? 14400) * 1000,
  };
  await ctx.saveCredentials(next);
  return next;
}

async function call<T>(
  path: string,
  params: Record<string, string | number>,
  creds?: StoredCredentials,
): Promise<T> {
  const { partnerId, host } = env();
  const timestamp = Math.floor(Date.now() / 1000);
  const qs = new URLSearchParams({
    partner_id: partnerId,
    timestamp: String(timestamp),
    sign: sign(path, timestamp, creds?.access_token, creds?.shop_id),
    ...(creds?.access_token ? { access_token: creds.access_token } : {}),
    ...(creds?.shop_id ? { shop_id: creds.shop_id } : {}),
    ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
  });

  const res = await fetch(`${host}${path}?${qs}`, { headers: { accept: "application/json" } });
  if (!res.ok) throw new IntegrationError(`Shopee respondeu ${res.status} em ${path}.`);

  const json = (await res.json()) as T & { error?: string; message?: string };
  if (json.error) throw new IntegrationError(`Shopee: ${json.error} — ${json.message ?? ""}`);
  return json;
}

interface EscrowDetail {
  response?: {
    order_income?: {
      escrow_amount?: number;
      original_price?: number;
      commission_fee?: number;
      service_fee?: number;
      transaction_fee?: number;
      actual_shipping_fee?: number;
      seller_transaction_fee?: number;
    };
  };
}

export const shopee: MarketplaceAdapter = {
  marketplace: "shopee",
  label: "Shopee",
  requiredEnv: ["SHOPEE_PARTNER_ID", "SHOPEE_PARTNER_KEY", "SHOPEE_REDIRECT_URI"],

  isConfigured() {
    const { partnerId, partnerKey } = env();
    return Boolean(partnerId && partnerKey);
  },

  authorizeUrl(state: string) {
    const { partnerId, redirectUri, host } = env();
    const path = "/api/v2/shop/auth_partner";
    const timestamp = Math.floor(Date.now() / 1000);
    const qs = new URLSearchParams({
      partner_id: partnerId,
      timestamp: String(timestamp),
      sign: sign(path, timestamp),
      redirect: `${redirectUri}?state=${encodeURIComponent(state)}`,
    });
    return `${host}${path}?${qs}`;
  },

  async exchangeCode(code: string, extra?: Record<string, string>) {
    const { partnerId, partnerKey, host } = env();
    const path = "/api/v2/auth/token/get";
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = createHmac("sha256", partnerKey).update(`${partnerId}${path}${timestamp}`).digest("hex");
    const shopId = extra?.shop_id;

    const res = await fetch(`${host}${path}?partner_id=${partnerId}&timestamp=${timestamp}&sign=${signature}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, partner_id: Number(partnerId), shop_id: shopId ? Number(shopId) : undefined }),
    });
    if (!res.ok) throw new IntegrationError(`Shopee recusou o código (${res.status}).`, "auth");

    const json = (await res.json()) as { access_token: string; refresh_token: string; expire_in: number };
    return {
      access_token: json.access_token,
      refresh_token: json.refresh_token,
      expires_at: Date.now() + (json.expire_in ?? 14400) * 1000,
      shop_id: shopId,
    };
  },

  /**
   * Lista os pedidos concluídos do mês e soma o escrow (valor que cai de fato),
   * separando comissão, taxa de serviço e frete.
   * A Shopee limita a janela de get_order_list a 15 dias — por isso o fatiamento.
   */
  async fetchMonth(ctx: AdapterContext, refMonth: string): Promise<MonthlyResult> {
    const creds = await refreshIfNeeded(ctx);

    const { start, end } = monthRange(refMonth);
    const out = emptyMonth(refMonth);
    const orderIds: string[] = [];
    const WINDOW = 14 * 86400;

    for (let from = Math.floor(start.getTime() / 1000); from < Math.floor(end.getTime() / 1000); from += WINDOW) {
      const to = Math.min(from + WINDOW, Math.floor(end.getTime() / 1000));
      let cursor = "";
      do {
        const page = await call<{ response: { order_list: { order_sn: string }[]; next_cursor: string; more: boolean } }>(
          "/api/v2/order/get_order_list",
          {
            time_range_field: "create_time",
            time_from: from,
            time_to: to,
            page_size: 100,
            order_status: "COMPLETED",
            cursor,
          },
          creds,
        );
        orderIds.push(...(page.response?.order_list ?? []).map((o) => o.order_sn));
        cursor = page.response?.more ? page.response.next_cursor : "";
      } while (cursor);
    }

    out.orders = orderIds.length;

    // o escrow é uma chamada por pedido: em paralelo, com limite e prazo
    const { results, done, timedOut } = await mapLimit(orderIds, 8, syncDeadline(), (orderSn) =>
      call<EscrowDetail>("/api/v2/payment/get_escrow_detail", { order_sn: orderSn }, creds),
    );

    if (timedOut) {
      throw new IntegrationError(
        `Mês grande demais para sincronizar de uma vez: ${done} de ${orderIds.length} pedidos processados ` +
          "antes do tempo limite. Sincronize um mês por vez ou reduza o período.",
      );
    }

    for (const detail of results) {
      const income = detail.response?.order_income;
      if (!income) continue;
      out.revenue += income.original_price ?? income.escrow_amount ?? 0;
      out.fees += (income.commission_fee ?? 0) + (income.service_fee ?? 0) + (income.transaction_fee ?? 0);
      out.shipping += income.actual_shipping_fee ?? 0;
      out.units += 1;
    }

    out.profit = out.revenue - out.fees - out.shipping - out.tax - out.ads - out.cogs;
    return out;
  },
};
