import { all, one } from "@/lib/db";
import {
  adsRows,
  clientGoals,
  clientRows,
  getClient,
  marketplaceBreakdown,
  penalidades,
  periodoDe,
  procedenciaDoMes,
  saudeContasML,
  scoresEmLote,
  serieDiaria,
  somarPeriodo,
  alertasDaCarteira,
  type Scope,
} from "@/lib/queries";
import { analisarCampanha, ordenarPorDesempenho } from "@/lib/ads-analise";
import { compararMetas } from "@/lib/metas";
import type { Score } from "@/lib/score";
import { addMonths } from "@/lib/format";
import { marketplaceLabel } from "@/lib/types";
import { montarDossie, type Dossie, type EntradaDossie, type LinhaMes, type ProdutoLinha } from "./dossie";

/**
 * A coleta: lê o banco e entrega o dossiê pronto.
 *
 * Tudo aqui é reaproveitado das telas que já existem — fechamento por loja,
 * série diária, campanhas, metas, alertas, penalidades, reputação e score. O
 * módulo não recalcula nada por conta própria, senão a análise diria um
 * número e a tela de Financeiro diria outro.
 */

export interface LojaSelecionavel {
  id: string;
  client_id: string;
  client_name: string;
  marketplace: string;
  nickname: string | null;
  status: string;
  produtos: number;
}

/**
 * As lojas que a pessoa pode analisar.
 *
 * O escopo entra no WHERE, como no comparador de preços: buscar tudo e filtrar
 * depois é IDOR esperando acontecer.
 */
export async function lojasVisiveis(escopo: Scope): Promise<LojaSelecionavel[]> {
  const limite = escopo ? ` AND cm.client_id IN (${escopo.map(() => "?").join(",") || "NULL"})` : "";
  return all<LojaSelecionavel>(
    `SELECT cm.id, cm.client_id, c.name AS client_name, cm.marketplace, cm.nickname, cm.status,
            (SELECT COUNT(*) FROM client_products p WHERE p.client_marketplace_id = cm.id) AS produtos
       FROM client_marketplaces cm
       JOIN clients c ON c.id = cm.client_id
      WHERE cm.credentials IS NOT NULL${limite}
      ORDER BY lower(c.name), cm.marketplace`,
    ...(escopo ?? []),
  );
}

export async function lojaVisivel(lojaId: string, escopo: Scope): Promise<LojaSelecionavel | null> {
  const limite = escopo ? ` AND cm.client_id IN (${escopo.map(() => "?").join(",") || "NULL"})` : "";
  return one<LojaSelecionavel>(
    `SELECT cm.id, cm.client_id, c.name AS client_name, cm.marketplace, cm.nickname, cm.status,
            (SELECT COUNT(*) FROM client_products p WHERE p.client_marketplace_id = cm.id) AS produtos
       FROM client_marketplaces cm
       JOIN clients c ON c.id = cm.client_id
      WHERE cm.id = ?${limite}`,
    lojaId,
    ...(escopo ?? []),
  );
}

const VAZIO: LinhaMes = {
  revenue: 0,
  orders: 0,
  units: 0,
  profit: 0,
  fees: 0,
  shipping: 0,
  tax: 0,
  ads: 0,
  cogs: 0,
};

/** Anúncios da loja com a mediana da última comparação de mercado, quando existe. */
async function produtosDaLoja(lojaId: string): Promise<ProdutoLinha[]> {
  const linhas = await all<{
    titulo: string;
    preco: number;
    status: string | null;
    mediana: number | null;
    concorrentes: number;
  }>(
    `SELECT p.title AS titulo, p.price AS preco, p.status,
            (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY m.price)
               FROM market_comparisons m WHERE m.product_id = p.id) AS mediana,
            (SELECT COUNT(*) FROM market_comparisons m WHERE m.product_id = p.id) AS concorrentes
       FROM client_products p
      WHERE p.client_marketplace_id = ?
      ORDER BY p.price DESC`,
    lojaId,
  );
  return linhas.map((l) => ({
    titulo: l.titulo,
    preco: l.preco,
    status: l.status,
    medianaMercado: l.mediana,
    concorrentes: l.concorrentes,
  }));
}

/**
 * Monta o dossiê da loja.
 *
 * São doze consultas, todas por índice e curtas; o custo de tempo aqui é de
 * um ou dois segundos, e é o que sobra dos 30 para o modelo pensar.
 */
export async function coletarDossie(loja: LojaSelecionavel, refMonth: string): Promise<Dossie> {
  const anterior = addMonths(refMonth, -1);
  const periodo = periodoDe("30d", refMonth);

  // A série diária devolve um ponto por dia, inclusive os zerados — é o certo
  // para um gráfico. Aqui não serve: dia anterior à primeira sincronização
  // apareceria como "dia sem venda", e a loja da Shopee ganhou uma seca de 13
  // dias que nunca existiu. A janela começa no primeiro dia com dado.
  const primeiro = await one<{ dia: string | null }>(
    "SELECT MIN(day) AS dia FROM finance_daily WHERE client_id = ? AND marketplace = ?",
    loja.client_id,
    loja.marketplace,
  );
  const inicio = primeiro?.dia && primeiro.dia > periodo.inicio ? primeiro.dia : periodo.inicio;

  const [cliente, fechamentoAtual, fechamentoAnterior, dias, campanhasCruas, metas, produtos, procedencia] =
    await Promise.all([
      getClient(loja.client_id),
      marketplaceBreakdown(refMonth, loja.client_id),
      marketplaceBreakdown(anterior, loja.client_id),
      serieDiaria(inicio, periodo.fim, { clientId: loja.client_id, marketplace: loja.marketplace }),
      adsRows({ refMonth, clientId: loja.client_id, marketplace: loja.marketplace }),
      clientGoals(loja.client_id, refMonth),
      produtosDaLoja(loja.id),
      procedenciaDoMes(refMonth, { clientId: loja.client_id }),
    ]);

  const daLoja = (linhas: Awaited<ReturnType<typeof marketplaceBreakdown>>): LinhaMes => {
    const linha = linhas.find((l) => l.marketplace === loja.marketplace);
    return linha ? { ...VAZIO, ...linha } : VAZIO;
  };

  // o score e os alertas são do cliente, não da loja: eles somam as lojas de
  // propósito, e é assim que o resto do sistema os mostra
  const carteira = await clientRows(refMonth, undefined, [loja.client_id]);
  const linhaCliente = carteira.find((c) => c.id === loja.client_id);
  const [alertas, scores, abertas, saude] = await Promise.all([
    linhaCliente ? alertasDaCarteira(refMonth, [loja.client_id], [linhaCliente]) : [],
    linhaCliente ? scoresEmLote([linhaCliente], refMonth) : new Map<string, Score>(),
    penalidades({ clientId: loja.client_id, status: "aberta" }),
    loja.marketplace === "mercado_livre" ? saudeContasML(null, loja.client_id) : [],
  ]);

  const soma = somarPeriodo(dias);
  const campanhas = ordenarPorDesempenho(campanhasCruas.map((c) => analisarCampanha(c)));
  const score = linhaCliente ? scores.get(loja.client_id) : undefined;
  const reputacao = saude.find((s) => s.id === loja.id);

  const progresso = compararMetas(metas.find((m) => !m.marketplace) ?? metas[0], {
    revenue: daLoja(fechamentoAtual).revenue,
    orders: daLoja(fechamentoAtual).orders,
    profit: daLoja(fechamentoAtual).profit,
    ads: soma.ads,
    adsRevenue: soma.ads_revenue,
  });

  const entrada: EntradaDossie = {
    loja: {
      cliente: loja.client_name,
      marketplace: marketplaceLabel(loja.marketplace),
      apelido: loja.nickname,
      status: cliente?.status ?? loja.status,
    },
    contrato: {
      tier: cliente?.tier ?? null,
      segment: cliente?.segment ?? null,
      mensalidade: cliente?.monthly_fee ?? null,
      comissaoPct: cliente?.commission_pct ?? null,
      desde: cliente?.started_at ?? null,
      estrategia: cliente?.summary ?? null,
    },
    mes: refMonth,
    atual: daLoja(fechamentoAtual),
    anterior: daLoja(fechamentoAnterior),
    dias: dias.map((d) => ({ day: d.day, revenue: d.revenue, orders: d.orders })),
    produtos,
    campanhas: campanhas.map((c) => ({
      nome: c.nome,
      invested: c.invested,
      revenue: c.revenue,
      clicks: c.clicks,
      orders: c.orders,
      roas: c.roas,
      acos: c.acos,
    })),
    metas: progresso.map((m) => ({ label: m.label, meta: m.goal, realizado: m.realized, bom: m.bom })),
    alertas: alertas
      .filter((a) => !a.resolvido)
      .map((a) => ({ nivel: a.nivel, titulo: a.titulo, detalhe: a.detalhe })),
    penalidades: abertas
      .filter((p) => p.client_marketplace_id === loja.id)
      .map((p) => ({
        severity: p.severity,
        kind: p.kind,
        titulo: p.title,
        detectadaEm: p.detected_at.slice(0, 10),
      })),
    reputacao: reputacao?.real_level
      ? {
          nivel: reputacao.real_level,
          reclamacoes: reputacao.claims_rate ?? 0,
          atrasos: reputacao.delayed_rate ?? 0,
          cancelamentos: reputacao.cancellations_rate ?? 0,
        }
      : null,
    score: score ? { valor: score.valor, classe: score.classe, motivos: score.motivos.map((m) => m.texto) } : null,
    procedencia: procedencia.origem,
  };

  return montarDossie(entrada);
}
