import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  concentracaoTopDias,
  diasSemVenda,
  evidenciaConfere,
  evidenciaConfereNasLinhas,
  linhasDoDossie,
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
    notaDaLoja: null,
    indicadores: [],
    sinais: { semPromocao: 0, rebaixados: 0, barrados: 0, precoMudado: 0 },
    pendencias: [],
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

test("indicador fora do alvo entra no texto e na contagem do cliente", () => {
  const d = montarDossie(
    entrada({
      lojas: [
        loja("Shopee", {
          notaDaLoja: 3,
          indicadores: [
            { nome: "late_shipment_rate", atual: 6.44, anterior: 0.6, alvo: 5, comparador: "<", unidade: 2 },
            { nome: "response_rate", atual: 93.76, anterior: 93.5, alvo: 60, comparador: ">=", unidade: 2 },
          ],
          sinais: { semPromocao: 14, rebaixados: 0, barrados: 3, precoMudado: 2 },
        }),
      ],
    }),
  );

  assert.equal(d.derivado.indicadoresFora, 1);
  assert.equal(d.porLoja[0].derivado.indicadoresFora.length, 1);
  assert.equal(d.porLoja[0].derivado.indicadoresFora[0].nome, "late_shipment_rate");

  const texto = paraTexto(d);
  assert.match(texto, /Nota que o marketplace dá à loja: 3 de 5/);
  assert.match(texto, /INDICADORES FORA DO ALVO \(1\)/);
  assert.match(texto, /Atraso no envio: 6,44% \(alvo < 5%\)/);
  // o que está dentro do alvo também vai, para o modelo não chutar
  assert.match(texto, /Indicadores dentro do alvo: Taxa de respostas 93.76%/);
  assert.match(texto, /3 barrados pelo marketplace, 0 rebaixados na busca, 14 sem promoção, 2 com preço mexido/);
});

test("leitura bloqueada por permissão aparece como não medida", () => {
  const d = montarDossie(
    entrada({
      lojas: [loja("Mercado Livre", { pendencias: ["taxa de resposta e reclamações", "promoções ativas"] })],
    }),
  );
  const texto = paraTexto(d);
  assert.match(texto, /NÃO MEDIDO neste canal, por falta de permissão no app/);
  assert.match(texto, /ausência de alerta não é sinal de que está bom/);
});

test("canal que não lê promoção não inventa anúncio sem promoção", () => {
  const semLeitura = montarDossie(
    entrada({
      lojas: [
        loja("Mercado Livre", {
          sinais: { semPromocao: null, rebaixados: 0, barrados: 6, precoMudado: 0 },
        }),
      ],
    }),
  );
  assert.match(paraTexto(semLeitura), /promoção não lida neste canal/);

  const comLeitura = montarDossie(
    entrada({
      lojas: [loja("Shopee", { sinais: { semPromocao: 14, rebaixados: 0, barrados: 0, precoMudado: 3 } })],
    }),
  );
  assert.match(paraTexto(comLeitura), /14 sem promoção/);
});

test("penalidade informativa não entra na conta que o menu mostra", () => {
  const d = montarDossie(
    entrada({
      lojas: [
        loja("Shopee", {
          penalidades: [
            { severity: "critico", kind: "anuncio", titulo: "Anúncio banido", detectadaEm: "2026-09-17" },
            { severity: "atencao", kind: "atraso", titulo: "2 pedidos atrasados", detectadaEm: "2026-09-17" },
            { severity: "informativo", kind: "preco", titulo: "Preço caiu", detectadaEm: "2026-09-17" },
            { severity: "informativo", kind: "promocao", titulo: "14 sem promoção", detectadaEm: "2026-09-17" },
          ],
        }),
      ],
    }),
  );
  // o menu conta só o que pede ação; as informativas ficam à parte
  assert.equal(d.derivado.penalidadesAbertas, 2);
  assert.equal(d.derivado.penalidadesInformativas, 2);
});

const campanha = (invested: number, revenue: number) => ({
  nome: "Campanha",
  invested,
  revenue,
  clicks: 100,
  orders: 5,
  roas: revenue / invested,
  acos: invested / revenue,
});

test("cada linha com número ganha um id e uma fonte; título de seção não", () => {
  const d = montarDossie(
    entrada({ lojas: [loja("Shopee", { origem: { fechamento: "api", atualizadoEm: null, ads: "api" } })] }),
  );
  const linhas = linhasDoDossie(d);
  const canal = linhas.find((l) => l.texto.startsWith("=== CANAL"))!;
  assert.equal(canal.id, null);
  const doCanal = linhas.slice(linhas.indexOf(canal));
  const faturamento = doCanal.find((l) => l.texto.startsWith("Faturamento R$ 1.000,00"))!;
  assert.match(faturamento.id!, /^F\d+$/);
  assert.match(faturamento.fonte!, /Shopee · pedidos de 09\/2026 · lido pela integração/);
  assert.ok(paraTexto(d).includes(`[${faturamento.id}] Faturamento R$ 1.000,00`));
});

test("os ids das linhas não viram número citável", () => {
  const d = montarDossie(entrada());
  // F12 não é o número 12
  assert.equal(numerosDoDossie(d).includes(12), false);
  assert.equal(evidenciaConfere("ver [F12]", numerosDoDossie(d)), false);
});

test("Ads que o marketplace não deixa ler aparece como NÃO MEDIDO, não como zero", () => {
  const d = montarDossie(
    entrada({ lojas: [loja("Shopee", { origem: { fechamento: "api", atualizadoEm: null, ads: "nao_medido" } })] }),
  );
  const texto = paraTexto(d);
  assert.match(texto, /Anúncios pagos: NÃO MEDIDO neste canal/);
  assert.doesNotMatch(texto, /nenhum investimento no mês neste canal/);
  assert.equal(d.porLoja[0].derivado.adsNaoMedido, true);
});

test("ROAS, % do faturamento e comparação com o mês anterior", () => {
  const d = montarDossie(
    entrada({
      lojas: [
        loja("Mercado Livre", {
          atual: mes(10000),
          campanhas: [campanha(500, 2500)],
          adsAnterior: { invested: 400, revenue: 1600 },
        }),
        loja("Shopee", { atual: mes(10000), origem: { fechamento: "api", atualizadoEm: null, ads: "nao_medido" } }),
      ],
    }),
  );
  const ads = d.porLoja[0].derivado.ads!;
  assert.equal(ads.pctFaturamento, 0.05);
  assert.equal(ads.roas, 5);
  assert.equal(ads.roasAnterior, 4);
  assert.equal(ads.variacaoInvestido, 0.25);
  // total: 500 sobre 20.000, e avisa que falta a Shopee
  assert.equal(d.derivado.ads!.pctFaturamento, 0.025);
  assert.equal(d.derivado.ads!.incompleto, true);
  assert.match(paraTexto(d), /investido R\$ 500,00 \(5% do faturamento do canal\)/);
  assert.match(paraTexto(d), /o investimento variou 25%/);
});

test("a evidência precisa bater com a linha citada, não com qualquer linha", () => {
  const d = montarDossie(entrada({ lojas: [loja("Shopee", { campanhas: [campanha(300, 900)] })] }));
  const linhas = linhasDoDossie(d);
  const ads = linhas.filter((l) => l.texto.startsWith("Anúncios pagos"));
  const fat = linhas.filter((l) => l.texto.startsWith("Faturamento R$"));
  assert.equal(evidenciaConfereNasLinhas("investiu R$ 300,00", ads), true);
  // R$ 300 existe no dossiê, mas não na linha de faturamento
  assert.equal(evidenciaConfereNasLinhas("investiu R$ 300,00", fat), false);
  assert.equal(evidenciaConfereNasLinhas("investiu R$ 300,00", []), false);
});
