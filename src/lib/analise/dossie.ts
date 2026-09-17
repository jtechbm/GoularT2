import { diferencaRelativa, numerosDoTrecho } from "../precos/analise.ts";

/**
 * O dossiê do cliente: a parte que só faz conta.
 *
 * A unidade é o CLIENTE, não a loja. Quem atende o Kadu quer saber o que
 * fazer com o cliente inteiro, e ele vende no Mercado Livre e na Shopee ao
 * mesmo tempo: separar as duas análises esconderia justamente o que interessa
 * — o mesmo produto com preço diferente em cada canal, o canal que carrega o
 * faturamento, o canal que só dá trabalho. Cada loja aparece na sua seção, e
 * o total aparece no topo.
 *
 * Este arquivo não fala com banco, com marketplace nem com modelo de
 * linguagem. Todo número que o modelo pode citar sai daqui, e o que ele
 * devolve é conferido de volta contra esta mesma lista.
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

/** Uma loja do cliente, já com os números dela. */
export interface LojaNoDossie {
  /** nome do marketplace como a equipe fala: "Mercado Livre", "Shopee" */
  marketplace: string;
  apelido: string | null;
  statusConta: string;
  atual: LinhaMes;
  anterior: LinhaMes;
  dias: DiaLinha[];
  produtos: ProdutoLinha[];
  campanhas: CampanhaLinha[];
  penalidades: PenalidadeLinha[];
  reputacao: { nivel: string; reclamacoes: number; atrasos: number; cancelamentos: number } | null;
}

export interface EntradaDossie {
  cliente: { nome: string; status: string };
  contrato: {
    tier: string | null;
    segment: string | null;
    mensalidade: number | null;
    comissaoPct: number | null;
    desde: string | null;
    estrategia: string | null;
  };
  mes: string;
  lojas: LojaNoDossie[];
  /** metas, alertas e score são do cliente: somam as lojas de propósito */
  metas: MetaLinha[];
  alertas: AlertaLinha[];
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

export interface DerivadoLoja {
  temAnterior: boolean;
  variacaoFaturamento: number;
  margem: number;
  ticket: number;
  ticketAnterior: number;
  concentracaoTopDias: number;
  diasSemVenda: number;
  maiorSequenciaSeca: number;
  catalogo: { total: number; precoMin: number; precoMax: number; precoMediano: number; comComparacao: number };
  posicao: PosicaoDePreco;
  ads: { invested: number; revenue: number; roas: number | null; acos: number | null } | null;
  /** quanto esta loja representa do faturamento do cliente */
  fatiaDoFaturamento: number;
}

export interface Dossie extends EntradaDossie {
  total: { atual: LinhaMes; anterior: LinhaMes };
  derivado: {
    temAnterior: boolean;
    variacaoFaturamento: number;
    variacaoPedidos: number;
    margem: number;
    ticket: number;
    metasCumpridas: number;
    penalidadesAbertas: number;
  };
  porLoja: (LojaNoDossie & { derivado: DerivadoLoja })[];
}

/** ±5% em volta da mediana conta como "no preço do mercado". */
const TOLERANCIA_PRECO = 0.05;

/** Cinco dias é uma semana de trabalho: dá para ver se o mês vive de pico. */
const DIAS_DE_PICO = 5;

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

function soma(valores: number[]): number {
  return valores.reduce((s, n) => s + n, 0);
}

function somarLinhas(linhas: LinhaMes[]): LinhaMes {
  return linhas.reduce<LinhaMes>(
    (acc, l) => ({
      revenue: acc.revenue + l.revenue,
      orders: acc.orders + l.orders,
      units: acc.units + l.units,
      profit: acc.profit + l.profit,
      fees: acc.fees + l.fees,
      shipping: acc.shipping + l.shipping,
      tax: acc.tax + l.tax,
      ads: acc.ads + l.ads,
      cogs: acc.cogs + l.cogs,
    }),
    { ...VAZIO },
  );
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
export function recorteDeProdutos(produtos: ProdutoLinha[], porGrupo = 4): ProdutoLinha[] {
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

function derivarLoja(l: LojaNoDossie, faturamentoDoCliente: number): DerivadoLoja {
  const precos = l.produtos.map((p) => p.preco).filter((v) => v > 0);
  const seco = diasSemVenda(l.dias);
  const investido = soma(l.campanhas.map((c) => c.invested));
  const receitaAds = soma(l.campanhas.map((c) => c.revenue));

  return {
    temAnterior: l.anterior.revenue > 0 || l.anterior.orders > 0,
    variacaoFaturamento: diferencaRelativa(l.atual.revenue, l.anterior.revenue),
    margem: l.atual.revenue ? l.atual.profit / l.atual.revenue : 0,
    ticket: l.atual.orders ? l.atual.revenue / l.atual.orders : 0,
    ticketAnterior: l.anterior.orders ? l.anterior.revenue / l.anterior.orders : 0,
    concentracaoTopDias: concentracaoTopDias(l.dias),
    diasSemVenda: seco.total,
    maiorSequenciaSeca: seco.maiorSequencia,
    catalogo: {
      total: l.produtos.length,
      precoMin: precos.length ? Math.min(...precos) : 0,
      precoMax: precos.length ? Math.max(...precos) : 0,
      precoMediano: medianaSimples(precos),
      comComparacao: l.produtos.filter((p) => p.medianaMercado && p.concorrentes > 0).length,
    },
    posicao: posicaoDePreco(l.produtos),
    ads:
      investido > 0
        ? {
            invested: investido,
            revenue: receitaAds,
            roas: investido ? receitaAds / investido : null,
            acos: receitaAds ? investido / receitaAds : null,
          }
        : null,
    fatiaDoFaturamento: faturamentoDoCliente ? l.atual.revenue / faturamentoDoCliente : 0,
  };
}

export function montarDossie(e: EntradaDossie): Dossie {
  const atual = somarLinhas(e.lojas.map((l) => l.atual));
  const anterior = somarLinhas(e.lojas.map((l) => l.anterior));

  return {
    ...e,
    total: { atual, anterior },
    derivado: {
      temAnterior: anterior.revenue > 0 || anterior.orders > 0,
      variacaoFaturamento: diferencaRelativa(atual.revenue, anterior.revenue),
      variacaoPedidos: diferencaRelativa(atual.orders, anterior.orders),
      margem: atual.revenue ? atual.profit / atual.revenue : 0,
      ticket: atual.orders ? atual.revenue / atual.orders : 0,
      metasCumpridas: e.metas.filter((m) => m.bom).length,
      penalidadesAbertas: soma(e.lojas.map((l) => l.penalidades.length)),
    },
    porLoja: e.lojas.map((l) => ({ ...l, derivado: derivarLoja(l, atual.revenue) })),
  };
}

function real(v: number): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function porcento(v: number): string {
  return `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

function multiplo(v: number | null): string {
  return v === null ? "indefinido" : v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
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
  const canais = d.porLoja.map((x) => x.marketplace).join(" e ");

  l.push(`CLIENTE: ${d.cliente.nome} — vende em ${canais || "nenhum canal conectado"}`);
  l.push(`Situação: ${d.cliente.status}. Mês analisado: ${d.mes}. Origem dos números: ${d.procedencia}.`);
  if (d.contrato.tier || d.contrato.segment) {
    l.push(
      `Contrato: tier ${d.contrato.tier ?? "—"}, segmento ${d.contrato.segment ?? "—"}, mensalidade R$ ${real(d.contrato.mensalidade ?? 0)}, comissão ${porcento((d.contrato.comissaoPct ?? 0) / 100)}.`,
    );
  }
  if (d.contrato.estrategia) l.push(`Estratégia registrada pela equipe: ${d.contrato.estrategia}`);

  l.push("");
  l.push("TOTAL DO CLIENTE, SOMANDO OS CANAIS");
  if (dv.temAnterior) {
    l.push(
      `Faturamento R$ ${real(d.total.atual.revenue)} (mês anterior R$ ${real(d.total.anterior.revenue)}, variação ${porcento(dv.variacaoFaturamento)}).`,
    );
    l.push(`Pedidos ${d.total.atual.orders} (anterior ${d.total.anterior.orders}, variação ${porcento(dv.variacaoPedidos)}).`);
  } else {
    // "variação 0%" com mês anterior vazio leria como "ficou igual", quando a
    // verdade é que não existe com o que comparar
    l.push(`Faturamento R$ ${real(d.total.atual.revenue)}. NÃO existe mês anterior gravado: não afirme crescimento nem queda.`);
    l.push(`Pedidos ${d.total.atual.orders}.`);
  }
  l.push(`Ticket médio R$ ${real(dv.ticket)}. Lucro R$ ${real(d.total.atual.profit)}, margem ${porcento(dv.margem)}.`);
  l.push(
    `Custos: taxas R$ ${real(d.total.atual.fees)}, frete R$ ${real(d.total.atual.shipping)}, imposto R$ ${real(d.total.atual.tax)}, produto R$ ${real(d.total.atual.cogs)}, anúncios R$ ${real(d.total.atual.ads)}.`,
  );
  if (d.porLoja.length > 1) {
    l.push(
      `Divisão por canal: ${d.porLoja.map((x) => `${x.marketplace} ${porcento(x.derivado.fatiaDoFaturamento)}`).join(", ")}.`,
    );
  }

  for (const loja of d.porLoja) {
    const ld = loja.derivado;
    l.push("");
    l.push(`=== CANAL: ${loja.marketplace.toUpperCase()}${loja.apelido ? ` (${loja.apelido})` : ""} ===`);
    l.push(`Conexão: ${loja.statusConta}. Fatia do faturamento do cliente: ${porcento(ld.fatiaDoFaturamento)}.`);

    if (ld.temAnterior) {
      l.push(
        `Faturamento R$ ${real(loja.atual.revenue)} (anterior R$ ${real(loja.anterior.revenue)}, variação ${porcento(ld.variacaoFaturamento)}), ${loja.atual.orders} pedidos, ticket R$ ${real(ld.ticket)}.`,
      );
    } else {
      l.push(
        `Faturamento R$ ${real(loja.atual.revenue)} em ${loja.atual.orders} pedidos, ticket R$ ${real(ld.ticket)}. Sem mês anterior gravado neste canal.`,
      );
    }
    l.push(`Lucro R$ ${real(loja.atual.profit)}, margem ${porcento(ld.margem)}, taxas R$ ${real(loja.atual.fees)}.`);

    l.push(
      `Ritmo: ${loja.dias.length} dias com dado${loja.dias.length ? ` (${loja.dias[0].day} a ${loja.dias[loja.dias.length - 1].day})` : ""}, ${ld.diasSemVenda} sem venda, maior sequência seca ${ld.maiorSequenciaSeca} dias, ${DIAS_DE_PICO} melhores dias concentram ${porcento(ld.concentracaoTopDias)}.`,
    );

    if (!ld.catalogo.total) {
      l.push("Catálogo: nenhum anúncio importado neste canal — não dá para falar de preço aqui.");
    } else {
      l.push(
        `Catálogo: ${ld.catalogo.total} anúncios, de R$ ${real(ld.catalogo.precoMin)} a R$ ${real(ld.catalogo.precoMax)}, mediano R$ ${real(ld.catalogo.precoMediano)}.`,
      );
      l.push(
        `Preço contra o mercado (${ld.catalogo.comComparacao} anúncios comparados): ${ld.posicao.acima} acima, ${ld.posicao.dentro} no mercado, ${ld.posicao.abaixo} abaixo, ${ld.posicao.semComparacao} sem comparação.`,
      );
      for (const p of recorteDeProdutos(loja.produtos)) {
        const mercado = p.medianaMercado
          ? ` · mercado R$ ${real(p.medianaMercado)} em ${p.concorrentes} concorrentes (${porcento(diferencaRelativa(p.preco, p.medianaMercado))} de diferença)`
          : " · sem comparação";
        l.push(`  - ${p.titulo} · R$ ${real(p.preco)}${mercado}`);
      }
    }

    if (!ld.ads) {
      l.push("Anúncios pagos: nenhum investimento no mês neste canal.");
    } else {
      l.push(
        `Anúncios pagos: investido R$ ${real(ld.ads.invested)}, receita R$ ${real(ld.ads.revenue)}, ROAS ${multiplo(ld.ads.roas)}, ACOS ${ld.ads.acos === null ? "indefinido (gastou e não vendeu)" : porcento(ld.ads.acos)}.`,
      );
      for (const c of loja.campanhas.slice(0, 8)) {
        l.push(
          `  - ${c.nome}: investido R$ ${real(c.invested)}, receita R$ ${real(c.revenue)}, ${c.clicks} cliques, ${c.orders} vendas, ROAS ${multiplo(c.roas)}.`,
        );
      }
    }

    if (loja.penalidades.length) {
      for (const p of loja.penalidades) {
        l.push(`Penalidade [${p.severity}] ${p.kind}: ${p.titulo} (detectada em ${p.detectadaEm}).`);
      }
    } else {
      l.push("Penalidades: nenhuma aberta neste canal.");
    }

    if (loja.reputacao) {
      l.push(
        `Reputação: nível ${loja.reputacao.nivel}, reclamações ${porcento(loja.reputacao.reclamacoes)}, atrasos ${porcento(loja.reputacao.atrasos)}, cancelamentos ${porcento(loja.reputacao.cancelamentos)}.`,
      );
    }
  }

  l.push("");
  l.push("METAS DO MÊS (do cliente, somando os canais)");
  if (!d.metas.length) l.push("Nenhuma meta cadastrada para este mês.");
  for (const m of d.metas) {
    l.push(`- ${m.label}: meta ${real(m.meta)}, realizado ${real(m.realizado)} — ${m.bom ? "cumprida" : "furada"}.`);
  }

  l.push("");
  l.push("PONTOS DE ATENÇÃO JÁ DETECTADOS PELO SISTEMA");
  if (!d.alertas.length) l.push("Nenhum alerta aberto.");
  for (const a of d.alertas) l.push(`- [${a.nivel}] ${a.titulo}: ${a.detalhe}`);

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
