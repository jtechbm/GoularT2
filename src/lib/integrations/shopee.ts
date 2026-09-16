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
export async function refreshIfNeeded(ctx: AdapterContext): Promise<StoredCredentials> {
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

export async function call<T>(
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
      escrow_amount_after_adjustment?: number;
      order_selling_price?: number;
      original_price?: number;
      commission_fee?: number;
      service_fee?: number;
      seller_transaction_fee?: number;
    };
  };
}

/**
 * Status que não contam como venda.
 *
 * A regra é por exclusão, e não por lista do que conta, de propósito: a
 * Shopee Brasil tem status próprios (como o de nota fiscal pendente, que é
 * pedido já pago), e um status novo que aparecer amanhã deve contar como
 * venda em vez de sumir do faturamento sem ninguém perceber.
 */
export const STATUS_FORA_DA_VENDA = new Set(["UNPAID", "IN_CANCEL", "CANCELLED"]);

/** Dia do pedido em horário de Brasília, a partir do create_time da Shopee. */
export function diaDoPedido(createTime: number): string {
  return new Date((createTime - 3 * 3600) * 1000).toISOString().slice(0, 10);
}

/**
 * Converte o escrow da Shopee nos números do sistema.
 *
 * Conferido em pedidos reais: o repasse ao vendedor é exatamente o preço de
 * venda menos comissão e taxa de serviço. Duas correções em relação à versão
 * anterior, que estava errada:
 *
 *  - faturamento é order_selling_price, o preço depois do desconto do
 *    vendedor. A versão anterior usava original_price, o preço de tabela
 *    antes do desconto, e contava R$ 74,85 num produto vendido por R$ 49,40.
 *  - o frete não é custo do vendedor quando comprador e subsídio da Shopee
 *    pagam. A versão anterior somava actual_shipping_fee como despesa. Agora
 *    "outros descontos" é o que o repasse retém além das taxas, calculado a
 *    partir do próprio repasse; quando o vendedor paga frete, aparece ali.
 */
export function valoresDoEscrow(detail: EscrowDetail) {
  const i = detail.response?.order_income ?? {};
  const venda = i.order_selling_price ?? 0;
  const taxas = (i.commission_fee ?? 0) + (i.service_fee ?? 0) + (i.seller_transaction_fee ?? 0);
  const repasse = i.escrow_amount_after_adjustment ?? i.escrow_amount ?? 0;
  const outros = Math.max(0, Math.round((venda - taxas - repasse) * 100) / 100);
  return { venda, taxas, outros, repasse };
}

/**
 * Busca o escrow dos pedidos que precisam e grava.
 *
 * Um pedido precisa de nova leitura quando não está guardado, ou quando o
 * status mudou e ele ainda não é final. Pedido concluído não é lido de novo.
 * Grava em blocos, para o progresso ficar salvo se o tempo acabar.
 */
export async function atualizarPedidos(
  accountId: string,
  creds: StoredCredentials,
  pedidos: { orderSn: string; status: string; dia: string }[],
  prazo: number,
): Promise<{ lidos: number; pendentes: number }> {
  const precisam: typeof pedidos = [];

  for (let i = 0; i < pedidos.length; i += 500) {
    const lote = pedidos.slice(i, i + 500);
    const guardados = await all<{ order_sn: string; status: string | null; final: number }>(
      `SELECT order_sn, status, final FROM shopee_order_escrow
        WHERE client_marketplace_id = ? AND order_sn IN (${lote.map(() => "?").join(",")})`,
      accountId,
      ...lote.map((p) => p.orderSn),
    );
    const mapa = new Map(guardados.map((g) => [g.order_sn, g]));
    for (const p of lote) {
      const g = mapa.get(p.orderSn);
      if (!g) precisam.push(p);
      else if (!g.final && g.status !== p.status) precisam.push(p);
    }
  }

  // Cancelado e não pago não viram venda e valem zero: gravados direto, sem
  // gastar chamada à Shopee. Numa loja real isso era mais de um quarto dos
  // pedidos do mês. Se um pedido não pago for pago depois, o status muda e
  // aí o valor é buscado.
  const semValor = precisam.filter((p) => STATUS_FORA_DA_VENDA.has(p.status));
  for (let i = 0; i < semValor.length; i += 200) {
    const lote = semValor.slice(i, i + 200);
    await run(
      `INSERT INTO shopee_order_escrow (client_marketplace_id, order_sn, day, revenue, fees, shipping, fetched_at,
                                        status, escrow_amount, final, updated_at)
       VALUES ${lote.map(() => "(?,?,?,0,0,0,?,?,0,0,?)").join(",")}
       ON CONFLICT (client_marketplace_id, order_sn) DO UPDATE SET
         revenue = 0, fees = 0, shipping = 0, escrow_amount = 0,
         status = EXCLUDED.status, updated_at = EXCLUDED.updated_at`,
      ...lote.flatMap((p) => [accountId, p.orderSn, p.dia, now(), p.status, now()]),
    );
  }
  const comValor = precisam.filter((p) => !STATUS_FORA_DA_VENDA.has(p.status));

  const BLOCO = 40;
  let lidos = semValor.length;
  for (let i = 0; i < comValor.length; i += BLOCO) {
    if (Date.now() > prazo) break;
    const bloco = comValor.slice(i, i + BLOCO);
    const { results } = await mapLimit(bloco, 8, prazo, async (p) => ({
      p,
      detail: await call<EscrowDetail>("/api/v2/payment/get_escrow_detail", { order_sn: p.orderSn }, creds),
    }));
    if (!results.length) break;

    const linhas = results.map(({ p, detail }) => {
      const v = valoresDoEscrow(detail);
      return [
        accountId, p.orderSn, p.dia, v.venda, v.taxas, v.outros, now(),
        p.status, v.repasse, p.status === "COMPLETED" ? 1 : 0, now(),
      ];
    });
    await run(
      `INSERT INTO shopee_order_escrow (client_marketplace_id, order_sn, day, revenue, fees, shipping, fetched_at,
                                        status, escrow_amount, final, updated_at)
       VALUES ${linhas.map(() => "(?,?,?,?,?,?,?,?,?,?,?)").join(",")}
       ON CONFLICT (client_marketplace_id, order_sn) DO UPDATE SET
         day = EXCLUDED.day, revenue = EXCLUDED.revenue, fees = EXCLUDED.fees, shipping = EXCLUDED.shipping,
         status = EXCLUDED.status, escrow_amount = EXCLUDED.escrow_amount, final = EXCLUDED.final,
         updated_at = EXCLUDED.updated_at`,
      ...linhas.flat(),
    );
    lidos += linhas.length;
  }

  return { lidos, pendentes: precisam.length - lidos };
}

/**
 * Fechamento do mês calculado a partir dos pedidos guardados.
 *
 * Usado pela rodada diária e pelo aviso em tempo real, para os dois darem
 * sempre o mesmo número.
 */
export async function resultadoDoMesShopee(accountId: string, refMonth: string): Promise<MonthlyResult> {
  const out = emptyMonth(refMonth);
  const fora = [...STATUS_FORA_DA_VENDA];
  const linhas = await all<{ day: string; revenue: number; fees: number; shipping: number; final: number }>(
    `SELECT day, revenue, fees, shipping, final FROM shopee_order_escrow
      WHERE client_marketplace_id = ? AND day LIKE ?
        AND (status IS NULL OR status NOT IN (${fora.map(() => "?").join(",")}))`,
    accountId,
    `${refMonth}-%`,
    ...fora,
  );

  const porDia = new Map<string, DailyResult>();
  let provPedidos = 0;
  let provValor = 0;
  for (const l of linhas) {
    out.revenue += l.revenue;
    out.fees += l.fees;
    out.shipping += l.shipping;
    out.orders += 1;
    out.units += 1;
    if (!l.final) {
      provPedidos += 1;
      provValor += l.revenue;
    }
    const alvo = porDia.get(l.day) ?? emptyDay(l.day);
    alvo.revenue += l.revenue;
    alvo.fees += l.fees;
    alvo.shipping += l.shipping;
    alvo.orders += 1;
    alvo.units += 1;
    porDia.set(l.day, alvo);
  }

  out.days = [...porDia.values()].sort((a, b) => a.day.localeCompare(b.day));
  out.profit = out.revenue - out.fees - out.shipping - out.tax - out.ads - out.cogs;
  if (provPedidos) out.provisorio = { pedidos: provPedidos, valor: provValor };
  // o frete aqui sai do próprio repasse da Shopee: zero é zero de verdade
  out.freteApurado = true;
  return out;
}

/**
 * Um pedido só, vindo do aviso em tempo real.
 *
 * O aviso traz o número e o status, mas não a data do pedido, então busca o
 * detalhe para saber o dia. São duas chamadas à Shopee por aviso.
 */
export async function processarPedidoShopee(
  accountId: string,
  creds: StoredCredentials,
  orderSn: string,
  status: string,
): Promise<{ dia: string }> {
  const detalhe = await call<{ response?: { order_list?: { order_sn: string; create_time: number; order_status: string }[] } }>(
    "/api/v2/order/get_order_detail",
    { order_sn_list: orderSn, response_optional_fields: "order_status,create_time" },
    creds,
  );
  const pedido = detalhe.response?.order_list?.[0];
  if (!pedido) throw new IntegrationError(`Pedido ${orderSn} não encontrado na Shopee.`);

  const dia = diaDoPedido(pedido.create_time);
  // o status do detalhe é o mais recente; o do aviso pode ter chegado fora de ordem
  await atualizarPedidos(accountId, creds, [{ orderSn, status: pedido.order_status || status, dia }], Date.now() + 20_000);
  return { dia };
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
   * Fechamento do mês da Shopee.
   *
   * Lista todos os pedidos do mês, dia a dia e em qualquer status, e atualiza
   * só os que são novos ou mudaram de status. O número vem da tabela de
   * pedidos, a mesma que o aviso em tempo real alimenta. Esta rodada virou a
   * rede de segurança para algum aviso que se perdeu.
   */
  async fetchMonth(ctx: AdapterContext, refMonth: string): Promise<MonthlyResult> {
    const creds = await refreshIfNeeded(ctx);
    if (!ctx.accountId) throw new IntegrationError("Sincronização da Shopee precisa do id da conta.", "config");
    const accountId = ctx.accountId;
    const prazo = (ctx.deadline ?? syncDeadline()) - 8000;

    const { start, end } = monthRange(refMonth);
    const DIA = 86400;
    const primeiro = Math.floor(start.getTime() / 1000);
    const ultimo = Math.min(Math.floor(end.getTime() / 1000), Math.floor(Date.now() / 1000));
    const janelas: { dia: string; from: number; to: number }[] = [];
    for (let from = primeiro; from < ultimo; from += DIA) {
      janelas.push({ dia: diaDoPedido(from), from, to: Math.min(from + DIA - 1, ultimo) });
    }

    const pedidos = new Map<string, { orderSn: string; status: string; dia: string }>();
    const listagem = await mapLimit(janelas, 4, prazo, async (j) => {
      let cursor = "";
      do {
        const page = await call<{
          response: {
            order_list: { order_sn: string; order_status?: string }[];
            next_cursor: string;
            more: boolean;
          };
        }>(
          "/api/v2/order/get_order_list",
          {
            time_range_field: "create_time",
            time_from: j.from,
            time_to: j.to,
            page_size: 100,
            response_optional_fields: "order_status",
            cursor,
          },
          creds,
        );
        for (const o of page.response?.order_list ?? []) {
          pedidos.set(o.order_sn, { orderSn: o.order_sn, status: o.order_status ?? "", dia: j.dia });
        }
        cursor = page.response?.more ? page.response.next_cursor : "";
      } while (cursor);
      return j.dia;
    });

    if (listagem.timedOut) {
      return { ...emptyMonth(refMonth), incompleto: { feitos: 0, total: pedidos.size } };
    }

    // pedido não pago e cancelado não viram venda, mas o cancelamento de um
    // pedido que já estava guardado precisa ser registrado para sair da conta
    const relevantes = [...pedidos.values()];
    const { pendentes } = await atualizarPedidos(accountId, creds, relevantes, prazo);

    const out = await resultadoDoMesShopee(accountId, refMonth);
    if (pendentes > 0) out.incompleto = { feitos: relevantes.length - pendentes, total: relevantes.length };
    return out;
  },
};
