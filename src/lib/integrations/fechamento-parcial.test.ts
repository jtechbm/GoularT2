import { strict as assert } from "node:assert";
import { test } from "node:test";
import { manterFechamentoAnterior } from "./sincronizar-conta.ts";
import { avisoRecarga, resumirAds, analisarCampanha } from "../ads-analise.ts";

const linha = (x: Record<string, unknown>) =>
  ({
    id: "x", client_id: "c", marketplace: "shopee", campaign: null,
    period_start: "2026-09-01", period_end: "2026-09-30",
    invested: 0, revenue: 0, clicks: 0, orders: 0, source: "api", ...x,
  }) as never;

test("mês lido inteiro sempre grava", () => {
  assert.equal(manterFechamentoAnterior(null, false), false);
  assert.equal(manterFechamentoAnterior({ partial: 0 }, false), false);
  assert.equal(manterFechamentoAnterior({ partial: 1 }, false), false);
});

test("mês pela metade grava quando não há nada melhor", () => {
  // a CONFORT LAR tinha 2.544 pedidos de setembro lidos e mostrava R$ 0
  // porque a listagem do mês não fechava: sem fechamento gravado, o parcial
  // entra e a tela passa a mostrar o piso em vez de zero
  assert.equal(manterFechamentoAnterior(null, true), false);
  assert.equal(manterFechamentoAnterior({ partial: 1 }, true), false);
});

test("mês pela metade não rebaixa um fechamento que veio inteiro", () => {
  assert.equal(manterFechamentoAnterior({ partial: 0 }, true), true);
});

test("recarga da Shopee é anunciada como carteira, não como gasto", () => {
  assert.equal(avisoRecarga(0, 1000), null);
  const tudo = avisoRecarga(1300, 1300);
  assert.ok(tudo?.startsWith("É recarga de crédito da Shopee"));
  assert.ok(tudo?.includes("não o que o anúncio gastou"));
  // parte recarga, parte gasto medido do Mercado Livre
  const parte = avisoRecarga(1300, 2500);
  assert.ok(parte?.includes("R$"));
  assert.ok(parte?.includes("são recarga de crédito"));
});

test("o resumo separa quanto do investido é recarga", () => {
  const campanhas = [
    analisarCampanha(linha({ external_id: "recargas-shopee-ads", invested: 1300 })),
    analisarCampanha(linha({ marketplace: "mercado_livre", invested: 200, revenue: 1800, orders: 9 })),
  ];
  const r = resumirAds(campanhas);
  assert.equal(r.invested, 1500);
  assert.equal(r.recargas, 1300);
  // a recarga não informa retorno, então fica fora do ROAS do total
  assert.equal(r.semRetorno, 1300);
});
