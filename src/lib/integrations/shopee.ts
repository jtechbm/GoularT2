import { createHmac } from "node:crypto";
import { all, now, run } from "../db.ts";
import {
  emptyDay,
  emptyMonth,
  IntegrationError,
  monthRange,
  type AdapterContext,
  type DailyResult,
  type MarketplaceAdapter,
  type MonthlyResult,
  mapLimit,
  syncDeadline,
  type StoredCredentials,
} from "./types.ts";

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

    const json = (await res.json()) as {
      access_token?: string;
      refresh_token?: string;
      expire_in?: number;
      error?: string;
      message?: string;
    };
    // a Shopee responde 200 mesmo quando recusa: o erro vem no corpo
    if (json.error || !json.access_token) {
      throw new IntegrationError(
        `Shopee recusou a autorização: ${json.error || "resposta sem access_token"}${json.message ? ` — ${json.message}` : ""}`,
        "auth",
      );
    }
    if (!shopId) throw new IntegrationError("A Shopee não devolveu o shop_id no retorno.", "auth");

    return {
      access_token: json.access_token,
      refresh_token: json.refresh_token,
      expires_at: Date.now() + (json.expire_in ?? 14400) * 1000,
      shop_id: shopId,
    };
  },

  /**
   * Fechamento do mês da Shopee, incremental.
   *
   * A Shopee só dá o valor líquido de um pedido chamando get_escrow_detail
   * pedido a pedido. A versão anterior refazia todas essas chamadas em toda
   * rodada. Com uns 500 pedidos no mês a rodada já passava de 50 segundos, e
   * acima disso a Vercel matava a função no meio: sem gravar erro, a conta
   * ficava "conectada" e os números paravam de mudar em silêncio.
   *
   * Agora:
   *   1. lista os pedidos concluídos dia a dia (a lista não traz a data do
   *      pedido, então a janela de um dia é o que dá o dia de cada um)
   *   2. busca o escrow só dos pedidos que ainda não estão no cache
   *   3. grava em blocos, então o que foi buscado fica salvo mesmo se o
   *      tempo acabar
   *   4. soma tudo a partir do cache
   *
   * Pedido concluído não muda de valor, então cada escrow é buscado uma vez.
   * Depois da primeira carga, cada rodada só lê os pedidos novos do dia.
   */
  async fetchMonth(ctx: AdapterContext, refMonth: string): Promise<MonthlyResult> {
    const creds = await refreshIfNeeded(ctx);
    if (!ctx.accountId) throw new IntegrationError("Sincronização da Shopee precisa do id da conta.", "config");
    const accountId = ctx.accountId;
    // folga de 8 segundos para somar, gravar o fechamento e responder
    const prazo = (ctx.deadline ?? syncDeadline()) - 8000;

    const { start, end } = monthRange(refMonth);
    const out = emptyMonth(refMonth);

    // --- 1. pedidos concluídos, um dia de cada vez (em horário de Brasília)
    const DIA = 86400;
    const primeiro = Math.floor(start.getTime() / 1000);
    const ultimo = Math.min(Math.floor(end.getTime() / 1000), Math.floor(Date.now() / 1000));
    const janelas: { dia: string; from: number; to: number }[] = [];
    for (let from = primeiro; from < ultimo; from += DIA) {
      // start já está em meia-noite de Brasília; o dia local é a data UTC de from - 3h
      const dia = new Date((from - 3 * 3600) * 1000).toISOString().slice(0, 10);
      janelas.push({ dia, from, to: Math.min(from + DIA - 1, ultimo) });
    }

    const pedidoDia = new Map<string, string>();
    const listagem = await mapLimit(janelas, 4, prazo, async (j) => {
      let cursor = "";
      do {
        const page = await call<{
          response: { order_list: { order_sn: string }[]; next_cursor: string; more: boolean };
        }>(
          "/api/v2/order/get_order_list",
          {
            time_range_field: "create_time",
            time_from: j.from,
            time_to: j.to,
            page_size: 100,
            order_status: "COMPLETED",
            cursor,
          },
          creds,
        );
        // Map porque a paginação da Shopee pode repetir pedido, e pedido
        // contado duas vezes vira faturamento inflado
        for (const o of page.response?.order_list ?? []) pedidoDia.set(o.order_sn, j.dia);
        cursor = page.response?.more ? page.response.next_cursor : "";
      } while (cursor);
      return j.dia;
    });

    // sem a lista completa não dá para saber o total do mês; melhor parar
    // honesto do que somar meio mês e chamar de fechamento
    if (listagem.timedOut) {
      return { ...out, incompleto: { feitos: 0, total: pedidoDia.size } };
    }

    const todos = [...pedidoDia.keys()];

    // --- 2. o que já está no cache
    const noCache = new Set<string>();
    for (let i = 0; i < todos.length; i += 500) {
      const lote = todos.slice(i, i + 500);
      const achados = await all<{ order_sn: string }>(
        `SELECT order_sn FROM shopee_order_escrow
          WHERE client_marketplace_id = ? AND order_sn IN (${lote.map(() => "?").join(",")})`,
        accountId,
        ...lote,
      );
      for (const a of achados) noCache.add(a.order_sn);
    }
    const faltam = todos.filter((sn) => !noCache.has(sn));

    // --- 3. busca o escrow dos que faltam, gravando bloco a bloco
    const BLOCO = 40;
    let buscados = 0;
    for (let i = 0; i < faltam.length; i += BLOCO) {
      if (Date.now() > prazo) break;
      const bloco = faltam.slice(i, i + BLOCO);
      const { results } = await mapLimit(bloco, 8, prazo, async (orderSn) => ({
        orderSn,
        detail: await call<EscrowDetail>("/api/v2/payment/get_escrow_detail", { order_sn: orderSn }, creds),
      }));
      if (!results.length) break;

      const linhas = results.map(({ orderSn, detail }) => {
        const income = detail.response?.order_income;
        return {
          orderSn,
          dia: pedidoDia.get(orderSn)!,
          revenue: income?.original_price ?? income?.escrow_amount ?? 0,
          fees: (income?.commission_fee ?? 0) + (income?.service_fee ?? 0) + (income?.transaction_fee ?? 0),
          shipping: income?.actual_shipping_fee ?? 0,
        };
      });

      const valores = linhas.map(() => "(?,?,?,?,?,?,?)").join(",");
      await run(
        `INSERT INTO shopee_order_escrow (client_marketplace_id, order_sn, day, revenue, fees, shipping, fetched_at)
         VALUES ${valores}
         ON CONFLICT (client_marketplace_id, order_sn) DO NOTHING`,
        ...linhas.flatMap((l) => [accountId, l.orderSn, l.dia, l.revenue, l.fees, l.shipping, now()]),
      );
      buscados += linhas.length;
    }

    // --- 4. soma a partir do cache, só dos pedidos que a lista do mês trouxe
    const porDia = new Map<string, DailyResult>();
    for (let i = 0; i < todos.length; i += 500) {
      const lote = todos.slice(i, i + 500);
      const linhas = await all<{ day: string; revenue: number; fees: number; shipping: number }>(
        `SELECT day, revenue, fees, shipping FROM shopee_order_escrow
          WHERE client_marketplace_id = ? AND order_sn IN (${lote.map(() => "?").join(",")})`,
        accountId,
        ...lote,
      );
      for (const l of linhas) {
        out.revenue += l.revenue;
        out.fees += l.fees;
        out.shipping += l.shipping;
        out.orders += 1;
        out.units += 1;
        const alvo = porDia.get(l.day) ?? emptyDay(l.day);
        alvo.revenue += l.revenue;
        alvo.fees += l.fees;
        alvo.shipping += l.shipping;
        alvo.orders += 1;
        alvo.units += 1;
        porDia.set(l.day, alvo);
      }
    }

    out.days = [...porDia.values()].sort((a, b) => a.day.localeCompare(b.day));
    out.profit = out.revenue - out.fees - out.shipping - out.tax - out.ads - out.cogs;

    const lidos = noCache.size + buscados;
    if (lidos < todos.length) out.incompleto = { feitos: lidos, total: todos.length };
    return out;
  },
};
