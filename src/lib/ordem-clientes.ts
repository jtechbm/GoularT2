import { variacaoMensal } from "./format.ts";

/**
 * Colunas pelas quais a lista de clientes pode ser ordenada.
 *
 * Tudo em ordem decrescente por padrão: quem clica em "Investido" quer ver
 * primeiro quem mais investe, e em "ROAS", quem mais retorna. Cliente sem o
 * dado (sem Ads, sem mês anterior) vai sempre para o fim, nos dois sentidos,
 * para não ocupar o topo com traços.
 */
export const ORDENS = {
  faturamento: "Faturamento",
  crescimento: "Crescimento",
  investido: "Investido em Ads",
  roas: "ROAS",
  pct_ads: "% em Ads",
  vendas30: "Vendas 30 dias",
  advertencias: "Advertências",
  nome: "Nome",
} as const;

export type Ordem = keyof typeof ORDENS;

export interface LinhaOrdenavel {
  name: string;
  revenue: number;
  prev_revenue: number;
  ads: number;
  ads_revenue: number;
  vendas30: number;
  advertencias: number;
}

/** Sentido padrão de cada coluna: só o nome começa de A a Z. */
const padraoAsc = (o: Ordem) => o === "nome";

/** `ordem=x` é o sentido padrão da coluna; `-x`, o invertido. */
export function lerOrdem(valor: string | undefined): { ordem: Ordem; asc: boolean } {
  const invertida = valor?.startsWith("-") ?? false;
  const chave = (invertida ? valor!.slice(1) : valor) as Ordem;
  const ordem: Ordem = chave && chave in ORDENS ? chave : "faturamento";
  return { ordem, asc: invertida ? !padraoAsc(ordem) : padraoAsc(ordem) };
}

/** Valor usado para ordenar; null = sem dado, vai para o fim. */
export function valorDaOrdem(l: LinhaOrdenavel, ordem: Ordem): number | string | null {
  switch (ordem) {
    case "faturamento":
      return l.revenue;
    case "crescimento":
      return variacaoMensal(l.revenue, l.prev_revenue);
    case "investido":
      return l.ads || null;
    case "roas":
      return l.ads ? l.ads_revenue / l.ads : null;
    case "pct_ads":
      return l.ads && l.revenue ? l.ads / l.revenue : null;
    case "vendas30":
      return l.vendas30;
    case "advertencias":
      return l.advertencias;
    case "nome":
      return l.name.toLowerCase();
  }
}

export function ordenarClientes<T extends LinhaOrdenavel>(linhas: T[], ordem: Ordem, asc: boolean): T[] {
  return [...linhas].sort((a, b) => {
    const va = valorDaOrdem(a, ordem);
    const vb = valorDaOrdem(b, ordem);
    if (va === null && vb === null) return a.name.localeCompare(b.name);
    if (va === null) return 1;
    if (vb === null) return -1;
    const c = typeof va === "string" ? va.localeCompare(vb as string) : va - (vb as number);
    return (asc ? c : -c) || a.name.localeCompare(b.name);
  });
}

/** Valor do parâmetro `ordem` ao clicar numa coluna: a mesma coluna inverte. */
export function proximaOrdem(atual: { ordem: Ordem; asc: boolean }, coluna: Ordem): string {
  const noPadrao = atual.asc === padraoAsc(atual.ordem);
  return atual.ordem === coluna && noPadrao ? `-${coluna}` : coluna;
}
