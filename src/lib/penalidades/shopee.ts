import { all, id, now, one, run } from "../db.ts";
import { decryptJSON, encryptJSON } from "../crypto.ts";
import { call as chamarShopee, refreshIfNeeded } from "../integrations/shopee.ts";
import type { StoredCredentials } from "../integrations/types.ts";
import { avaliarIndicador, type Indicador, type Severidade } from "./regras.ts";
import { registrarPenalidade, resolverAutomatico, type ContaPenalizavel } from "./registro.ts";

/**
 * Saúde da loja na Shopee, pelas rotas oficiais de account_health.
 *
 * Cobre o que o cliente pediu e a Shopee entrega:
 *   - pontos de penalidade e punições ativas
 *   - atraso no envio, com a lista dos pedidos atrasados
 *   - taxa de respostas, cancelamento, devolução e nota da loja
 *   - violação de anúncio: proibido, duplicado, marca ou imagem indevida
 *   - anúncio banido ou rebaixado na busca (deboost)
 *   - anúncio fora de qualquer promoção
 *
 * Duas decisões de projeto que valem ficar escritas:
 *
 * O alvo de cada indicador vem da própria Shopee, com o comparador. Não há
 * tabela de limites nossa, então o dia em que a Shopee apertar a exigência o
 * sistema aperta junto.
 *
 * A chave de cada penalidade de indicador leva o mês. Assim o mesmo problema
 * não é avisado todo dia, mas volta a avisar no mês seguinte se continuar —
 * que é justamente quando alguém esqueceu dele.
 */

const MARKETPLACE = "shopee";

interface Conta extends ContaPenalizavel {
  credentials: string | null;
}

export interface ResultadoShopee {
  ok: boolean;
  novas: number;
  resolvidas: number;
  nota: number | null;
  indicadoresFora: number;
  atrasados: number;
  mensagem: string;
}

function mes(): string {
  return new Date().toISOString().slice(0, 7);
}

/* ------------------------------ indicadores ------------------------------ */

interface MetricaShopee {
  metric_id: number;
  metric_type: number;
  metric_name: string;
  current_period: number | null;
  last_period: number | null;
  unit?: number | null;
  target?: { value?: number | null; comparator?: string | null } | null;
}

async function verificarDesempenho(conta: Conta, creds: StoredCredentials) {
  const resposta = await chamarShopee<{
    response?: {
      overall_performance?: {
        rating?: number;
        fulfillment_failed?: number;
        listing_failed?: number;
        custom_service_failed?: number;
      };
      metric_list?: MetricaShopee[];
    };
  }>("/api/v2/account_health/get_shop_performance", {}, creds);

  const geral = resposta.response?.overall_performance ?? {};
  const metricas = resposta.response?.metric_list ?? [];

  // a foto inteira fica guardada, e não só o que estourou: é o que permite
  // dizer depois que o indicador vem piorando há semanas
  await run(
    `INSERT INTO shop_metrics (id, client_marketplace_id, marketplace, rating, fulfillment_failed,
                               listing_failed, service_failed, metrics, captured_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    id(),
    conta.id,
    MARKETPLACE,
    geral.rating ?? null,
    geral.fulfillment_failed ?? null,
    geral.listing_failed ?? null,
    geral.custom_service_failed ?? null,
    JSON.stringify(metricas),
    now(),
  );

  let novas = 0;
  let fora = 0;
  const abertas: string[] = [];

  for (const m of metricas) {
    const indicador: Indicador = {
      nome: m.metric_name,
      atual: m.current_period ?? null,
      anterior: m.last_period ?? null,
      alvo: m.target?.value ?? null,
      comparador: m.target?.comparator ?? null,
      unidade: m.unit ?? null,
    };
    const avaliacao = avaliarIndicador(indicador);
    if (!avaliacao.fora) continue;

    fora += 1;
    const chave = `${m.metric_name}:${mes()}`;
    abertas.push(chave);
    const criou = await registrarPenalidade(conta, MARKETPLACE, {
      kind: "desempenho",
      severity: avaliacao.severidade,
      externalKey: chave,
      title: avaliacao.texto.split(":")[0],
      detail: avaliacao.texto,
      data: { metrica: m, indicador },
    });
    if (criou) novas += 1;
  }

  const resolvidas = await resolverAutomatico(
    conta.id,
    "desempenho",
    abertas,
    "O indicador voltou para dentro do alvo da Shopee.",
  );

  return { novas, resolvidas, fora, nota: geral.rating ?? null };
}

/* ------------------------------- penalidades ------------------------------ */

async function verificarPontos(conta: Conta, creds: StoredCredentials) {
  const resposta = await chamarShopee<{
    response?: {
      penalty_point_list?: {
        issue_time: number;
        reference_id: number;
        violation_type: number;
        latest_point_num: number;
        original_point_num: number;
      }[];
    };
  }>("/api/v2/account_health/get_penalty_point_history", { page_no: 1, page_size: 100 }, creds);

  let novas = 0;
  for (const p of resposta.response?.penalty_point_list ?? []) {
    // ponto já perdoado pela Shopee (latest 0) não é penalidade em curso
    if (!p.latest_point_num) continue;
    const criou = await registrarPenalidade(conta, MARKETPLACE, {
      kind: "punicao",
      severity: p.latest_point_num >= 3 ? "critico" : "atencao",
      externalKey: `ponto:${p.reference_id}`,
      title: `${p.latest_point_num} ${p.latest_point_num === 1 ? "ponto" : "pontos"} de penalidade na Shopee`,
      detail:
        `A Shopee aplicou ${p.latest_point_num} de ${p.original_point_num} ` +
        `${p.original_point_num === 1 ? "ponto" : "pontos"} (tipo de violação ${p.violation_type}) em ` +
        `${new Date(p.issue_time * 1000).toLocaleDateString("pt-BR")}. Pontos acumulados derrubam a loja de nível.`,
      data: p,
    });
    if (criou) novas += 1;
  }
  return novas;
}

async function verificarPunicoes(conta: Conta, creds: StoredCredentials) {
  const resposta = await chamarShopee<{
    response?: {
      punishment_list?: {
        punishment_name?: string;
        punishment_tier?: number;
        days?: number;
        start_time?: number;
        end_time?: number;
        reference_id?: number;
        listing_limit?: number;
        order_limit?: number;
      }[];
    };
  }>(
    "/api/v2/account_health/get_punishment_history",
    { page_no: 1, page_size: 100, punishment_status: 1 },
    creds,
  );

  let novas = 0;
  for (const p of resposta.response?.punishment_list ?? []) {
    const criou = await registrarPenalidade(conta, MARKETPLACE, {
      kind: "punicao",
      severity: "critico",
      externalKey: `punicao:${p.reference_id ?? p.start_time ?? p.punishment_name}`,
      title: `Punição ativa na Shopee: ${p.punishment_name ?? "restrição na conta"}`,
      detail:
        `Nível ${p.punishment_tier ?? "—"}, ${p.days ?? "?"} dias` +
        (p.end_time ? `, até ${new Date(p.end_time * 1000).toLocaleDateString("pt-BR")}` : "") +
        (p.listing_limit ? `. Limite de anúncios: ${p.listing_limit}` : "") +
        (p.order_limit ? `. Limite de pedidos: ${p.order_limit}` : ""),
      data: p,
    });
    if (criou) novas += 1;
  }
  return novas;
}

/* --------------------------------- atrasos -------------------------------- */

async function verificarAtrasos(conta: Conta, creds: StoredCredentials) {
  const resposta = await chamarShopee<{
    response?: { late_order_list?: { order_sn: string; shipping_deadline: number; late_by_days: number }[] };
  }>("/api/v2/account_health/get_late_orders", { page_no: 1, page_size: 100 }, creds);

  const atrasados = resposta.response?.late_order_list ?? [];
  if (!atrasados.length) {
    const resolvidas = await resolverAutomatico(conta.id, "atraso", [], "Não há mais pedido atrasado.");
    return { novas: 0, resolvidas, total: 0 };
  }

  // um aviso por dia com a lista dentro, e não um por pedido: a loja com
  // trinta atrasos geraria trinta notificações, e ninguém leria nenhuma
  const maisVelho = Math.max(...atrasados.map((o) => o.late_by_days));
  const chave = `atrasos:${mes()}-${new Date().getUTCDate()}`;
  const lista = atrasados
    .slice(0, 10)
    .map((o) => `${o.order_sn} (${o.late_by_days}d)`)
    .join("; ");

  const criou = await registrarPenalidade(conta, MARKETPLACE, {
    kind: "atraso",
    severity: maisVelho >= 3 || atrasados.length >= 10 ? "critico" : "atencao",
    externalKey: chave,
    title: `${atrasados.length} ${atrasados.length === 1 ? "pedido atrasado" : "pedidos atrasados"} na Shopee`,
    detail:
      `O mais atrasado está ${maisVelho} ${maisVelho === 1 ? "dia" : "dias"} além do prazo de envio. ` +
      "Atraso conta na taxa de envio atrasado, que é o indicador que mais derruba loja na Shopee. " +
      lista +
      (atrasados.length > 10 ? ` (e mais ${atrasados.length - 10})` : ""),
    data: { total: atrasados.length, maisVelho, pedidos: atrasados },
  });

  const resolvidas = await resolverAutomatico(conta.id, "atraso", [chave], "Os pedidos atrasados foram enviados.");
  return { novas: criou ? 1 : 0, resolvidas, total: atrasados.length };
}

/* -------------------------------- anúncios -------------------------------- */

interface ItemShopee {
  item_id: number;
  item_name?: string;
  item_status?: string;
  deboost?: string | boolean;
  has_model?: boolean;
}

/**
 * Anúncio banido, apagado pela Shopee ou rebaixado na busca.
 *
 * "deboost" é o mais perto de "perdeu relevância" que existe em API: é a
 * Shopee dizendo que rebaixou o anúncio. Posição de busca ninguém publica.
 */
async function verificarAnuncios(conta: Conta, creds: StoredCredentials) {
  const lista = await chamarShopee<{ response?: { item?: { item_id: number; item_status?: string }[] } }>(
    "/api/v2/product/get_item_list",
    { offset: 0, page_size: 100, item_status: "BANNED" },
    creds,
  );
  const banidos = (lista.response?.item ?? []).map((i) => i.item_id);

  const ids = [...banidos];
  const detalhes: ItemShopee[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const detalhe = await chamarShopee<{ response?: { item_list?: ItemShopee[] } }>(
      "/api/v2/product/get_item_base_info",
      { item_id_list: ids.slice(i, i + 50).join(",") },
      creds,
    );
    detalhes.push(...(detalhe.response?.item_list ?? []));
  }

  let novas = 0;
  const abertas: string[] = [];

  for (const item of detalhes) {
    const chave = `banido:${item.item_id}`;
    abertas.push(chave);
    const criou = await registrarPenalidade(conta, MARKETPLACE, {
      kind: "anuncio",
      severity: "critico",
      externalKey: chave,
      title: `Anúncio banido na Shopee: ${item.item_name ?? item.item_id}`,
      detail:
        "A Shopee bloqueou este anúncio. Enquanto estiver banido ele não vende e não aparece na busca. " +
        "O motivo aparece no painel do vendedor, em Meus Produtos.",
      data: item,
    });
    if (criou) novas += 1;
  }

  // os rebaixados vêm dos anúncios normais que já importamos
  const rebaixados = await all<{ id: string; external_id: string; title: string }>(
    "SELECT id, external_id, title FROM client_products WHERE client_marketplace_id = ? AND deboost = 1",
    conta.id,
  );
  for (const r of rebaixados) {
    const chave = `rebaixado:${r.external_id}`;
    abertas.push(chave);
    const criou = await registrarPenalidade(conta, MARKETPLACE, {
      kind: "anuncio",
      severity: "atencao",
      externalKey: chave,
      title: `Anúncio rebaixado na busca: ${r.title}`,
      detail:
        "A Shopee marcou este anúncio como rebaixado (deboost). Ele continua ativo, mas aparece menos na " +
        "busca — é o que a operação chama de perder relevância.",
      data: r,
    });
    if (criou) novas += 1;
  }

  const resolvidas = await resolverAutomatico(
    conta.id,
    "anuncio",
    abertas,
    "O anúncio saiu do bloqueio ou do rebaixamento.",
  );
  return { novas, resolvidas };
}

/* -------------------------------- promoções ------------------------------- */

/**
 * Anúncio fora de qualquer promoção.
 *
 * Um aviso por anúncio viraria cem avisos, então a marca fica no anúncio
 * (em_promocao) e a penalidade é uma só, com a contagem. A tela de Preços já
 * mostra anúncio por anúncio.
 */
async function verificarPromocoes(conta: Conta, creds: StoredCredentials) {
  const lista = await chamarShopee<{
    response?: { discount_list?: { discount_id: number; discount_name?: string; status?: string }[] };
  }>("/api/v2/discount/get_discount_list", { discount_status: "ongoing", page_no: 1, page_size: 100 }, creds);

  const promocoes = lista.response?.discount_list ?? [];
  const emPromocao = new Set<string>();

  for (const promo of promocoes) {
    const detalhe = await chamarShopee<{
      response?: { item_list?: { item_id: number }[] };
    }>("/api/v2/discount/get_discount", { discount_id: promo.discount_id, page_no: 1, page_size: 100 }, creds);
    for (const item of detalhe.response?.item_list ?? []) emPromocao.add(String(item.item_id));
  }

  await run("UPDATE client_products SET em_promocao = 0 WHERE client_marketplace_id = ?", conta.id);
  if (emPromocao.size) {
    const marcas = [...emPromocao];
    await run(
      `UPDATE client_products SET em_promocao = 1
        WHERE client_marketplace_id = ? AND external_id IN (${marcas.map(() => "?").join(",")})`,
      conta.id,
      ...marcas,
    );
  }

  const fora = await one<{ total: number; ativos: number }>(
    `SELECT COUNT(*) FILTER (WHERE em_promocao = 0) AS total, COUNT(*) AS ativos
       FROM client_products WHERE client_marketplace_id = ?`,
    conta.id,
  );

  const semPromocao = fora?.total ?? 0;
  const ativos = fora?.ativos ?? 0;
  if (!ativos || !semPromocao) {
    await resolverAutomatico(conta.id, "promocao", [], "Todos os anúncios entraram em promoção.");
    return 0;
  }

  const chave = `sem_promocao:${mes()}`;
  const criou = await registrarPenalidade(conta, MARKETPLACE, {
    kind: "promocao",
    severity: semPromocao === ativos ? "atencao" : "informativo",
    externalKey: chave,
    title: `${semPromocao} de ${ativos} anúncios sem promoção`,
    detail:
      `A loja tem ${promocoes.length} ${promocoes.length === 1 ? "promoção" : "promoções"} em andamento, ` +
      `cobrindo ${ativos - semPromocao} anúncios. Na Shopee, anúncio sem desconto perde espaço nas vitrines ` +
      "e nas campanhas da plataforma.",
    data: { promocoes, semPromocao, ativos },
  });
  await resolverAutomatico(conta.id, "promocao", [chave], "A cobertura de promoção mudou.");
  return criou ? 1 : 0;
}

/* --------------------------------- entrada -------------------------------- */

export async function verificarPenalidadesShopee(accountId: string): Promise<ResultadoShopee> {
  const conta = await one<Conta>(
    `SELECT cm.id, cm.client_id, c.name AS client_name, c.owner_id, cm.credentials
       FROM client_marketplaces cm JOIN clients c ON c.id = cm.client_id
      WHERE cm.id = ? AND cm.marketplace = 'shopee'`,
    accountId,
  );
  if (!conta) {
    return { ok: false, novas: 0, resolvidas: 0, nota: null, indicadoresFora: 0, atrasados: 0, mensagem: "Conta não encontrada." };
  }

  const creds = decryptJSON<StoredCredentials>(conta.credentials);
  if (!creds?.access_token || !creds.shop_id) {
    return {
      ok: false, novas: 0, resolvidas: 0, nota: null, indicadoresFora: 0, atrasados: 0,
      mensagem: "Loja sem autorização válida.",
    };
  }

  try {
    const vivas = await refreshIfNeeded({
      externalId: null,
      credentials: creds,
      accountId: conta.id,
      saveCredentials: async (next) => {
        await run("UPDATE client_marketplaces SET credentials = ? WHERE id = ?", encryptJSON(next), conta.id);
      },
    });

    const desempenho = await verificarDesempenho(conta, vivas);
    const pontos = await verificarPontos(conta, vivas);
    const punicoes = await verificarPunicoes(conta, vivas);
    const atrasos = await verificarAtrasos(conta, vivas);
    const anuncios = await verificarAnuncios(conta, vivas);
    const promocoes = await verificarPromocoes(conta, vivas);

    await run("UPDATE client_marketplaces SET penalties_checked_at = ? WHERE id = ?", now(), conta.id);

    const novas = desempenho.novas + pontos + punicoes + atrasos.novas + anuncios.novas + promocoes;
    const resolvidas = desempenho.resolvidas + atrasos.resolvidas + anuncios.resolvidas;
    return {
      ok: true,
      novas,
      resolvidas,
      nota: desempenho.nota,
      indicadoresFora: desempenho.fora,
      atrasados: atrasos.total,
      mensagem:
        `${novas} ${novas === 1 ? "penalidade nova" : "penalidades novas"}, ` +
        `${desempenho.fora} ${desempenho.fora === 1 ? "indicador fora do alvo" : "indicadores fora do alvo"}, ` +
        `${atrasos.total} ${atrasos.total === 1 ? "pedido atrasado" : "pedidos atrasados"}`,
    };
  } catch (e) {
    return {
      ok: false, novas: 0, resolvidas: 0, nota: null, indicadoresFora: 0, atrasados: 0,
      mensagem: e instanceof Error ? e.message : String(e),
    };
  }
}

/** A severidade mais alta entre as penalidades abertas da conta. */
export async function piorSeveridade(contaId: string): Promise<Severidade | null> {
  const linha = await one<{ severity: string }>(
    `SELECT severity FROM penalties WHERE client_marketplace_id = ? AND status = 'aberta'
      ORDER BY CASE severity WHEN 'critico' THEN 1 WHEN 'atencao' THEN 2 ELSE 3 END LIMIT 1`,
    contaId,
  );
  return (linha?.severity as Severidade) ?? null;
}
