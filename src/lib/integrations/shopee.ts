import { createHmac } from "node:crypto";
import { all, now, one, run } from "../db.ts";
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
  /** corpo JSON: com ele a chamada vira POST, como pedem as rotas em lote */
  body?: unknown,
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

  const res = await fetch(
    `${host}${path}?${qs}`,
    body === undefined
      ? { headers: { accept: "application/json" } }
      : { method: "POST", headers: { accept: "application/json", "content-type": "application/json" }, body: JSON.stringify(body) },
  );
  // o corpo do erro diz o motivo (error_api_permission, error_auth…); o
  // status sozinho não separa "app sem permissão" de "token vencido"
  const json = (await res.json().catch(() => ({}))) as T & { error?: string; message?: string };
  if (json.error) throw new IntegrationError(`Shopee: ${json.error} — ${json.message ?? ""}`);
  if (!res.ok) throw new IntegrationError(`Shopee respondeu ${res.status} em ${path}.`);
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

  // A rota em lote aceita 50 pedidos por chamada e devolve o mesmo
  // order_income da rota unitária (conferido em 50 pedidos reais, zero
  // diferença). A unitária custava uma chamada por pedido, e um mês de 2.600
  // pedidos não cabia numa rodada; buscar 12 meses de histórico era inviável.
  const LOTE = 50;
  const lotes: (typeof comValor)[] = [];
  for (let i = 0; i < comValor.length; i += LOTE) lotes.push(comValor.slice(i, i + LOTE));

  let lidos = semValor.length;
  for (let i = 0; i < lotes.length; i += 4) {
    if (Date.now() > prazo) break;
    const { results: respostas } = await mapLimit(lotes.slice(i, i + 4), 4, prazo, async (lote) => {
      const corpo = await call<{ response?: { escrow_detail?: EscrowDetail["response"] & { order_sn?: string } }[] }>(
        "/api/v2/payment/get_escrow_detail_batch",
        {},
        creds,
        { order_sn_list: lote.map((p) => p.orderSn) },
      );
      const porPedido = new Map(lote.map((p) => [p.orderSn, p]));
      return (corpo.response ?? []).flatMap((item) => {
        const p = porPedido.get(item.escrow_detail?.order_sn ?? "");
        return p ? [{ p, detail: { response: item.escrow_detail } as EscrowDetail }] : [];
      });
    });
    const results = respostas.flat();
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
 * Revalida o status dos pedidos abertos, cinquenta por chamada.
 *
 * Aqui está a economia que faz a rodada caber no tempo do agendamento: o
 * status de cinquenta pedidos vem numa única chamada (get_order_detail aceita
 * até 50 números), e só quem mudou de status paga uma chamada de valor
 * (get_escrow_detail, que é uma por pedido).
 *
 * A versão anterior relistava o mês dia a dia para descobrir o status, o que
 * custava uma chamada por página de cada dia e não cabia na fatia do cron.
 *
 * Os pedidos entram em ordem de leitura mais antiga: assim cada rodada avança
 * na fila em vez de reler sempre os mesmos.
 */
export async function revalidarAbertos(
  accountId: string,
  creds: StoredCredentials,
  refMonth: string,
  prazo: number,
): Promise<{ conferidos: number; mudaram: number; restantes: number }> {
  // Só o que está velho precisa de conferência. Pedido em trânsito continua
  // aberto por semanas: perseguir "todo pedido aberto" deixava a rodada em
  // estado parcial para sempre, mesmo estando em dia. Três dias é o que uma
  // rodada diária sustenta nesta loja, e o aviso em tempo real cobre o resto.
  const velho = new Date(Date.now() - 3 * 864e5).toISOString();
  const abertos = await all<{ order_sn: string; status: string | null; day: string }>(
    `SELECT order_sn, status, day FROM shopee_order_escrow
      WHERE client_marketplace_id = ? AND day LIKE ? AND final = 0
        AND (status IS NULL OR status NOT IN ('CANCELLED','UNPAID'))
        AND (updated_at IS NULL OR updated_at < ?)
      ORDER BY updated_at ASC NULLS FIRST`,
    accountId,
    `${refMonth}-%`,
    velho,
  );
  if (!abertos.length) return { conferidos: 0, mudaram: 0, restantes: 0 };

  const guardado = new Map(abertos.map((a) => [a.order_sn, a]));
  const LOTE = 50;
  let conferidos = 0;
  const mudaram: { orderSn: string; status: string; dia: string }[] = [];

  for (let i = 0; i < abertos.length; i += LOTE) {
    if (Date.now() > prazo) break;
    const lote = abertos.slice(i, i + LOTE);
    const detalhe = await call<{
      response?: { order_list?: { order_sn: string; order_status?: string }[] };
    }>(
      "/api/v2/order/get_order_detail",
      { order_sn_list: lote.map((l) => l.order_sn).join(","), response_optional_fields: "order_status" },
      creds,
    );

    const confirmados: string[] = [];
    for (const pedido of detalhe.response?.order_list ?? []) {
      const antes = guardado.get(pedido.order_sn);
      if (!antes) continue;
      conferidos += 1;
      confirmados.push(pedido.order_sn);
      const agora = pedido.order_status ?? "";
      if (!agora || agora === antes.status) continue;
      mudaram.push({ orderSn: pedido.order_sn, status: agora, dia: antes.day });
    }

    // Quem não mudou também foi conferido agora. Sem esta marca o pedido
    // parado voltaria à fila todo dia e a rodada nunca diria "em dia".
    if (confirmados.length) {
      await run(
        `UPDATE shopee_order_escrow SET updated_at = ?
          WHERE client_marketplace_id = ? AND order_sn IN (${confirmados.map(() => "?").join(",")})`,
        now(),
        accountId,
        ...confirmados,
      );
    }
  }

  // só quem mudou de status precisa do valor novo
  if (mudaram.length) await atualizarPedidos(accountId, creds, mudaram, prazo);

  return { conferidos, mudaram: mudaram.length, restantes: Math.max(0, abertos.length - conferidos) };
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

/** A API de Ads da Shopee usa DD-MM-YYYY, diferente do resto da plataforma. */
function dataAds(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}-${m}-${a}`;
}

/**
 * Investimento em Shopee Ads (CPC) no mês, dia a dia.
 *
 * Usa a performance diária da loja inteira, e não campanha por campanha: é
 * uma chamada só, e o número que importa para ROAS e para o lucro é o gasto
 * total. A receita é a broad_gmv (venda direta + indireta atribuída ao
 * anúncio), o mesmo critério do total_amount do Mercado Livre.
 *
 * Devolve permissao 'pendente' quando o app não tem acesso à API de Ads: a
 * permissão depende do tipo de app no Open Platform, não da loja. Qualquer
 * outra falha devolve null e preserva o que estava gravado.
 */
export async function buscarAdsShopee(
  creds: StoredCredentials,
  refMonth: string,
): Promise<
  | { permissao: "pendente" }
  | {
      permissao: "liberada";
      dias: { day: string; ads: number; ads_revenue: number; clicks: number; prints: number; orders: number }[];
    }
  | null
> {
  const { start, end } = monthRange(refMonth);
  const hoje = diaDoPedido(Math.floor(Date.now() / 1000));
  const primeiro = start.toISOString().slice(0, 10);
  const ultimoDoMes = new Date(end.getTime() - 864e5).toISOString().slice(0, 10);
  const ultimo = ultimoDoMes < hoje ? ultimoDoMes : hoje;
  if (ultimo < primeiro) return null;

  try {
    const corpo = await call<{
      response?: {
        date: string;
        impression?: number;
        clicks?: number;
        expense?: number;
        broad_gmv?: number;
        broad_order?: number;
      }[];
    }>(
      "/api/v2/ads/get_all_cpc_ads_daily_performance",
      { start_date: dataAds(primeiro), end_date: dataAds(ultimo) },
      creds,
    );

    const dias = (corpo.response ?? []).map((l) => {
      const [d, m, a] = l.date.split("-");
      return {
        day: `${a}-${m}-${d}`,
        ads: l.expense ?? 0,
        ads_revenue: l.broad_gmv ?? 0,
        clicks: l.clicks ?? 0,
        prints: l.impression ?? 0,
        orders: l.broad_order ?? 0,
      };
    });
    return { permissao: "liberada", dias };
  } catch (e) {
    if (e instanceof IntegrationError && e.message.includes("error_api_permission")) return { permissao: "pendente" };
    return null;
  }
}

/** Prefixo do external_id da linha de Ads montada a partir das recargas. */
export const ID_RECARGAS = "recargas-shopee-ads";

/**
 * Recargas de crédito de Shopee Ads no mês, lidas do extrato da carteira.
 *
 * A API de Ads é só para parceiros oficiais da Shopee, e o app da agência
 * não é um. O extrato da carteira é: cada compra de crédito de anúncio com o
 * saldo da loja aparece como SPM_DEDUCT, "Recarga por compra de ADS". Não é
 * o gasto exato (recarga do dia 30 é gasta no mês seguinte, e recarga paga
 * por cartão não passa pela carteira), mas no mês fica muito perto, e é
 * dado da Shopee, não digitado.
 *
 * O extrato aceita no máximo 15 dias por consulta; vai em janelas de 14.
 * Devolve null quando a leitura falha, para não zerar o que estava gravado.
 */
export async function buscarRecargasAds(
  creds: StoredCredentials,
  refMonth: string,
  prazo: number,
): Promise<{ total: number; recargas: number } | null> {
  const { start, end } = monthRange(refMonth);
  const DIA = 86400;
  // o mês em horário de Brasília, como o resto do fechamento
  const inicio = Math.floor(start.getTime() / 1000) + 3 * 3600;
  const fim = Math.min(Math.floor(end.getTime() / 1000) + 3 * 3600, Math.floor(Date.now() / 1000));
  if (fim <= inicio) return null;

  let total = 0;
  let recargas = 0;
  try {
    for (let de = inicio; de < fim; de += 14 * DIA) {
      const ate = Math.min(de + 14 * DIA - 1, fim);
      for (let pagina = 1; pagina <= 20; pagina++) {
        if (Date.now() > prazo) return null;
        const pedir = () =>
          call<{
            response?: { transaction_list?: { transaction_type?: string; amount?: number }[]; more?: boolean };
          }>(
            "/api/v2/payment/get_wallet_transaction_list",
            {
              page_no: pagina,
              page_size: 100,
              create_time_from: de,
              create_time_to: ate,
              transaction_type: "SPM_DEDUCT",
            },
            creds,
          );
        // uma segunda tentativa: na sincronização de 12 meses, dois meses
        // falharam de passagem e ficaram com Ads zerado
        const r = await pedir().catch(async () => {
          await new Promise((ok) => setTimeout(ok, 1500));
          return pedir();
        });
        for (const t of r.response?.transaction_list ?? []) {
          // o filtro por tipo nem sempre é respeitado: confere de novo
          if (t.transaction_type !== "SPM_DEDUCT") continue;
          total += -Number(t.amount ?? 0);
          recargas += 1;
        }
        if (!r.response?.more) break;
      }
    }
  } catch {
    return null;
  }
  return { total: Math.round(total * 100) / 100, recargas };
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
   * Duas tarefas, nesta ordem:
   *
   *   1. listar os dias que podem ter pedido novo (hoje e ontem) e os dias que
   *      nunca foram varridos, marcando cada varredura;
   *   2. com o tempo que sobrar, revalidar o status dos pedidos abertos em
   *      lotes de cinquenta, buscando valor só de quem mudou.
   *
   * Dia passado já varrido não é listado de novo: o conjunto de pedidos de um
   * dia que passou não muda, só o estado de cada pedido — e isso a revalidação
   * cobre por muito menos chamadas.
   *
   * A versão anterior listava o mês inteiro antes de buscar um único valor e
   * jogava o trabalho fora quando o tempo acabava. No agendamento de 17/09 ela
   * leu "0 de 2480 pedidos": a Shopee, que é 99% do faturamento, ficou dias
   * sem atualizar.
   */
  async fetchMonth(ctx: AdapterContext, refMonth: string): Promise<MonthlyResult> {
    const creds = await refreshIfNeeded(ctx);
    if (!ctx.accountId) throw new IntegrationError("Sincronização da Shopee precisa do id da conta.", "config");
    const accountId = ctx.accountId;
    const orcamento = (ctx.deadline ?? syncDeadline()) - Date.now();
    // a reserva é proporcional: 8s fixos comiam metade da fatia do cron
    const prazo = Date.now() + orcamento - Math.min(8000, Math.max(2000, orcamento * 0.2));

    // Ads primeiro: são duas ou três chamadas, e a revalidação dos pedidos
    // lá embaixo usa o tempo que sobrar inteiro. No fim da rodada, as
    // recargas quase nunca chegavam a ser lidas.
    const ads = await buscarAdsShopee(creds, refMonth);
    const recargas = ads?.permissao === "pendente" ? await buscarRecargasAds(creds, refMonth, prazo) : null;

    const { start, end } = monthRange(refMonth);
    const DIA = 86400;
    const primeiro = Math.floor(start.getTime() / 1000);
    const ultimo = Math.min(Math.floor(end.getTime() / 1000), Math.floor(Date.now() / 1000));
    const janelas: { dia: string; from: number; to: number }[] = [];
    for (let from = primeiro; from < ultimo; from += DIA) {
      janelas.push({ dia: diaDoPedido(from), from, to: Math.min(from + DIA - 1, ultimo) });
    }

    const varridos = await all<{ dia: string }>(
      "SELECT day AS dia FROM shopee_day_sweeps WHERE client_marketplace_id = ? AND day LIKE ?",
      accountId,
      `${refMonth}-%`,
    );
    const varredura = new Set(varridos.map((v) => v.dia));

    // Dia que já tem pedido guardado foi listado em alguma rodada anterior,
    // antes de esta memória existir. Marcar isso aqui evita varrer de novo o
    // mês que já está no banco.
    const comPedido = await all<{ dia: string; pedidos: number; ultima: string | null }>(
      `SELECT day AS dia, COUNT(*) AS pedidos, MAX(updated_at) AS ultima FROM shopee_order_escrow
        WHERE client_marketplace_id = ? AND day LIKE ? GROUP BY day`,
      accountId,
      `${refMonth}-%`,
    );
    for (const c of comPedido) {
      if (varredura.has(c.dia)) continue;
      await run(
        `INSERT INTO shopee_day_sweeps (client_marketplace_id, day, swept_at, orders, open_orders)
         VALUES (?,?,?,?,0) ON CONFLICT (client_marketplace_id, day) DO NOTHING`,
        accountId,
        c.dia,
        c.ultima ?? now(),
        c.pedidos,
      );
      varredura.add(c.dia);
    }

    // hoje e ontem sempre, mais qualquer dia que nunca foi varrido
    const recente = diaDoPedido(Math.floor(Date.now() / 1000) - DIA);
    const aListar = janelas
      .filter((j) => j.dia >= recente || !varredura.has(j.dia))
      .sort((a, b) => b.dia.localeCompare(a.dia));

    let diasFeitos = 0;
    let lidos = 0;
    let pendentes = 0;

    for (const j of aListar) {
      if (Date.now() > prazo) break;

      const doDia = new Map<string, { orderSn: string; status: string; dia: string }>();
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
          doDia.set(o.order_sn, { orderSn: o.order_sn, status: o.order_status ?? "", dia: j.dia });
        }
        cursor = page.response?.more ? page.response.next_cursor : "";
      } while (cursor && Date.now() <= prazo);

      const lista = [...doDia.values()];
      const parcial = await atualizarPedidos(accountId, creds, lista, prazo);
      lidos += parcial.lidos;
      pendentes += parcial.pendentes;
      diasFeitos += 1;

      const abertosDoDia = await one<{ n: number }>(
        `SELECT COUNT(*) AS n FROM shopee_order_escrow
          WHERE client_marketplace_id = ? AND day = ? AND final = 0
            AND (status IS NULL OR status NOT IN ('CANCELLED','UNPAID'))`,
        accountId,
        j.dia,
      );
      await run(
        `INSERT INTO shopee_day_sweeps (client_marketplace_id, day, swept_at, orders, open_orders)
         VALUES (?,?,?,?,?)
         ON CONFLICT (client_marketplace_id, day) DO UPDATE SET
           swept_at = EXCLUDED.swept_at, orders = EXCLUDED.orders, open_orders = EXCLUDED.open_orders`,
        accountId,
        j.dia,
        now(),
        lista.length,
        abertosDoDia?.n ?? 0,
      );
      varredura.add(j.dia);
    }

    // com o tempo que sobrou, revalida os pedidos que ainda podem mudar
    const revalidacao = await revalidarAbertos(accountId, creds, refMonth, prazo);

    const out = await resultadoDoMesShopee(accountId, refMonth);

    // Ads é complemento: nunca derruba o faturamento
    if (ads) out.adsPermissao = ads.permissao;

    // sem a API de Ads, o investimento sai das recargas de crédito na carteira
    if (ads?.permissao === "pendente") {
      if (recargas) {
        out.adsPermissao = "recargas";
        out.ads = recargas.total;
        out.adsCampaigns = recargas.total
          ? [
              {
                external_id: ID_RECARGAS,
                name: `Shopee Ads · ${recargas.recargas} ${recargas.recargas === 1 ? "recarga" : "recargas"} de crédito`,
                invested: recargas.total,
                revenue: 0,
                clicks: 0,
                orders: 0,
              },
            ]
          : [];
        out.profit = out.revenue - out.fees - out.shipping - out.tax - out.ads - out.cogs;
      }
    }
    if (ads?.permissao === "liberada") {
      const porDia = new Map(out.days?.map((d) => [d.day, d]));
      for (const l of ads.dias) {
        const alvo = porDia.get(l.day) ?? emptyDay(l.day);
        alvo.ads += l.ads;
        alvo.ads_revenue += l.ads_revenue;
        alvo.clicks += l.clicks;
        alvo.prints += l.prints;
        porDia.set(l.day, alvo);
      }
      out.days = [...porDia.values()].sort((a, b) => a.day.localeCompare(b.day));
      out.ads = ads.dias.reduce((s, l) => s + l.ads, 0);
      const receita = ads.dias.reduce((s, l) => s + l.ads_revenue, 0);
      // gastou zero e não vendeu nada por Ads = a loja não anuncia; lista vazia
      // limpa o que a sincronização tinha gravado antes
      out.adsCampaigns =
        out.ads || receita
          ? [
              {
                external_id: "shopee-cpc",
                name: "Shopee Ads (todas as campanhas)",
                invested: out.ads,
                revenue: receita,
                clicks: ads.dias.reduce((s, l) => s + l.clicks, 0),
                orders: ads.dias.reduce((s, l) => s + l.orders, 0),
              },
            ]
          : [];
      out.profit = out.revenue - out.fees - out.shipping - out.tax - out.ads - out.cogs;
    }

    const diasFaltando = aListar.length - diasFeitos;
    const baseCompleta = janelas.every((j) => varredura.has(j.dia));

    if (diasFaltando > 0 || pendentes > 0 || revalidacao.restantes > 0) {
      out.incompleto = {
        feitos: lidos + revalidacao.conferidos,
        total: lidos + pendentes + revalidacao.conferidos + revalidacao.restantes,
        dias: diasFaltando,
        listagemCompleta: baseCompleta,
      };
    }
    return out;
  },
};
