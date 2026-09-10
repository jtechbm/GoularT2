import type { AdsEntry } from "./types.ts";

/**
 * Métricas derivadas de uma campanha.
 *
 * Todas as divisões guardam a mesma regra: sem denominador, o resultado é
 * null, não zero. ACOS zero quer dizer "gastou nada e vendeu", que é
 * ótimo; ACOS indefinido quer dizer "não vendeu nada", que é o oposto.
 * Confundir os dois faria a pior campanha da conta parecer a melhor.
 */
export interface CampanhaAnalisada {
  id: string;
  nome: string;
  marketplace: string;
  clientId: string;
  clientName: string;
  automatica: boolean;
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
  return {
    id: e.id,
    nome: e.campaign ?? "sem nome",
    marketplace: e.marketplace,
    clientId: e.client_id,
    clientName: e.client_name ?? "",
    automatica: e.source === "api",
    invested: e.invested,
    revenue: e.revenue,
    clicks: e.clicks,
    orders: e.orders,
    roas: e.invested > 0 ? e.revenue / e.invested : null,
    acos: e.revenue > 0 ? e.invested / e.revenue : null,
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
    .filter((c) => c.invested > 0)
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

  return {
    ...soma,
    prints,
    roas: soma.invested > 0 ? soma.revenue / soma.invested : null,
    acos: soma.revenue > 0 ? soma.invested / soma.revenue : null,
    cpc: soma.clicks > 0 ? soma.invested / soma.clicks : null,
    ctr: prints > 0 ? soma.clicks / prints : null,
    conversao: soma.clicks > 0 ? soma.orders / soma.clicks : null,
  };
}
