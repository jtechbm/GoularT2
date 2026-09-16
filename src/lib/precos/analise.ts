/**
 * Régua de preços: a parte que só faz conta.
 *
 * Este arquivo não fala com banco, com marketplace nem com modelo de
 * linguagem. A coleta muda conforme o que cada plataforma libera; a conta é
 * sempre a mesma. A fronteira entre as duas é o tipo ProdutoConcorrente:
 * fonte nova só precisa produzir uma lista disso.
 *
 * É também o único arquivo com teste unitário (analise.test.ts), justamente
 * porque é o único que dá para testar sem rede.
 */

export type ProdutoConcorrente = {
  /** id do anúncio na plataforma; quando a fonte não dá, o próprio link serve */
  idExterno: string;
  vendedor?: string | null;
  titulo: string;
  /** já convertido para real */
  preco: number;
  url?: string | null;
  /** o texto de onde o preço foi lido — só existe quando veio de busca na web */
  trechoOrigem?: string | null;
};

export interface AnalisePrecos {
  mediana: number;
  mediaAparada: number;
  minimo: number;
  maximo: number;
  total: number;
  /** a mesma lista recebida, do mais barato ao mais caro */
  ordenados: ProdutoConcorrente[];
}

export function mediana(valores: number[]): number {
  if (!valores.length) return 0;
  const v = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(v.length / 2);
  return v.length % 2 ? v[meio] : (v[meio - 1] + v[meio]) / 2;
}

/**
 * Média do miolo: descarta 10% de cada ponta e tira a média do que sobrou.
 *
 * Busca por palavra-chave arrasta lixo. Numa busca por "cabo USB-C" entram a
 * capinha de R$ 5 e o kit profissional de R$ 400 no meio dos cabos, e a média
 * simples fica inútil. Com poucos itens o corte de 10% arredonda para zero e
 * a aparada viraria média simples de novo — nesse caso devolvemos a mediana,
 * que já é robusta a outlier.
 */
export function mediaAparada(valores: number[]): number {
  if (!valores.length) return 0;
  const v = [...valores].sort((a, b) => a - b);
  const corte = Math.floor(v.length * 0.1);
  if (corte === 0) return mediana(v);
  const miolo = v.slice(corte, v.length - corte);
  return miolo.reduce((s, n) => s + n, 0) / miolo.length;
}

/** Lista vazia devolve zeros, não erro: "nenhum concorrente" é resposta, não falha. */
export function analisarPrecos(produtos: ProdutoConcorrente[]): AnalisePrecos {
  const ordenados = [...produtos].sort((a, b) => a.preco - b.preco);
  const precos = ordenados.map((p) => p.preco);
  return {
    mediana: mediana(precos),
    mediaAparada: mediaAparada(precos),
    minimo: precos[0] ?? 0,
    maximo: precos[precos.length - 1] ?? 0,
    total: precos.length,
    ordenados,
  };
}

/**
 * Preço da Shopee vem multiplicado por 100.000.
 *
 * R$ 50,00 chega como 5000000. O erro passa despercebido porque nada quebra:
 * vira só um preço cem mil vezes maior. Por isso a divisão mora aqui, com
 * nome, em vez de solta no meio da importação.
 */
export function precoDaShopee(bruto: number): number {
  return bruto / 100_000;
}

/** Aceita "1.234,56", "1234,56", "1234.56" e "1234". */
function paraNumero(texto: string): number {
  if (texto.includes(",")) return Number(texto.replace(/\./g, "").replace(",", "."));
  return Number(texto);
}

/** Todos os números de um trecho de texto, no formato brasileiro ou não. */
export function numerosDoTrecho(trecho: string): number[] {
  const achados = trecho.match(/\d{1,3}(?:\.\d{3})*,\d{2}|\d+[.,]\d{2}|\d+/g) ?? [];
  return achados.map(paraNumero).filter((n) => Number.isFinite(n));
}

/**
 * O preço informado aparece mesmo no texto de onde o modelo disse ter lido?
 *
 * Sem esta conferência, todo o resto é fé: o modelo é obrigado a colar o
 * trecho literal, e aqui o código verifica. Tolerância de um centavo, para
 * arredondamento. Não conferiu, descarta.
 */
export function precoConfere(preco: number, trecho: string | null | undefined): boolean {
  if (!trecho || !trecho.trim()) return false;
  // a comparação é em centavos inteiros: 56,98 contra 56,99 dá 0,010000000005
  // em ponto flutuante, e um "<= 0.01" direto reprovaria o arredondamento
  const centavos = Math.round(preco * 100);
  return numerosDoTrecho(trecho).some((n) => Math.abs(Math.round(n * 100) - centavos) <= 1);
}

/** Para uma mediana, uma dúzia de anúncios distintos já basta. */
export const TETO_ANUNCIOS = 12;

/**
 * Tira repetição e corta no teto.
 *
 * Num teste real o modelo devolveu 199 entradas que eram os mesmos 10
 * anúncios vinte vezes. Sem esta guarda a repetição entra no banco e enviesa
 * a mediana, que passa a medir a insistência do modelo, não o mercado.
 */
export function dedupe(produtos: ProdutoConcorrente[]): ProdutoConcorrente[] {
  const vistos = new Set<string>();
  const saida: ProdutoConcorrente[] = [];
  for (const p of produtos) {
    const chave = `${p.url ?? ""}|${p.titulo.trim().toLowerCase()}|${p.preco.toFixed(2)}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    saida.push(p);
  }
  return saida.slice(0, TETO_ANUNCIOS);
}

/** Quanto o preço está acima (positivo) ou abaixo (negativo) da referência, em %. */
export function diferencaPct(preco: number, referencia: number): number {
  if (!referencia) return 0;
  return ((preco - referencia) / referencia) * 100;
}
