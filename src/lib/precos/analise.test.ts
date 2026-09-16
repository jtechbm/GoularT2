import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  analisarPrecos,
  dedupe,
  diferencaRelativa,
  mediaAparada,
  mediana,
  numerosDoTrecho,
  precoConfere,
  precoDaShopee,
  precoDoAnuncio,
  umPorVendedorEPreco,
  TETO_ANUNCIOS,
  type ProdutoConcorrente,
} from "./analise.ts";

function p(preco: number, extra: Partial<ProdutoConcorrente> = {}): ProdutoConcorrente {
  return { idExterno: `id-${preco}-${extra.titulo ?? ""}`, titulo: `Anúncio ${preco}`, preco, ...extra };
}

test("mediana com lista ímpar, par e vazia", () => {
  assert.equal(mediana([10, 30, 20]), 20);
  assert.equal(mediana([10, 20, 30, 40]), 25);
  assert.equal(mediana([]), 0);
});

test("média aparada descarta outlier das duas pontas", () => {
  // 10 itens: corta 1 de cada ponta, então o lixo de R$ 5 e o de R$ 400 saem
  const valores = [5, 50, 51, 52, 53, 54, 55, 56, 57, 400];
  assert.equal(mediaAparada(valores), 53.5);
  // a média simples, que não usamos, daria quase o dobro
  assert.ok(valores.reduce((s, n) => s + n, 0) / valores.length > 80);
});

test("média aparada com poucos itens cai para a mediana", () => {
  // 9 itens: 10% arredonda para zero e a aparada viraria média simples
  const valores = [5, 50, 51, 52, 53, 54, 55, 56, 400];
  assert.equal(mediaAparada(valores), mediana(valores));
  assert.equal(mediaAparada(valores), 53);
});

test("análise completa e lista vazia sem erro", () => {
  const r = analisarPrecos([p(30), p(10), p(20)]);
  assert.equal(r.minimo, 10);
  assert.equal(r.maximo, 30);
  assert.equal(r.total, 3);
  assert.deepEqual(r.ordenados.map((x) => x.preco), [10, 20, 30]);

  const vazio = analisarPrecos([]);
  assert.deepEqual(
    { ...vazio, ordenados: vazio.ordenados.length },
    { mediana: 0, mediaAparada: 0, minimo: 0, maximo: 0, total: 0, ordenados: 0 },
  );
});

test("preço da Shopee vem multiplicado por 100.000", () => {
  assert.equal(precoDaShopee(5_000_000), 50);
  assert.equal(precoDaShopee(4_940_000), 49.4);
});

test("a conversão só vale para a rota que reporta em micro-unidades", () => {
  assert.equal(precoDoAnuncio(5_000_000, true), 50);
  // get_model_list, conferido na loja real, já devolve reais
  assert.equal(precoDoAnuncio(99.9, false), 99.9);
});

test("números do trecho leem o formato brasileiro", () => {
  assert.deepEqual(numerosDoTrecho("R$ 1.234,56 à vista"), [1234.56]);
  assert.deepEqual(numerosDoTrecho("de R$ 56,99 por 49,40"), [56.99, 49.4]);
});

test("conferência do trecho: confere, não confere, vazio e milhar", () => {
  assert.equal(precoConfere(56.99, "Cabo USB-C 2m por R$ 56,99 no Pix"), true);
  // o clássico: o modelo leu o frete e chamou de preço
  assert.equal(precoConfere(8.39, "R$ 56,99 · Frete grátis R$ 8,39"), true);
  assert.equal(precoConfere(49.9, "Cabo USB-C 2m por R$ 56,99"), false);
  assert.equal(precoConfere(56.99, ""), false);
  assert.equal(precoConfere(56.99, null), false);
  assert.equal(precoConfere(1234.56, "Kit profissional R$ 1.234,56"), true);
  // um centavo de tolerância para arredondamento, nada além disso
  assert.equal(precoConfere(56.98, "R$ 56,99"), true);
  assert.equal(precoConfere(56.9, "R$ 56,99"), false);
});

test("dedupe tira o anúncio repetido e respeita o teto", () => {
  const repetido = p(50, { titulo: "Cabo USB-C", url: "https://loja/x" });
  assert.equal(dedupe([repetido, { ...repetido, idExterno: "outro" }, p(60)]).length, 2);

  const vinte = Array.from({ length: 20 }, (_, i) => p(10 + i, { titulo: `Anúncio ${i}`, url: `https://loja/${i}` }));
  assert.equal(dedupe(vinte).length, TETO_ANUNCIOS);
});

test("diferença sai em proporção, que é o que o pct() do projeto espera", () => {
  // seu preço 30,41 contra concorrente de 37,05: dezessete por cento abaixo
  assert.equal(Math.round(diferencaRelativa(30.41, 37.05) * 10000) / 10000, -0.1792);
  assert.equal(diferencaRelativa(120, 100), 0.2);
  // referência zero não vira divisão por zero
  assert.equal(diferencaRelativa(50, 0), 0);
});

test("o mesmo vendedor com o mesmo preço conta uma vez só", () => {
  const cores = ["Rosa", "Cinza", "Azul"].map((cor) =>
    p(120, { titulo: `Caminha ${cor}`, vendedor: "DOGCATSTORE" }),
  );
  const outro = p(120, { titulo: "Caminha", vendedor: "PETSHOP" });
  assert.equal(umPorVendedorEPreco([...cores, outro]).length, 2);
  // preço diferente do mesmo vendedor continua valendo: é oferta de verdade
  assert.equal(umPorVendedorEPreco([cores[0], p(99, { vendedor: "DOGCATSTORE" })]).length, 2);
  // sem vendedor não dá para agrupar, e não some ninguém
  assert.equal(umPorVendedorEPreco([p(50), p(50)]).length, 2);
});
