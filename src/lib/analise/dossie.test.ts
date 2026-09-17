import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  concentracaoTopDias,
  diasSemVenda,
  evidenciaConfere,
  montarDossie,
  numerosDoDossie,
  paraTexto,
  posicaoDePreco,
  recorteDeProdutos,
  type EntradaDossie,
  type LinhaMes,
  type LojaNoDossie,
  type ProdutoLinha,
} from "./dossie.ts";

function mes(revenue: number, extra: Partial<LinhaMes> = {}): LinhaMes {
  return { revenue, orders: 10, units: 10, profit: 0, fees: 0, shipping: 0, tax: 0, ads: 0, cogs: 0, ...extra };
}

function prod(preco: number, extra: Partial<ProdutoLinha> = {}): ProdutoLinha {
  return { titulo: `Anúncio ${preco}`, preco, status: "NORMAL", medianaMercado: null, concorrentes: 0, ...extra };
}

function loja(marketplace: string, extra: Partial<LojaNoDossie> = {}): LojaNoDossie {
  return {
    marketplace,
    apelido: null,
    statusConta: "conectado",
    atual: mes(1000, { orders: 20, profit: 200 }),
    anterior: mes(800, { orders: 16 }),
    dias: [],
    produtos: [],
    campanhas: [],
    penalidades: [],
    reputacao: null,
    ...extra,
  };
}

function entrada(extra: Partial<EntradaDossie> = {}): EntradaDossie {
  return {
    cliente: { nome: "Arnaldo", status: "ativo" },
    contrato: { tier: null, segment: null, mensalidade: null, comissaoPct: null, desde: null, estrategia: null },
    mes: "2026-09",
    lojas: [loja("Shopee")],
    metas: [],
    alertas: [],
    score: null,
    procedencia: "api",
    ...extra,
  };
}

test("concentração dos melhores dias separa mês de pico de mês parelho", () => {
  const pico = [
    { day: "2026-09-01", revenue: 900, orders: 9 },
    ...Array.from({ length: 10 }, (_, i) => ({ day: `2026-09-1${i}`, revenue: 10, orders: 1 })),
  ];
  // um dia sozinho carrega quase tudo
  assert.ok(concentracaoTopDias(pico) > 0.9);

  const parelho = Array.from({ length: 10 }, (_, i) => ({ day: `2026-09-0${i}`, revenue: 100, orders: 5 }));
  // dez dias iguais: cinco deles são metade
  assert.equal(concentracaoTopDias(parelho), 0.5);

  // período sem faturamento não vira divisão por zero
  assert.equal(concentracaoTopDias([{ day: "2026-09-01", revenue: 0, orders: 0 }]), 0);
  assert.equal(concentracaoTopDias([]), 0);
});

test("dias sem venda contam o total e a maior sequência seguida", () => {
  const dias = [
    { day: "2026-09-01", revenue: 100, orders: 2 },
    { day: "2026-09-02", revenue: 0, orders: 0 },
    { day: "2026-09-03", revenue: 0, orders: 0 },
    { day: "2026-09-04", revenue: 0, orders: 0 },
    { day: "2026-09-05", revenue: 50, orders: 1 },
    { day: "2026-09-06", revenue: 0, orders: 0 },
  ];
  assert.deepEqual(diasSemVenda(dias), { total: 4, maiorSequencia: 3 });

  // a ordem de entrada não importa: a sequência é calculada por data
  assert.deepEqual(diasSemVenda([...dias].reverse()), { total: 4, maiorSequencia: 3 });

  // dia com pedido mas faturamento zero (cancelamento) não conta como seco
  assert.deepEqual(diasSemVenda([{ day: "2026-09-01", revenue: 0, orders: 1 }]), { total: 0, maiorSequencia: 0 });
});

test("posição de preço separa acima, no mercado, abaixo e sem comparação", () => {
  const produtos = [
    prod(120, { medianaMercado: 100, concorrentes: 4 }), // 20% acima
    prod(102, { medianaMercado: 100, concorrentes: 3 }), // dentro da tolerância
    prod(80, { medianaMercado: 100, concorrentes: 5 }), // abaixo
    prod(50), // nunca foi comparado
    prod(60, { medianaMercado: 100, concorrentes: 0 }), // mediana sem concorrente não vale
  ];
  assert.deepEqual(posicaoDePreco(produtos), { acima: 1, dentro: 1, abaixo: 1, semComparacao: 2 });
});

test("o recorte leva os mais caros, os mais baratos e os comparados, sem repetir", () => {
  const produtos = Array.from({ length: 40 }, (_, i) => prod(10 + i));
  produtos.push(prod(999, { titulo: "Comparado", medianaMercado: 900, concorrentes: 3 }));

  const recorte = recorteDeProdutos(produtos);
  assert.ok(recorte.length <= 12);
  assert.ok(recorte.some((p) => p.preco === 999));
  assert.ok(recorte.some((p) => p.preco === 10));
  assert.equal(new Set(recorte.map((p) => `${p.titulo}|${p.preco}`)).size, recorte.length);
});

test("o total soma os canais e cada canal ganha a sua fatia", () => {
  const d = montarDossie(
    entrada({
      lojas: [
        loja("Mercado Livre", { atual: mes(3000, { orders: 30, profit: 600 }), anterior: mes(2000, { orders: 20 }) }),
        loja("Shopee", { atual: mes(1000, { orders: 20, profit: 200 }), anterior: mes(1000, { orders: 10 }) }),
      ],
    }),
  );

  assert.equal(d.total.atual.revenue, 4000);
  assert.equal(d.total.atual.orders, 50);
  assert.equal(d.derivado.margem, 0.2);
  assert.equal(d.derivado.ticket, 80);
  // 3.000 de 4.000 é 75% do faturamento do cliente
  assert.equal(d.porLoja[0].derivado.fatiaDoFaturamento, 0.75);
  assert.equal(d.porLoja[1].derivado.fatiaDoFaturamento, 0.25);
  // cada canal mantém a sua própria variação
  assert.equal(d.porLoja[0].derivado.variacaoFaturamento, 0.5);
  assert.equal(d.porLoja[1].derivado.variacaoFaturamento, 0);
});

test("cliente sem faturamento não estoura em divisão por zero", () => {
  const d = montarDossie(
    entrada({ lojas: [loja("Shopee", { atual: mes(0, { orders: 0 }), anterior: mes(0, { orders: 0 }) })] }),
  );
  assert.equal(d.derivado.variacaoFaturamento, 0);
  assert.equal(d.derivado.margem, 0);
  assert.equal(d.derivado.ticket, 0);
  assert.equal(d.porLoja[0].derivado.fatiaDoFaturamento, 0);
  assert.equal(d.porLoja[0].derivado.ads, null);
});

test("o texto traz uma seção por canal e afirma os números citáveis", () => {
  const d = montarDossie(
    entrada({
      lojas: [
        loja("Mercado Livre", { produtos: [prod(47)] }),
        loja("Shopee", { apelido: "Minas Decor Têxtil", produtos: [prod(19.62)] }),
      ],
    }),
  );
  const texto = paraTexto(d);

  assert.match(texto, /CLIENTE: Arnaldo — vende em Mercado Livre e Shopee/);
  assert.match(texto, /=== CANAL: MERCADO LIVRE ===/);
  assert.match(texto, /=== CANAL: SHOPEE \(Minas Decor Têxtil\) ===/);
  assert.match(texto, /Divisão por canal/);
  assert.match(texto, /2\.000,00/); // total dos dois canais

  const numeros = numerosDoDossie(d);
  assert.ok(numeros.includes(2000));
  assert.ok(numeros.includes(47));
});

test("sem mês anterior gravado o texto proíbe falar de crescimento", () => {
  const semAnterior = montarDossie(
    entrada({ lojas: [loja("Shopee", { anterior: mes(0, { orders: 0 }) })] }),
  );
  assert.equal(semAnterior.derivado.temAnterior, false);
  const texto = paraTexto(semAnterior);
  assert.match(texto, /NÃO existe mês anterior gravado/);

  const comAnterior = montarDossie(entrada());
  assert.equal(comAnterior.derivado.temAnterior, true);
  assert.match(paraTexto(comAnterior), /variação 25%/);
});

test("o texto diz o intervalo de dias que realmente tem dado", () => {
  const d = montarDossie(
    entrada({
      lojas: [
        loja("Shopee", {
          dias: [
            { day: "2026-09-10", revenue: 100, orders: 2 },
            { day: "2026-09-11", revenue: 0, orders: 0 },
          ],
        }),
      ],
    }),
  );
  // dia anterior à primeira sincronização não pode virar "dia sem venda"
  assert.match(paraTexto(d), /2 dias com dado \(2026-09-10 a 2026-09-11\)/);
});

test("canal sem anúncio importado não finge ter opinião de preço", () => {
  const d = montarDossie(entrada({ lojas: [loja("Shopee", { produtos: [] })] }));
  assert.match(paraTexto(d), /nenhum anúncio importado neste canal/);
});

test("evidência sem número, com número inventado e com número do dossiê", () => {
  const numeros = [1000, 47, 0.25, 20];

  assert.equal(evidenciaConfere("o faturamento caiu bastante", numeros), false);
  assert.equal(evidenciaConfere("", numeros), false);
  assert.equal(evidenciaConfere("faturamento de R$ 7.400,00", numeros), false);
  assert.equal(evidenciaConfere("faturamento de R$ 1.000,00 no mês", numeros), true);
  // arredondar 47,00 para 47 é escrita normal
  assert.equal(evidenciaConfere("o anúncio custa R$ 47", numeros), true);
  // 2% de tolerância: 1.015 passa, 1.100 não
  assert.equal(evidenciaConfere("cerca de R$ 1.015,00", numeros), true);
  assert.equal(evidenciaConfere("cerca de R$ 1.100,00", numeros), false);
});
