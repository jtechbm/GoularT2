import { strict as assert } from "node:assert";
import { test } from "node:test";
import { analisarCampanha, receitaInformada, resumirAds, roasDaTela, roasDoTotal, textoAds } from "./ads-analise.ts";

const linha = (x: Record<string, unknown>) =>
  ({ id: "x", client_id: "c", marketplace: "shopee", campaign: null, period_start: "2026-09-01", period_end: "2026-09-30",
     invested: 0, revenue: 0, clicks: 0, orders: 0, source: "manual", ...x }) as never;

test("lançado à mão sem retorno é 'não informado', não 'não vendeu'", () => {
  assert.equal(receitaInformada({ source: "manual", revenue: 0, orders: 0 }), false);
  assert.equal(receitaInformada({ source: "api", revenue: 0, orders: 0 }), true);
  assert.equal(receitaInformada({ source: "manual", revenue: 900, orders: 0 }), true);
  const c = analisarCampanha(linha({ invested: 2500 }));
  assert.equal(c.roas, null);
  assert.equal(c.receitaInformada, false);
});

test("sem retorno em quase todo o investido, não há ROAS do total; o custo por clique ignora quem não tem clique", () => {
  const r = resumirAds([
    analisarCampanha(linha({ invested: 2500 })),
    analisarCampanha(linha({ invested: 31.82, revenue: 165.89, clicks: 300, source: "api" })),
  ]);
  assert.equal(r.invested, 2531.82);
  assert.equal(r.semRetorno, 2500);
  // o 5,21x é de R$ 31,82: mostrar ao lado de R$ 2.531,82 enganava
  assert.equal(r.roas, null);
  assert.equal(r.cpc!.toFixed(2), "0.11");
});

test("recarga de crédito da carteira conta no investido e fica fora do ROAS", () => {
  const recarga = analisarCampanha(linha({ invested: 7900, source: "api", external_id: "recargas-shopee-ads" }));
  assert.equal(recarga.recarga, true);
  assert.equal(recarga.receitaInformada, false);
  assert.equal(recarga.roas, null);
  const r = resumirAds([recarga, analisarCampanha(linha({ invested: 31.82, revenue: 165.89, clicks: 300, source: "api" }))]);
  assert.equal(r.invested, 7931.82);
  assert.equal(r.roas, null);

});

test("ROAS do total só com 90% ou mais do investido informando vendas", () => {
  assert.equal(roasDoTotal(1000, 950, 4000).roas!.toFixed(2), "4.21");
  assert.equal(roasDoTotal(1000, 850, 4000).roas, null);
  assert.equal(roasDoTotal(0, 0, 0).roas, null);
});

test("Ads em % do faturamento, com a média de 3 meses e o ROAS só quando é real", () => {
  // Arnaldo: setembro e a média de jul–set, sem ROAS (a Shopee não informa a venda por anúncio)
  assert.equal(
    textoAds(7931.82, 203912.61, { ads: 30140, faturamento: 678921 }, roasDaTela(7931.82, 31.82, 165.89, 203912.61)),
    "3,9% do faturamento · média 3 meses 4,4% · ROAS 25,71x",
  );
  assert.equal(textoAds(31.82, 1688.89, null, roasDaTela(31.82, 31.82, 165.89, 1688.89)), "1,9% do faturamento · ROAS 5,21x");
});

test("ROAS sempre aparece: dos anúncios quando se sabe a venda, senão faturamento ÷ investido", () => {
  assert.deepEqual(roasDaTela(31.82, 31.82, 165.89, 1688.89)!.base, "anuncios");
  const shopee = roasDaTela(7900, 0, 0, 202224)!;
  assert.equal(shopee.base, "faturamento");
  assert.equal(shopee.valor.toFixed(1), "25.6");
  assert.equal(roasDaTela(0, 0, 0, 1000), null);
  assert.equal(textoAds(0, 50000, null, null), "nenhum investimento no mês");
});
