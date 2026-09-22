import { strict as assert } from "node:assert";
import { test } from "node:test";
import { conquistasDoMes, nivelDe, sequenciaDeDias } from "./gamificacao.ts";

test("nível e quanto falta para o próximo", () => {
  assert.deepEqual(nivelDe(0), { numero: 1, nome: "Iniciante", faltam: 100, proximoNome: "Aprendiz", progresso: 0 });
  const n = nivelDe(310);
  assert.equal(n.nome, "Operador");
  assert.equal(n.faltam, 190);
  assert.equal(n.progresso.toFixed(2), "0.24");
  assert.equal(nivelDe(9999).faltam, null);
});

test("sequência de dias conta de hoje, ou de ontem se hoje ainda não entregou", () => {
  assert.equal(sequenciaDeDias(["2026-09-22", "2026-09-21", "2026-09-20"], "2026-09-22"), 3);
  assert.equal(sequenciaDeDias(["2026-09-21", "2026-09-20"], "2026-09-22"), 2);
  assert.equal(sequenciaDeDias(["2026-09-19"], "2026-09-22"), 0);
  assert.equal(sequenciaDeDias([], "2026-09-22"), 0);
});

test("conquistas do mês", () => {
  const nada = conquistasDoMes({ aprovadas: 0, noPrazo: 0, comPrazo: 0, retrabalho: 0, posicao: 1, sequencia: 0 });
  // 1º lugar sem nenhuma aprovada não é conquista
  assert.equal(nada.filter((c) => c.ganhou).length, 0);
  const bom = conquistasDoMes({ aprovadas: 10, noPrazo: 9, comPrazo: 10, retrabalho: 0, posicao: 1, sequencia: 5 });
  assert.equal(bom.filter((c) => c.ganhou).length, 6);
});
