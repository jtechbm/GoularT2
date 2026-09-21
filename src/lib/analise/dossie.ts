import { diferencaRelativa, numerosDoTrecho } from "../precos/analise.ts";
import { avaliarIndicador, INDICADOR_LABEL, type Indicador } from "../penalidades/regras.ts";

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

/** Sinais que o marketplace publica sobre os anúncios da loja. */
export interface SinaisDoCatalogo {
  /**
   * Sem nenhuma promoção ativa.
   *
   * null quando o canal não deixa ler promoção — hoje o Mercado Livre, que
   * exige uma permissão a mais. Zero e "não sei" não podem ser a mesma coisa:
   * o dossiê diria "86 anúncios sem promoção" num canal em que ninguém olhou.
   */
  semPromocao: number | null;
  /** rebaixado na busca pelo próprio marketplace (deboost) */
  rebaixados: number;
  /** barrado pelo marketplace: proibido, suspenso, aguardando correção */
  barrados: number;
  /** preço mexido nos últimos sete dias */
  precoMudado: number;
}

/**
 * De onde vieram os números de uma loja.
 *
 * Opcional porque análises gravadas antes disto não têm: a tela mostra a
 * fonte genérica para elas em vez de quebrar.
 */
export interface OrigemDaLoja {
  /** 'api' = a integração trouxe; 'manual' = alguém digitou; 'vazio' = nada no mês */
  fechamento: string;
  /** quando o fechamento do mês mudou pela última vez */
  atualizadoEm: string | null;
  /**
   * 'api', 'manual', 'misto', 'vazio' ou 'nao_medido' (o marketplace não
   * deixa o app ler anúncios: zero aqui NÃO quer dizer que não investiu)
   */
  ads: string;
}

/** Uma loja do cliente, já com os números dela. */
export interface LojaNoDossie {
  /** nome do marketplace como a equipe fala: "Mercado Livre", "Shopee" */
  marketplace: string;
  apelido: string | null;
  statusConta: string;
  /** nota geral que o marketplace dá à loja, quando existe */
  notaDaLoja: number | null;
  /** indicadores de saúde com o alvo do próprio marketplace */
  indicadores: Indicador[];
  sinais: SinaisDoCatalogo;
  /**
   * Leituras que a API recusa por falta de permissão no app.
   *
   * Entra no dossiê de propósito: o modelo precisa saber o que NÃO foi medido,
   * senão "taxa de resposta boa" significaria "ninguém olhou".
   */
  pendencias: string[];
  atual: LinhaMes;
  anterior: LinhaMes;
  dias: DiaLinha[];
  produtos: ProdutoLinha[];
  campanhas: CampanhaLinha[];
  penalidades: PenalidadeLinha[];
  reputacao: { nivel: string; reclamacoes: number; atrasos: number; cancelamentos: number } | null;
  origem?: OrigemDaLoja;
  /** investimento e receita de Ads do mês anterior, para comparar */
  adsAnterior?: { invested: number; revenue: number } | null;
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
  ads: {
    invested: number;
    revenue: number;
    roas: number | null;
    acos: number | null;
    /** investimento sobre o faturamento do canal (TACOS): quanto da venda vai para anúncio */
    pctFaturamento: number | null;
    /** variação do investimento contra o mês anterior; null sem mês anterior */
    variacaoInvestido: number | null;
    roasAnterior: number | null;
  } | null;
  /** o marketplace não deixa ler Ads deste canal */
  adsNaoMedido: boolean;
  /** quanto esta loja representa do faturamento do cliente */
  fatiaDoFaturamento: number;
  /** indicadores fora do alvo, já com o texto pronto */
  indicadoresFora: { nome: string; texto: string; severidade: string }[];
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
    /**
     * Penalidades que pedem ação: crítica ou atenção.
     *
     * O contador do menu já excluía as informativas, e a análise contava tudo:
     * a mesma loja aparecia com 11 num canto da tela e 14 no outro.
     */
    penalidadesAbertas: number;
    /** as informativas, contadas à parte para o número não brigar com o menu */
    penalidadesInformativas: number;
    /** indicadores de saúde fora do alvo, somando os canais */
    indicadoresFora: number;
    /** Ads somando os canais; null quando nenhum canal investiu */
    ads: {
      invested: number;
      revenue: number;
      roas: number | null;
      pctFaturamento: number | null;
      /** algum canal não deixa ler Ads: o total está incompleto */
      incompleto: boolean;
    } | null;
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
  const antes = l.adsAnterior ?? null;

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
            pctFaturamento: l.atual.revenue ? investido / l.atual.revenue : null,
            variacaoInvestido: antes?.invested ? diferencaRelativa(investido, antes.invested) : null,
            roasAnterior: antes?.invested ? antes.revenue / antes.invested : null,
          }
        : null,
    adsNaoMedido: l.origem?.ads === "nao_medido",
    fatiaDoFaturamento: faturamentoDoCliente ? l.atual.revenue / faturamentoDoCliente : 0,
    indicadoresFora: l.indicadores
      .map((i) => ({ indicador: i, avaliacao: avaliarIndicador(i) }))
      .filter(({ avaliacao }) => avaliacao.fora)
      .map(({ indicador, avaliacao }) => ({
        nome: indicador.nome,
        texto: avaliacao.texto,
        severidade: avaliacao.severidade,
      })),
  };
}

export function montarDossie(e: EntradaDossie): Dossie {
  const atual = somarLinhas(e.lojas.map((l) => l.atual));
  const anterior = somarLinhas(e.lojas.map((l) => l.anterior));
  const porLoja = e.lojas.map((l) => ({ ...l, derivado: derivarLoja(l, atual.revenue) }));
  const investido = soma(porLoja.map((l) => l.derivado.ads?.invested ?? 0));
  const receitaAds = soma(porLoja.map((l) => l.derivado.ads?.revenue ?? 0));

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
      penalidadesAbertas: soma(
        e.lojas.map((l) => l.penalidades.filter((p) => p.severity !== "informativo").length),
      ),
      penalidadesInformativas: soma(
        e.lojas.map((l) => l.penalidades.filter((p) => p.severity === "informativo").length),
      ),
      indicadoresFora: soma(
        e.lojas.map((l) => l.indicadores.filter((i) => avaliarIndicador(i).fora).length),
      ),
      ads: investido
        ? {
            invested: investido,
            revenue: receitaAds,
            roas: receitaAds / investido,
            pctFaturamento: atual.revenue ? investido / atual.revenue : null,
            incompleto: porLoja.some((l) => l.derivado.adsNaoMedido),
          }
        : null,
    },
    porLoja,
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

/** Uma linha do dossiê com a origem do que ela afirma. */
export interface LinhaDoDossie {
  /** F1, F2…; null em título de seção e linha em branco */
  id: string | null;
  texto: string;
  /** de onde vem o número: loja, API ou lançado à mão, e quando */
  fonte: string | null;
}

const ROTULO_ORIGEM: Record<string, string> = {
  api: "lido pela integração",
  manual: "lançado à mão pela equipe",
  misto: "integração + lançado à mão",
  vazio: "sem dado no mês",
  nao_medido: "o marketplace não deixa ler",
};

function dataCurta(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return ` · atualizado em ${d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}`;
}

/**
 * O dossiê linha a linha, cada uma com a sua fonte.
 *
 * É daqui que sai o texto do modelo e a tela "de onde vêm os números". O
 * modelo cita os ids das linhas que usou, e a tela mostra a linha e a fonte
 * ao lado de cada afirmação: o Kadu vê de onde saiu o número sem ter de
 * confiar na IA.
 */
export function linhasDoDossie(d: Dossie): LinhaDoDossie[] {
  const saida: LinhaDoDossie[] = [];
  let fonte: string | null = null;
  const l = {
    push(...textos: string[]) {
      for (const texto of textos) saida.push({ id: null, texto, fonte: texto.trim() ? fonte : null });
    },
    /** título de seção: não afirma número, não ganha id */
    titulo(texto: string) {
      saida.push({ id: null, texto, fonte: null });
    },
  };
  const dv = d.derivado;
  const canais = d.porLoja.map((x) => x.marketplace).join(" e ");
  const mesDoDossie = d.mes.split("-").reverse().join("/");
  fonte = "Cadastro do cliente no sistema";

  l.push(`CLIENTE: ${d.cliente.nome} — vende em ${canais || "nenhum canal conectado"}`);
  l.push(`Situação: ${d.cliente.status}. Mês analisado: ${d.mes}. Origem dos números: ${d.procedencia}.`);
  if (d.contrato.tier || d.contrato.segment) {
    l.push(
      `Contrato: tier ${d.contrato.tier ?? "—"}, segmento ${d.contrato.segment ?? "—"}, mensalidade R$ ${real(d.contrato.mensalidade ?? 0)}, comissão ${porcento((d.contrato.comissaoPct ?? 0) / 100)}.`,
    );
  }
  if (d.contrato.estrategia) l.push(`Estratégia registrada pela equipe: ${d.contrato.estrategia}`);

  l.push("");
  fonte = `Fechamento de ${mesDoDossie}, somando os canais · ${ROTULO_ORIGEM[d.procedencia] ?? d.procedencia}`;
  l.titulo("TOTAL DO CLIENTE, SOMANDO OS CANAIS");
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

  if (dv.ads) {
    l.push(
      `Anúncios somando os canais: investido R$ ${real(dv.ads.invested)}${dv.ads.pctFaturamento === null ? "" : ` (${porcento(dv.ads.pctFaturamento)} do faturamento)`}, receita atribuída R$ ${real(dv.ads.revenue)}, ROAS ${multiplo(dv.ads.roas)}.${dv.ads.incompleto ? " INCOMPLETO: falta o Ads de canal que o marketplace não deixa ler." : ""}`,
    );
  }

  for (const loja of d.porLoja) {
    const ld = loja.derivado;
    const o = loja.origem;
    const fonteLoja = `${loja.marketplace} · pedidos de ${mesDoDossie} · ${ROTULO_ORIGEM[o?.fechamento ?? d.procedencia] ?? "fechamento do mês"}${dataCurta(o?.atualizadoEm)}`;
    l.push("");
    l.titulo(`=== CANAL: ${loja.marketplace.toUpperCase()}${loja.apelido ? ` (${loja.apelido})` : ""} ===`);
    fonte = fonteLoja;
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

    fonte = `${loja.marketplace} · vendas dia a dia dos últimos 30 dias`;
    l.push(
      `Ritmo: ${loja.dias.length} dias com dado${loja.dias.length ? ` (${loja.dias[0].day} a ${loja.dias[loja.dias.length - 1].day})` : ""}, ${ld.diasSemVenda} sem venda, maior sequência seca ${ld.maiorSequenciaSeca} dias, ${DIAS_DE_PICO} melhores dias concentram ${porcento(ld.concentracaoTopDias)}.`,
    );

    fonte = `${loja.marketplace} · anúncios importados da loja, com a comparação de preço do sistema`;
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

    fonte = `${loja.marketplace} Ads · campanhas de ${mesDoDossie} · ${ROTULO_ORIGEM[o?.ads ?? "api"] ?? "campanhas do mês"}`;
    if (ld.adsNaoMedido && !ld.ads) {
      l.push(
        "Anúncios pagos: NÃO MEDIDO neste canal. O marketplace não deixa o app ler o investimento em anúncios; " +
          "zero aqui não quer dizer que não investiu. Não conclua nada sobre ROAS nem investimento deste canal.",
      );
    } else if (!ld.ads) {
      l.push("Anúncios pagos: nenhum investimento no mês neste canal.");
    } else {
      l.push(
        `Anúncios pagos: investido R$ ${real(ld.ads.invested)}${ld.ads.pctFaturamento === null ? "" : ` (${porcento(ld.ads.pctFaturamento)} do faturamento do canal)`}, receita atribuída R$ ${real(ld.ads.revenue)}, ROAS ${multiplo(ld.ads.roas)}, ACOS ${ld.ads.acos === null ? "indefinido (gastou e não vendeu)" : porcento(ld.ads.acos)}.`,
      );
      if (ld.ads.variacaoInvestido !== null && loja.adsAnterior) {
        l.push(
          `Anúncios no mês anterior: investido R$ ${real(loja.adsAnterior.invested)}, receita R$ ${real(loja.adsAnterior.revenue)}, ROAS ${multiplo(ld.ads.roasAnterior)}; o investimento variou ${porcento(ld.ads.variacaoInvestido)}.`,
        );
      }
      if (ld.adsNaoMedido) {
        l.push("Parte do Ads deste canal NÃO foi lida (o marketplace não deixa): o investimento acima pode estar incompleto.");
      }
      for (const c of loja.campanhas.slice(0, 8)) {
        l.push(
          `  - ${c.nome}: investido R$ ${real(c.invested)}, receita R$ ${real(c.revenue)}, ${c.clicks} cliques, ${c.orders} vendas, ROAS ${multiplo(c.roas)}.`,
        );
      }
    }

    fonte = `${loja.marketplace} · saúde da loja publicada pelo marketplace`;
    if (loja.notaDaLoja !== null) l.push(`Nota que o marketplace dá à loja: ${loja.notaDaLoja} de 5.`);

    if (loja.indicadores.length) {
      const fora = ld.indicadoresFora;
      if (fora.length) {
        l.push(`INDICADORES FORA DO ALVO (${fora.length}):`);
        for (const i of fora) l.push(`  - [${i.severidade}] ${i.texto}`);
      } else {
        l.push("Indicadores de saúde: todos dentro do alvo do marketplace.");
      }
      const dentro = loja.indicadores
        .filter((i) => !avaliarIndicador(i).fora && i.atual !== null)
        .map((i) => `${INDICADOR_LABEL[i.nome] ?? i.nome} ${i.atual}${i.unidade === 2 ? "%" : ""}`);
      if (dentro.length) l.push(`Indicadores dentro do alvo: ${dentro.join(", ")}.`);
    }

    fonte = `${loja.marketplace} · situação dos anúncios importados da loja`;
    l.push(
      `Sinais do catálogo: ${loja.sinais.barrados} barrados pelo marketplace, ` +
        `${loja.sinais.rebaixados} rebaixados na busca, ` +
        (loja.sinais.semPromocao === null ? "promoção não lida neste canal" : `${loja.sinais.semPromocao} sem promoção`) +
        `, ${loja.sinais.precoMudado} com preço mexido nos últimos 7 dias.`,
    );

    fonte = `${loja.marketplace} · penalidades lidas do marketplace`;
    if (loja.penalidades.length) {
      for (const p of loja.penalidades) {
        l.push(`Penalidade [${p.severity}] ${p.kind}: ${p.titulo} (detectada em ${p.detectadaEm}).`);
      }
    } else {
      l.push("Penalidades: nenhuma aberta neste canal.");
    }

    fonte = `${loja.marketplace} · permissões do app na loja`;
    if (loja.pendencias.length) {
      l.push(
        `NÃO MEDIDO neste canal, por falta de permissão no app: ${loja.pendencias.join(", ")}. ` +
          "Não afirme nada sobre esses temas aqui: ausência de alerta não é sinal de que está bom.",
      );
    }

    fonte = `${loja.marketplace} · reputação publicada pelo marketplace`;
    if (loja.reputacao) {
      l.push(
        `Reputação: nível ${loja.reputacao.nivel}, reclamações ${porcento(loja.reputacao.reclamacoes)}, atrasos ${porcento(loja.reputacao.atrasos)}, cancelamentos ${porcento(loja.reputacao.cancelamentos)}.`,
      );
    }
  }

  l.push("");
  fonte = "Metas cadastradas pela equipe no sistema";
  l.titulo("METAS DO MÊS (do cliente, somando os canais)");
  if (!d.metas.length) l.push("Nenhuma meta cadastrada para este mês.");
  for (const m of d.metas) {
    l.push(`- ${m.label}: meta ${real(m.meta)}, realizado ${real(m.realizado)} — ${m.bom ? "cumprida" : "furada"}.`);
  }

  l.push("");
  fonte = "Alertas calculados pelo sistema";
  l.titulo("PONTOS DE ATENÇÃO JÁ DETECTADOS PELO SISTEMA");
  if (!d.alertas.length) l.push("Nenhum alerta aberto.");
  for (const a of d.alertas) l.push(`- [${a.nivel}] ${a.titulo}: ${a.detalhe}`);

  if (d.score) {
    l.push("");
    fonte = "Score de saúde calculado pelo sistema";
    l.push(`SCORE DE SAÚDE DO CLIENTE: ${d.score.valor} de 100 (${d.score.classe}).`);
    for (const m of d.score.motivos) l.push(`- ${m}`);
  }

  let n = 0;
  return saida.map((linha) => (linha.fonte ? { ...linha, id: `F${++n}` } : linha));
}

/**
 * O dossiê em texto, do jeito que o modelo recebe.
 *
 * Texto e não JSON de propósito: o pedido fica legível para quem for depurar
 * uma análise estranha meses depois. Cada linha com número leva o id [F12]
 * que o modelo cita em `fontes`.
 */
export function paraTexto(d: Dossie): string {
  return linhasDoDossie(d)
    .map((l) => (l.id ? `[${l.id}] ${l.texto}` : l.texto))
    .join("\n");
}

/** Os ids [F12] não são números do dossiê: saem antes de conferir. */
function semIds(texto: string): string {
  return texto.replace(/\[?\bF\d+\b\]?/g, " ");
}

/** Todos os números que o dossiê afirma, para conferir o que o modelo cita. */
export function numerosDoDossie(d: Dossie): number[] {
  return numerosDoTrecho(linhasDoDossie(d).map((l) => l.texto).join("\n"));
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
  const citados = numerosDoTrecho(semIds(evidencia ?? ""));
  if (!citados.length) return false;
  return citados.some((c) => numeros.some((n) => Math.abs(c - n) <= Math.max(0.01, Math.abs(n) * 0.02)));
}

/**
 * A evidência bate com as linhas que o modelo disse ter usado?
 *
 * Mais forte que conferir contra o dossiê inteiro: "R$ 1.000" existe em
 * algum lugar quase sempre, mas precisa existir NA linha citada. Sem fonte
 * citada, cai na conferência geral.
 */
export function evidenciaConfereNasLinhas(evidencia: string, linhas: LinhaDoDossie[]): boolean {
  if (!linhas.length) return false;
  return evidenciaConfere(evidencia, numerosDoTrecho(linhas.map((l) => l.texto).join("\n")));
}
