import { diferencaRelativa, numerosDoTrecho } from "../precos/analise.ts";

/**
 * O dossiê da loja: a parte que só faz conta.
 *
 * Este arquivo não fala com banco, com marketplace nem com modelo de
 * linguagem. Ele recebe as linhas cruas que a coleta leu, deriva o que
 * interessa e escreve o bloco de texto que vai ao modelo.
 *
 * A ideia de projeto é uma só: o modelo não inventa número. Todo valor que
 * ele pode citar sai daqui, e o que ele devolve é conferido de volta contra
 * esta mesma lista de números — igual ao que o comparador de preços faz com
 * o trecho de origem.
 */

export interface LinhaMes {
  revenue: number;
  orders: number;
  units: number;
  profit: number;
  fees: number;
  shipping: number;
  tax: number;
  ads: number;
  cogs: number;
}

export interface DiaLinha {
  day: string;
  revenue: number;
  orders: number;
}

export interface ProdutoLinha {
  titulo: string;
  preco: number;
  status: string | null;
  /** mediana dos concorrentes, quando existe comparação gravada */
  medianaMercado: number | null;
  concorrentes: number;
}

export interface CampanhaLinha {
  nome: string;
  invested: number;
  revenue: number;
  clicks: number;
  orders: number;
  /** null quando não há denominador: não vendeu nada é diferente de zero */
  roas: number | null;
  acos: number | null;
}

export interface MetaLinha {
  label: string;
  meta: number;
  realizado: number;
  bom: boolean;
}

export interface AlertaLinha {
  nivel: string;
  titulo: string;
  detalhe: string;
}

export interface PenalidadeLinha {
  severity: string;
  kind: string;
  titulo: string;
  detectadaEm: string;
}

export interface EntradaDossie {
  loja: { cliente: string; marketplace: string; apelido: string | null; status: string };
  contrato: {
    tier: string | null;
    segment: string | null;
    mensalidade: number | null;
    comissaoPct: number | null;
    desde: string | null;
    estrategia: string | null;
  };
  mes: string;
  atual: LinhaMes;
  anterior: LinhaMes;
  dias: DiaLinha[];
  produtos: ProdutoLinha[];
  campanhas: CampanhaLinha[];
  metas: MetaLinha[];
  alertas: AlertaLinha[];
  penalidades: PenalidadeLinha[];
  reputacao: { nivel: string; reclamacoes: number; atrasos: number; cancelamentos: number } | null;
  score: { valor: number; classe: string; motivos: string[] } | null;
  /** de onde vieram os números: api, manual, misto ou vazio */
  procedencia: string;
}

export interface PosicaoDePreco {
  acima: number;
  dentro: number;
  abaixo: number;
  semComparacao: number;
}

export interface Dossie extends EntradaDossie {
  derivado: {
    /** existe mês anterior gravado para comparar */
    temAnterior: boolean;
    variacaoFaturamento: number;
    variacaoPedidos: number;
    margem: number;
    ticket: number;
    ticketAnterior: number;
    /** quanto do faturamento do período saiu dos cinco melhores dias */
    concentracaoTopDias: number;
    diasSemVenda: number;
    maiorSequenciaSeca: number;
    catalogo: {
      total: number;
      precoMin: number;
      precoMax: number;
      precoMediano: number;
      comComparacao: number;
    };
    posicao: PosicaoDePreco;
    ads: { invested: number; revenue: number; roas: number | null; acos: number | null } | null;
    metasCumpridas: number;
  };
}

/** ±5% em volta da mediana conta como "no preço do mercado". */
const TOLERANCIA_PRECO = 0.05;

/** Cinco dias é uma semana de trabalho: dá para ver se o mês vive de pico. */
const DIAS_DE_PICO = 5;

function soma(valores: number[]): number {
  return valores.reduce((s, n) => s + n, 0);
}

function medianaSimples(valores: number[]): number {
  if (!valores.length) return 0;
  const v = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(v.length / 2);
  return v.length % 2 ? v[meio] : (v[meio - 1] + v[meio]) / 2;
}

/**
 * Quanto do faturamento saiu dos melhores dias.
 *
 * Mês que vive de dois dias de pico e trinta de nada exige uma ação
 * completamente diferente de mês parelho, e os dois têm o mesmo total.
 */
export function concentracaoTopDias(dias: DiaLinha[], quantos = DIAS_DE_PICO): number {
  const total = soma(dias.map((d) => d.revenue));
  if (total <= 0) return 0;
  const melhores = [...dias].sort((a, b) => b.revenue - a.revenue).slice(0, quantos);
  return soma(melhores.map((d) => d.revenue)) / total;
}

/** Dias sem nenhuma venda e a maior sequência seguida deles. */
export function diasSemVenda(dias: DiaLinha[]): { total: number; maiorSequencia: number } {
  let total = 0;
  let atual = 0;
  let maior = 0;
  for (const d of [...dias].sort((a, b) => a.day.localeCompare(b.day))) {
    if (d.orders > 0 || d.revenue > 0) {
      atual = 0;
      continue;
    }
    total += 1;
    atual += 1;
    if (atual > maior) maior = atual;
  }
  return { total, maiorSequencia: maior };
}

/**
 * Onde o preço da loja está em relação ao mercado.
 *
 * Só olha produto que tem comparação gravada. Produto sem comparação não é
 * "no preço": é desconhecido, e vai contado à parte para a análise não
 * confundir ausência de dado com equilíbrio.
 */
export function posicaoDePreco(produtos: ProdutoLinha[]): PosicaoDePreco {
  const saida: PosicaoDePreco = { acima: 0, dentro: 0, abaixo: 0, semComparacao: 0 };
  for (const p of produtos) {
    if (!p.medianaMercado || p.concorrentes === 0) {
      saida.semComparacao += 1;
      continue;
    }
    const dif = diferencaRelativa(p.preco, p.medianaMercado);
    if (dif > TOLERANCIA_PRECO) saida.acima += 1;
    else if (dif < -TOLERANCIA_PRECO) saida.abaixo += 1;
    else saida.dentro += 1;
  }
  return saida;
}

/**
 * O recorte de produtos que vai no texto.
 *
 * Cem anúncios não cabem no pedido, e mandar os cem primeiros por ordem
 * alfabética não diz nada. Vão os mais caros, os mais baratos e os que têm
 * comparação de mercado — que são os três grupos onde mora decisão de preço.
 */
export function recorteDeProdutos(produtos: ProdutoLinha[], porGrupo = 5): ProdutoLinha[] {
  const porPreco = [...produtos].sort((a, b) => b.preco - a.preco);
  const escolhidos = [
    ...porPreco.slice(0, porGrupo),
    ...porPreco.slice(-porGrupo),
    ...produtos.filter((p) => p.medianaMercado && p.concorrentes > 0).slice(0, porGrupo),
  ];
  const vistos = new Set<string>();
  return escolhidos.filter((p) => {
    const chave = `${p.titulo}|${p.preco}`;
    if (vistos.has(chave)) return false;
    vistos.add(chave);
    return true;
  });
}

export function montarDossie(e: EntradaDossie): Dossie {
  const precos = e.produtos.map((p) => p.preco).filter((v) => v > 0);
  const seco = diasSemVenda(e.dias);
  const investido = soma(e.campanhas.map((c) => c.invested));
  const receitaAds = soma(e.campanhas.map((c) => c.revenue));

  return {
    ...e,
    derivado: {
      temAnterior: e.anterior.revenue > 0 || e.anterior.orders > 0,
      variacaoFaturamento: diferencaRelativa(e.atual.revenue, e.anterior.revenue),
      variacaoPedidos: diferencaRelativa(e.atual.orders, e.anterior.orders),
      margem: e.atual.revenue ? e.atual.profit / e.atual.revenue : 0,
      ticket: e.atual.orders ? e.atual.revenue / e.atual.orders : 0,
      ticketAnterior: e.anterior.orders ? e.anterior.revenue / e.anterior.orders : 0,
      concentracaoTopDias: concentracaoTopDias(e.dias),
      diasSemVenda: seco.total,
      maiorSequenciaSeca: seco.maiorSequencia,
      catalogo: {
        total: e.produtos.length,
        precoMin: precos.length ? Math.min(...precos) : 0,
        precoMax: precos.length ? Math.max(...precos) : 0,
        precoMediano: medianaSimples(precos),
        comComparacao: e.produtos.filter((p) => p.medianaMercado && p.concorrentes > 0).length,
      },
      posicao: posicaoDePreco(e.produtos),
      ads: investido > 0 ? {
        invested: investido,
        revenue: receitaAds,
        roas: investido ? receitaAds / investido : null,
        acos: receitaAds ? investido / receitaAds : null,
      } : null,
      metasCumpridas: e.metas.filter((m) => m.bom).length,
    },
  };
}

function real(v: number): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function porcento(v: number): string {
  return `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

/**
 * O dossiê em texto, do jeito que o modelo recebe.
 *
 * Texto e não JSON de propósito: o pedido fica legível para quem for depurar
 * uma análise estranha meses depois, e é o mesmo texto que a tela guarda.
 */
export function paraTexto(d: Dossie): string {
  const l: string[] = [];
  const dv = d.derivado;

  l.push(`LOJA: ${d.loja.cliente} — ${d.loja.marketplace}${d.loja.apelido ? ` (${d.loja.apelido})` : ""}`);
  l.push(`Situação do cliente: ${d.loja.status}. Mês analisado: ${d.mes}.`);
  l.push(`Origem dos números: ${d.procedencia}.`);
  if (d.contrato.tier || d.contrato.segment) {
    l.push(`Contrato: tier ${d.contrato.tier ?? "—"}, segmento ${d.contrato.segment ?? "—"}, mensalidade R$ ${real(d.contrato.mensalidade ?? 0)}, comissão ${porcento((d.contrato.comissaoPct ?? 0) / 100)}.`);
  }
  if (d.contrato.estrategia) l.push(`Estratégia registrada pela equipe: ${d.contrato.estrategia}`);

  l.push("");
  l.push("FATURAMENTO DO MÊS");
  if (dv.temAnterior) {
    l.push(`Faturamento R$ ${real(d.atual.revenue)} (mês anterior R$ ${real(d.anterior.revenue)}, variação ${porcento(dv.variacaoFaturamento)}).`);
    l.push(`Pedidos ${d.atual.orders} (anterior ${d.anterior.orders}, variação ${porcento(dv.variacaoPedidos)}).`);
    l.push(`Ticket médio R$ ${real(dv.ticket)} (anterior R$ ${real(dv.ticketAnterior)}).`);
  } else {
    // "variação 0%" com mês anterior vazio leria como "ficou igual", quando a
    // verdade é que não existe com o que comparar
    l.push(`Faturamento R$ ${real(d.atual.revenue)}. NÃO existe mês anterior gravado: não afirme crescimento nem queda.`);
    l.push(`Pedidos ${d.atual.orders}. Ticket médio R$ ${real(dv.ticket)}.`);
  }
  l.push(`Lucro R$ ${real(d.atual.profit)}, margem ${porcento(dv.margem)}.`);
  l.push(`Custos: taxas R$ ${real(d.atual.fees)}, frete R$ ${real(d.atual.shipping)}, imposto R$ ${real(d.atual.tax)}, produto R$ ${real(d.atual.cogs)}, anúncios R$ ${real(d.atual.ads)}.`);

  l.push("");
  l.push("RITMO DE VENDA");
  l.push(`Período com dado: ${d.dias.length} dias${d.dias.length ? ` (${d.dias[0].day} a ${d.dias[d.dias.length - 1].day})` : ""}.`);
  l.push(`Dias sem venda: ${dv.diasSemVenda}, maior sequência seca: ${dv.maiorSequenciaSeca} dias.`);
  l.push(`Os ${DIAS_DE_PICO} melhores dias concentram ${porcento(dv.concentracaoTopDias)} do faturamento.`);

  l.push("");
  l.push("CATÁLOGO E PREÇO");
  l.push(`${dv.catalogo.total} anúncios importados. Preço de R$ ${real(dv.catalogo.precoMin)} a R$ ${real(dv.catalogo.precoMax)}, mediano R$ ${real(dv.catalogo.precoMediano)}.`);
  l.push(`Comparação de mercado existe em ${dv.catalogo.comComparacao} anúncios: ${dv.posicao.acima} acima da mediana do mercado, ${dv.posicao.dentro} no mercado, ${dv.posicao.abaixo} abaixo. Sem comparação: ${dv.posicao.semComparacao}.`);
  for (const p of recorteDeProdutos(d.produtos)) {
    const mercado = p.medianaMercado
      ? ` · mercado R$ ${real(p.medianaMercado)} em ${p.concorrentes} concorrentes (${porcento(diferencaRelativa(p.preco, p.medianaMercado))} de diferença)`
      : " · sem comparação de mercado";
    l.push(`- ${p.titulo} · R$ ${real(p.preco)}${mercado}`);
  }

  l.push("");
  l.push("ANÚNCIOS PAGOS");
  if (!dv.ads) {
    l.push("Nenhum investimento em anúncios no mês.");
  } else {
    l.push(`Investido R$ ${real(dv.ads.invested)}, receita atribuída R$ ${real(dv.ads.revenue)}, ROAS ${dv.ads.roas === null ? "indefinido" : dv.ads.roas.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}, ACOS ${dv.ads.acos === null ? "indefinido (gastou e não vendeu)" : porcento(dv.ads.acos)}.`);
    for (const c of d.campanhas.slice(0, 10)) {
      l.push(`- ${c.nome}: investido R$ ${real(c.invested)}, receita R$ ${real(c.revenue)}, ${c.clicks} cliques, ${c.orders} vendas, ROAS ${c.roas === null ? "indefinido" : c.roas.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}.`);
    }
  }

  l.push("");
  l.push("METAS DO MÊS");
  if (!d.metas.length) l.push("Nenhuma meta cadastrada para este mês.");
  for (const m of d.metas) {
    l.push(`- ${m.label}: meta ${real(m.meta)}, realizado ${real(m.realizado)} — ${m.bom ? "cumprida" : "furada"}.`);
  }

  l.push("");
  l.push("PONTOS DE ATENÇÃO JÁ DETECTADOS PELO SISTEMA");
  if (!d.alertas.length) l.push("Nenhum alerta aberto.");
  for (const a of d.alertas) l.push(`- [${a.nivel}] ${a.titulo}: ${a.detalhe}`);

  l.push("");
  l.push("PENALIDADES ABERTAS");
  if (!d.penalidades.length) l.push("Nenhuma penalidade aberta.");
  for (const p of d.penalidades) l.push(`- [${p.severity}] ${p.kind}: ${p.titulo} (detectada em ${p.detectadaEm})`);

  if (d.reputacao) {
    l.push("");
    l.push("REPUTAÇÃO");
    l.push(`Nível ${d.reputacao.nivel}. Reclamações ${porcento(d.reputacao.reclamacoes)}, atrasos ${porcento(d.reputacao.atrasos)}, cancelamentos ${porcento(d.reputacao.cancelamentos)}.`);
  }

  if (d.score) {
    l.push("");
    l.push(`SCORE DE SAÚDE DO CLIENTE: ${d.score.valor} de 100 (${d.score.classe}).`);
    for (const m of d.score.motivos) l.push(`- ${m}`);
  }

  return l.join("\n");
}

/** Todos os números que o dossiê afirma, para conferir o que o modelo cita. */
export function numerosDoDossie(d: Dossie): number[] {
  return numerosDoTrecho(paraTexto(d));
}

/**
 * A evidência citada pelo modelo bate com algum número do dossiê?
 *
 * Mesma ideia da conferência do trecho de origem no comparador de preços: o
 * modelo é obrigado a citar número, e o código confere. A tolerância é de 2%
 * (ou um centavo, para valores pequenos) porque arredondar "17,9%" para "18%"
 * é escrita normal, não invenção.
 *
 * Quem não passa não é apagado, e sim marcado — esconder que o modelo saiu do
 * trilho é pior do que mostrar.
 */
export function evidenciaConfere(evidencia: string, numeros: number[]): boolean {
  const citados = numerosDoTrecho(evidencia ?? "");
  if (!citados.length) return false;
  return citados.some((c) => numeros.some((n) => Math.abs(c - n) <= Math.max(0.01, Math.abs(n) * 0.02)));
}
