import { test } from "node:test";
import assert from "node:assert/strict";
import { lerOrdem, ordenarClientes, proximaOrdem } from "./ordem-clientes.ts";

const linha = (name: string, x: Partial<{ revenue: number; prev_revenue: number; ads: number; ads_revenue: number }>) => ({
  name,
  revenue: 0,
  prev_revenue: 0,
  ads: 0,
  ads_revenue: 0,
  vendas30: 0,
  advertencias: 0,
  ...x,
});

test("ROAS ordena do maior para o menor e manda quem não anuncia para o fim", () => {
  const linhas = [
    linha("sem ads", { revenue: 900 }),
    linha("roas 2", { ads: 100, ads_revenue: 200 }),
    linha("roas 8", { ads: 100, ads_revenue: 800 }),
  ];
  const { ordem, asc } = lerOrdem("roas");
  assert.deepEqual(ordenarClientes(linhas, ordem, asc).map((l) => l.name), ["roas 8", "roas 2", "sem ads"]);
  // invertido, quem não anuncia continua no fim
  const inv = lerOrdem("-roas");
  assert.deepEqual(ordenarClientes(linhas, inv.ordem, inv.asc).map((l) => l.name), ["roas 2", "roas 8", "sem ads"]);
});

test("clicar na mesma coluna inverte; clicar em outra volta ao padrão", () => {
  assert.equal(proximaOrdem(lerOrdem("investido"), "investido"), "-investido");
  assert.equal(proximaOrdem(lerOrdem("-investido"), "investido"), "investido");
  assert.equal(proximaOrdem(lerOrdem("investido"), "roas"), "roas");
  assert.deepEqual(lerOrdem("nome"), { ordem: "nome", asc: true });
  assert.deepEqual(lerOrdem(undefined), { ordem: "faturamento", asc: false });
  assert.deepEqual(lerOrdem("inexistente"), { ordem: "faturamento", asc: false });
});
