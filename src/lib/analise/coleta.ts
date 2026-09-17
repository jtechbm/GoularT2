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
import {
  montarDossie,
  type Dossie,
  type EntradaDossie,
  type LinhaMes,
  type LojaNoDossie,
  type ProdutoLinha,
  type SinaisDoCatalogo,
} from "./dossie";
import { nivelEfetivo, type Indicador } from "@/lib/penalidades/regras";

/**
 * A coleta: lê o banco e entrega o dossiê pronto do CLIENTE.
 *
 * Tudo aqui é reaproveitado das telas que já existem — fechamento por loja,
 * série diária, campanhas, metas, alertas, penalidades, reputação e score. O
 * módulo não recalcula nada por conta própria, senão a análise diria um
 * número e a tela de Financeiro diria outro.
 */

export interface ClienteAnalisavel {
  id: string;
  name: string;
  status: string;
  lojas: number;
}

export interface ContaDoCliente {
  id: string;
  marketplace: string;
  nickname: string | null;
  status: string;
  items_permission: string | null;
  comms_permission: string | null;
  promos_permission: string | null;
}

/**
 * Os clientes que a pessoa pode analisar.
 *
 * Só entra cliente com pelo menos uma loja conectada: a análise se apoia nos
 * números que a integração trouxe. O escopo entra no WHERE, como no
 * comparador de preços — buscar tudo e filtrar depois é IDOR esperando
 * acontecer.
 */
export async function clientesAnalisaveis(escopo: Scope): Promise<ClienteAnalisavel[]> {
  const limite = escopo ? ` AND c.id IN (${escopo.map(() => "?").join(",") || "NULL"})` : "";
  return all<ClienteAnalisavel>(
    `SELECT c.id, c.name, c.status,
            (SELECT COUNT(*) FROM client_marketplaces cm
              WHERE cm.client_id = c.id AND cm.credentials IS NOT NULL) AS lojas
       FROM clients c
      WHERE EXISTS (SELECT 1 FROM client_marketplaces cm
                     WHERE cm.client_id = c.id AND cm.credentials IS NOT NULL)${limite}
      ORDER BY lower(c.name)`,
    ...(escopo ?? []),
  );
}

export async function clienteAnalisavel(clientId: string, escopo: Scope): Promise<ClienteAnalisavel | null> {
  const limite = escopo ? ` AND c.id IN (${escopo.map(() => "?").join(",") || "NULL"})` : "";
  return one<ClienteAnalisavel>(
    `SELECT c.id, c.name, c.status,
            (SELECT COUNT(*) FROM client_marketplaces cm
              WHERE cm.client_id = c.id AND cm.credentials IS NOT NULL) AS lojas
       FROM clients c
      WHERE c.id = ?${limite}`,
    clientId,
    ...(escopo ?? []),
  );
}

async function contasConectadas(clientId: string): Promise<ContaDoCliente[]> {
  return all<ContaDoCliente>(
    `SELECT id, marketplace, nickname, status, items_permission, comms_permission, promos_permission
       FROM client_marketplaces
      WHERE client_id = ? AND credentials IS NOT NULL ORDER BY marketplace`,
    clientId,
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
async function produtosDaConta(contaId: string): Promise<ProdutoLinha[]> {
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
    contaId,
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
 * Últimos indicadores de saúde da loja, com o alvo que o marketplace publica.
 *
 * Hoje só a Shopee publica isso; o Mercado Livre entra pela reputação, que já
 * vem em outro caminho. A lista fica gravada em JSON porque a Shopee mexe nela
 * de vez em quando, e o dossiê lê o que vier.
 */
async function indicadoresDaConta(contaId: string): Promise<{ nota: number | null; indicadores: Indicador[] }> {
  const foto = await one<{ rating: number | null; metrics: string | null }>(
    `SELECT rating, metrics FROM shop_metrics WHERE client_marketplace_id = ?
      ORDER BY captured_at DESC LIMIT 1`,
    contaId,
  );
  if (!foto?.metrics) return { nota: foto?.rating ?? null, indicadores: [] };

  try {
    const bruto = JSON.parse(foto.metrics) as {
      metric_name?: string;
      current_period?: number | null;
      last_period?: number | null;
      unit?: number | null;
      target?: { value?: number | null; comparator?: string | null } | null;
    }[];
    return {
      nota: foto.rating ?? null,
      indicadores: bruto
        .filter((m) => m?.metric_name)
        .map((m) => ({
          nome: m.metric_name!,
          atual: m.current_period ?? null,
          anterior: m.last_period ?? null,
          alvo: m.target?.value ?? null,
          comparador: m.target?.comparator ?? null,
          unidade: m.unit ?? null,
        })),
    };
  } catch {
    return { nota: foto.rating ?? null, indicadores: [] };
  }
}

/** O que o marketplace já disse sobre os anúncios desta loja. */
async function sinaisDaConta(conta: ContaDoCliente): Promise<SinaisDoCatalogo> {
  const seteDias = new Date(Date.now() - 7 * 864e5).toISOString();
  const linha = await one<{
    sem_promocao: number;
    rebaixados: number;
    barrados: number;
    preco_mudado: number;
  }>(
    `SELECT COUNT(*) FILTER (WHERE em_promocao = 0)                          AS sem_promocao,
            COUNT(*) FILTER (WHERE deboost = 1)                              AS rebaixados,
            COUNT(*) FILTER (WHERE sub_status IS NOT NULL
                               AND sub_status <> 'out_of_stock'
                              OR status IN ('BANNED','DELETED'))             AS barrados,
            COUNT(*) FILTER (WHERE price_changed_at IS NOT NULL
                               AND price_changed_at > ?)                     AS preco_mudado
       FROM client_products WHERE client_marketplace_id = ?`,
    seteDias,
    conta.id,
  );

  // a Shopee entrega a lista de promoções; no Mercado Livre isso depende de
  // permissão, e sem ela "sem promoção" seria chute com cara de número
  const lePromocao = conta.marketplace !== "mercado_livre" || conta.promos_permission === "liberada";

  return {
    semPromocao: lePromocao ? (linha?.sem_promocao ?? 0) : null,
    rebaixados: linha?.rebaixados ?? 0,
    barrados: linha?.barrados ?? 0,
    precoMudado: linha?.preco_mudado ?? 0,
  };
}

/**
 * O que a API recusa por falta de permissão no app.
 *
 * Vai para o dossiê porque o modelo precisa distinguir "está bom" de "ninguém
 * mediu". Sem isto, silêncio viraria elogio.
 */
function pendenciasDaConta(conta: ContaDoCliente): string[] {
  if (conta.marketplace !== "mercado_livre") return [];
  return [
    conta.items_permission === "pendente" ? "infrações de anúncio" : null,
    conta.comms_permission === "pendente" ? "taxa de resposta e reclamações" : null,
    conta.promos_permission === "pendente" ? "promoções ativas" : null,
  ].filter((x): x is string => Boolean(x));
}

/**
 * Monta o dossiê do cliente, com uma seção por canal.
 *
 * As consultas de cada canal são independentes e vão em paralelo; o custo de
 * tempo aqui fica abaixo de um segundo, e o resto dos 30 é do modelo.
 */
export async function coletarDossie(cliente: ClienteAnalisavel, refMonth: string): Promise<Dossie> {
  const anterior = addMonths(refMonth, -1);
  const janela = periodoDe("30d", refMonth);

  const [contas, dono, fechamentoAtual, fechamentoAnterior, metas, procedencia, abertas, saude] = await Promise.all([
    contasConectadas(cliente.id),
    getClient(cliente.id),
    marketplaceBreakdown(refMonth, cliente.id),
    marketplaceBreakdown(anterior, cliente.id),
    clientGoals(cliente.id, refMonth),
    procedenciaDoMes(refMonth, { clientId: cliente.id }),
    penalidades({ clientId: cliente.id, status: "aberta" }),
    saudeContasML(null, cliente.id),
  ]);

  const doCanal = (linhas: Awaited<ReturnType<typeof marketplaceBreakdown>>, marketplace: string): LinhaMes => {
    const linha = linhas.find((l) => l.marketplace === marketplace);
    return linha ? { ...VAZIO, ...linha } : VAZIO;
  };

  const lojas: LojaNoDossie[] = await Promise.all(
    contas.map(async (conta) => {
      // A série diária devolve um ponto por dia, inclusive os zerados — é o
      // certo para um gráfico. Aqui não serve: dia anterior à primeira
      // sincronização apareceria como "dia sem venda", e a loja da Shopee
      // ganhou uma seca de 13 dias que nunca existiu.
      const primeiro = await one<{ dia: string | null }>(
        "SELECT MIN(day) AS dia FROM finance_daily WHERE client_id = ? AND marketplace = ?",
        cliente.id,
        conta.marketplace,
      );
      const inicio = primeiro?.dia && primeiro.dia > janela.inicio ? primeiro.dia : janela.inicio;

      const [dias, campanhasCruas, produtos, saudeDaLoja, sinais] = await Promise.all([
        serieDiaria(inicio, janela.fim, { clientId: cliente.id, marketplace: conta.marketplace }),
        adsRows({ refMonth, clientId: cliente.id, marketplace: conta.marketplace }),
        produtosDaConta(conta.id),
        indicadoresDaConta(conta.id),
        sinaisDaConta(conta),
      ]);

      const campanhas = ordenarPorDesempenho(campanhasCruas.map((c) => analisarCampanha(c)));
      const reputacao = saude.find((s) => s.id === conta.id);
      const cor = reputacao ? nivelEfetivo(reputacao) : null;

      return {
        marketplace: marketplaceLabel(conta.marketplace),
        apelido: conta.nickname,
        statusConta: conta.status,
        notaDaLoja: saudeDaLoja.nota,
        indicadores: saudeDaLoja.indicadores,
        sinais,
        pendencias: pendenciasDaConta(conta),
        atual: doCanal(fechamentoAtual, conta.marketplace),
        anterior: doCanal(fechamentoAnterior, conta.marketplace),
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
        penalidades: abertas
          .filter((p) => p.client_marketplace_id === conta.id)
          .map((p) => ({
            severity: p.severity,
            kind: p.kind,
            titulo: p.title,
            detectadaEm: p.detected_at.slice(0, 10),
          })),
        // real_level só existe durante a proteção do Decola; fora dela a cor
        // está em level_id. Exigir real_level fazia a reputação inteira sumir
        // do dossiê: a análise não sabia que a loja era verde.
        reputacao: cor
          ? {
              nivel: cor,
              reclamacoes: reputacao?.claims_rate ?? 0,
              atrasos: reputacao?.delayed_rate ?? 0,
              cancelamentos: reputacao?.cancellations_rate ?? 0,
            }
          : null,
      };
    }),
  );

  // score e alertas são do cliente e somam as lojas, do jeito que o resto do
  // sistema já mostra
  const carteira = await clientRows(refMonth, undefined, [cliente.id]);
  const linhaCliente = carteira.find((c) => c.id === cliente.id);
  const [alertas, scores, diasDoCliente] = await Promise.all([
    linhaCliente ? alertasDaCarteira(refMonth, [cliente.id], [linhaCliente]) : [],
    linhaCliente ? scoresEmLote([linhaCliente], refMonth) : new Map<string, Score>(),
    serieDiaria(janela.inicio, janela.fim, { clientId: cliente.id }),
  ]);
  const score = scores.get(cliente.id);
  const somaDias = somarPeriodo(diasDoCliente);

  const totalAtual = lojas.reduce((s, l) => s + l.atual.revenue, 0);
  const pedidosAtual = lojas.reduce((s, l) => s + l.atual.orders, 0);
  const lucroAtual = lojas.reduce((s, l) => s + l.atual.profit, 0);

  const progresso = compararMetas(metas.find((m) => !m.marketplace) ?? metas[0], {
    revenue: totalAtual,
    orders: pedidosAtual,
    profit: lucroAtual,
    ads: somaDias.ads,
    adsRevenue: somaDias.ads_revenue,
  });

  const entrada: EntradaDossie = {
    cliente: { nome: cliente.name, status: dono?.status ?? cliente.status },
    contrato: {
      tier: dono?.tier ?? null,
      segment: dono?.segment ?? null,
      mensalidade: dono?.monthly_fee ?? null,
      comissaoPct: dono?.commission_pct ?? null,
      desde: dono?.started_at ?? null,
      estrategia: dono?.summary ?? null,
    },
    mes: refMonth,
    lojas,
    metas: progresso.map((m) => ({ label: m.label, meta: m.goal, realizado: m.realized, bom: m.bom })),
    alertas: alertas
      .filter((a) => !a.resolvido)
      .map((a) => ({ nivel: a.nivel, titulo: a.titulo, detalhe: a.detalhe })),
    score: score ? { valor: score.valor, classe: score.classe, motivos: score.motivos.map((m) => m.texto) } : null,
    procedencia: procedencia.origem,
  };

  return montarDossie(entrada);
}
