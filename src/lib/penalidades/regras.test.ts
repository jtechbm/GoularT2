import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  avaliarIndicador,
  avaliarPreco,
  avisoEhAlerta,
  compararReputacao,
  nivelEfetivo,
  posicaoNivel,
  severidadeDoNivel,
} from "./regras.ts";

/* ----------------------------- reputação (ML) ----------------------------- */

test("posição do nível e severidade por cor", () => {
  assert.equal(posicaoNivel("1_red"), 1);
  assert.equal(posicaoNivel("5_green"), 5);
  assert.equal(posicaoNivel(null), null);
  assert.equal(posicaoNivel("laranja"), null);

  assert.equal(severidadeDoNivel("1_red"), "critico");
  assert.equal(severidadeDoNivel("3_yellow"), "atencao");
  assert.equal(severidadeDoNivel("5_green"), "informativo");
});

test("o nível que vale é o real, não o exibido na proteção do Decola", () => {
  assert.equal(nivelEfetivo({ level_id: "5_green", real_level: "1_red" }), "1_red");
  assert.equal(nivelEfetivo({ level_id: "5_green" }), "5_green");
});

test("primeira leitura ruim avisa sem esperar piorar", () => {
  assert.equal(compararReputacao(null, "3_yellow").tipo, "primeira_leitura_ruim");
  assert.equal(compararReputacao(null, "5_green").tipo, "primeira_leitura_ok");
  assert.equal(compararReputacao("5_green", "3_yellow").tipo, "piorou");
  assert.equal(compararReputacao("3_yellow", "5_green").tipo, "melhorou");
  assert.equal(compararReputacao("5_green", "5_green").tipo, "igual");
});

test("aviso oficial: alerta de verdade, e a negação explícita que não é", () => {
  assert.equal(avisoEhAlerta({ category: "ALERT", title: "qualquer coisa" }), true);
  assert.equal(avisoEhAlerta({ category: "NEW", title: "Seu anúncio foi bloqueado" }), true);
  assert.equal(avisoEhAlerta({ category: "NEW", title: "Novidade na plataforma" }), false);
  // o aviso da greve dos Correios diz que o atraso NÃO afeta a reputação
  assert.equal(
    avisoEhAlerta({ category: "NEW", title: "Atrasos não vão afetar sua reputação" }),
    false,
  );
});

/* -------------------------- indicadores (Shopee) -------------------------- */

function ind(nome: string, atual: number | null, alvo: number | null, comparador: string | null, unidade = 2) {
  return { nome, atual, anterior: null, alvo, comparador, unidade };
}

test("indicador dentro e fora do alvo da própria Shopee", () => {
  // atraso no envio: alvo é ficar abaixo de 5%
  assert.equal(avaliarIndicador(ind("late_shipment_rate", 4.9, 5, "<")).fora, false);
  const fora = avaliarIndicador(ind("late_shipment_rate", 6.44, 5, "<"));
  assert.equal(fora.fora, true);
  assert.equal(fora.severidade, "atencao");
  assert.match(fora.texto, /Atraso no envio: 6,44% \(alvo < 5%\)/);

  // taxa de resposta: alvo é ficar ACIMA de 60%
  assert.equal(avaliarIndicador(ind("response_rate", 93.76, 60, ">=")).fora, false);
  assert.equal(avaliarIndicador(ind("response_rate", 40, 60, ">=")).fora, true);
});

test("passar do dobro do tolerado vira crítico", () => {
  assert.equal(avaliarIndicador(ind("late_shipment_rate", 9, 5, "<")).severidade, "atencao");
  assert.equal(avaliarIndicador(ind("late_shipment_rate", 11, 5, "<")).severidade, "critico");
  // do outro lado do comparador: cair para menos da metade do alvo
  assert.equal(avaliarIndicador(ind("response_rate", 25, 60, ">=")).severidade, "critico");
});

test("violação de conteúdo é crítica na primeira ocorrência", () => {
  for (const nome of ["severe_listing_violations", "prohibited_listings", "counterfeit_ip_infringement", "spam_listings"]) {
    const a = avaliarIndicador(ind(nome, 1, 0, "<=", 1));
    assert.equal(a.fora, true, nome);
    assert.equal(a.severidade, "critico", nome);
  }
});

test("indicador sem apuração não é zero e não vira alerta", () => {
  const a = avaliarIndicador(ind("prohibited_listings", null, 0, "<="));
  assert.equal(a.fora, false);
  assert.match(a.texto, /sem apuração no período/);
  // alvo ausente também não julga
  assert.equal(avaliarIndicador(ind("late_shipment_rate", 90, null, null)).fora, false);
});

/* ------------------------------ preço mudou ------------------------------- */

test("mudança de preço só vira aviso quando é mudança de verdade", () => {
  // 1% é ajuste de centavo
  assert.equal(avaliarPreco(100, 101).mudou, false);

  const subiu = avaliarPreco(100, 120);
  assert.equal(subiu.mudou, true);
  assert.equal(subiu.subiu, true);
  assert.match(subiu.texto, /De R\$ 100,00 para R\$ 120,00 \(alta de 20%\)/);

  const caiu = avaliarPreco(100, 80);
  assert.equal(caiu.mudou, true);
  assert.equal(caiu.subiu, false);
  assert.match(caiu.texto, /queda de 20%/);

  // sem preço anterior não há mudança a anunciar
  assert.equal(avaliarPreco(0, 50).mudou, false);
});
