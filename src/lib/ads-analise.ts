import type { AdsEntry } from "./types.ts";

/**
 * Métricas derivadas de uma campanha.
 *
 * Todas as divisões guardam a mesma regra: sem denominador, o resultado é
 * null, não zero. ACOS zero quer dizer "gastou nada e vendeu", que é
 * ótimo; ACOS indefinido quer dizer "não vendeu nada", que é o oposto.
 * Confundir os dois faria a pior campanha da conta parecer a melhor.
 */
/**
 * A receita atribuída desta linha de Ads é conhecida?
 *
 * Lançamento à mão sem receita e sem pedidos quer dizer "não informado", não
 * "não vendeu": a pessoa sabia o investido e não o retorno. Tratar como zero
 * punha "não vendeu" na tela, alerta crítico de dinheiro sem retorno e a IA
 * dizendo que a campanha fracassou. A linha que vem da API sempre é conhecida.
 */
export function receitaInformada(e: {
  source?: string | null;
  external_id?: string | null;
  revenue: number;
  orders: number;
}): boolean {
  if (e.revenue > 0 || e.orders > 0) return true;
  // recarga de crédito lida da carteira: sabe-se o gasto, não o retorno
  if (eRecarga(e)) return false;
  return e.source === "api";
}

/** Linha montada a partir das recargas de crédito de Shopee Ads na carteira. */
export function eRecarga(e: { external_id?: string | null }): boolean {
  return (e.external_id ?? "").startsWith("recargas-");
}

/**
 * Parte mínima do investido que precisa ter retorno conhecido para o ROAS
 * valer como o ROAS daquele investimento.
 */
export const COBERTURA_MINIMA_ROAS = 0.9;

/**
 * ROAS de um total que mistura investido com e sem retorno conhecido.
 *
 * ROAS é vendas dos anúncios ÷ investido. Quando só parte do investido
 * informa vendas (recarga de crédito da Shopee, lançamento à mão), o ROAS
 * dessa parte ao lado do investido total engana: a tela mostrava R$ 7.931
 * investidos e "ROAS 5,21x", que era o ROAS de R$ 31 do Mercado Livre. Abaixo
 * de 90% de cobertura não há ROAS do total, e a tela diz a cobertura.
 */
export function roasDoTotal(
  investido: number,
  comRetorno: number,
  receita: number,
): { roas: number | null; cobertura: number } {
  if (investido <= 0) return { roas: null, cobertura: 0 };
  const cobertura = comRetorno / investido;
  if (cobertura < COBERTURA_MINIMA_ROAS || comRetorno <= 0) return { roas: null, cobertura };
  return { roas: receita / comRetorno, cobertura };
}

/**
 * O ROAS que a tela mostra: sempre um número quando há investimento.
 *
 * Com as vendas dos anúncios conhecidas (90% do investido ou mais), é o ROAS
 * de verdade: vendas dos anúncios ÷ investido. Sem elas (recarga de crédito
 * da Shopee, que diz o gasto mas não a venda), é o ROAS geral: faturamento
 * total ÷ investido. O geral inclui a venda orgânica e sai maior; por isso
 * vem marcado, e nunca é pintado de bom ou ruim com a régua do outro.
 */
export function roasExibido(
  investido: number,
  comRetorno: number,
  receitaAds: number,
  faturamento: number,
): { valor: number; geral: boolean } | null {
  if (investido <= 0) return null;
  const { roas } = roasDoTotal(investido, comRetorno, receitaAds);
  if (roas !== null) return { valor: roas, geral: false };
  return faturamento > 0 ? { valor: faturamento / investido, geral: true } : null;
}

export const EXPLICA_ROAS_GERAL =
  "ROAS geral = faturamento total ÷ investido em Ads. Usado quando o marketplace não informa quanto os anúncios venderam (recargas da Shopee). Inclui a venda orgânica, então é maior que o ROAS dos anúncios.";

/** "ROAS 5,21x" ou "ROAS geral 25,7x": o número, sempre dizendo qual é. */
export function formatarRoas(r: { valor: number; geral: boolean } | null): string {
  if (!r) return "sem investimento";
  const n = r.valor.toLocaleString("pt-BR", { maximumFractionDigits: r.geral ? 1 : 2, minimumFractionDigits: r.geral ? 1 : 2 });
  return `ROAS${r.geral ? " geral" : ""} ${n}x`;
}

/** Texto do ROAS para dica de cartão. */
export function textoRoas(investido: number, comRetorno: number, receitaAds: number, faturamento: number): string {
  return formatarRoas(roasExibido(investido, comRetorno, receitaAds, faturamento));
}

export interface CampanhaAnalisada {
  id: string;
  nome: string;
  marketplace: string;
  clientId: string;
  clientName: string;
  automatica: boolean;
  /** false: lançado à mão sem o retorno; ROAS e ACOS ficam indefinidos */
  receitaInformada: boolean;
  /** investimento lido das recargas de crédito na carteira da Shopee */
  recarga: boolean;
  invested: number;
  revenue: number;
  clicks: number;
  orders: number;
  /** receita ÷ investido */
  roas: number | null;
  /** investido ÷ receita */
  acos: number | null;
  /** custo por clique */
  cpc: number | null;
  /** pedidos ÷ cliques */
  conversao: number | null;
  /** ticket dos pedidos vindos de anúncio */
  ticket: number | null;
}

export function analisarCampanha(
  e: AdsEntry & { client_name?: string },
): CampanhaAnalisada {
  const informada = receitaInformada(e);
  return {
    id: e.id,
    nome: e.campaign ?? "sem nome",
    marketplace: e.marketplace,
    clientId: e.client_id,
    clientName: e.client_name ?? "",
    automatica: e.source === "api",
    receitaInformada: informada,
    recarga: eRecarga(e),
    invested: e.invested,
    revenue: e.revenue,
    clicks: e.clicks,
    orders: e.orders,
    roas: informada && e.invested > 0 ? e.revenue / e.invested : null,
    acos: informada && e.revenue > 0 ? e.invested / e.revenue : null,
    cpc: e.clicks > 0 ? e.invested / e.clicks : null,
    conversao: e.clicks > 0 ? e.orders / e.clicks : null,
    ticket: e.orders > 0 ? e.revenue / e.orders : null,
  };
}

/**
 * Ordena as campanhas da melhor para a pior.
 *
 * Campanha que gastou sem vender nada vai para o fim, antes das que têm
 * ROAS baixo: dinheiro sem retorno nenhum é pior do que retorno ruim. E
 * campanha que não gastou nada fica fora do ranking, porque não há o que
 * avaliar nela.
 */
export function ordenarPorDesempenho(campanhas: CampanhaAnalisada[]): CampanhaAnalisada[] {
  return [...campanhas]
    .filter((c) => c.invested > 0 && c.receitaInformada)
    .sort((a, b) => {
      const ra = a.roas ?? -1;
      const rb = b.roas ?? -1;
      if (ra !== rb) return rb - ra;
      return b.invested - a.invested;
    });
}

export interface ResumoAds {
  invested: number;
  revenue: number;
  clicks: number;
  orders: number;
  prints: number;
  roas: number | null;
  acos: number | null;
  cpc: number | null;
  ctr: number | null;
  conversao: number | null;
  /** investido em linhas sem retorno informado: fora do ROAS */
  semRetorno: number;
}

export function resumirAds(
  campanhas: CampanhaAnalisada[],
  prints = 0,
): ResumoAds {
  const soma = campanhas.reduce(
    (a, c) => ({
      invested: a.invested + c.invested,
      revenue: a.revenue + c.revenue,
      clicks: a.clicks + c.clicks,
      orders: a.orders + c.orders,
    }),
    { invested: 0, revenue: 0, clicks: 0, orders: 0 },
  );

  // o ROAS só compara o que tem os dois lados: investido sem retorno
  // informado ficaria no denominador e derrubaria o número
  const comRetorno = campanhas.filter((c) => c.receitaInformada).reduce((s, c) => s + c.invested, 0);

  return {
    ...soma,
    prints,
    semRetorno: soma.invested - comRetorno,
    roas: roasDoTotal(soma.invested, comRetorno, soma.revenue).roas,
    acos: soma.revenue > 0 ? comRetorno / soma.revenue : null,
    // custo por clique só de quem informou cliques: o lançado à mão sem
    // clique dividia R$ 2.500 por 300 cliques de outra campanha
    cpc: soma.clicks > 0 ? campanhas.filter((c) => c.clicks > 0).reduce((s, c) => s + c.invested, 0) / soma.clicks : null,
    ctr: prints > 0 ? soma.clicks / prints : null,
    conversao: soma.clicks > 0 ? soma.orders / soma.clicks : null,
  };
}
