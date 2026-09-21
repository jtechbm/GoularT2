import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularDeadline, limiteDaTarefa, noPrazo, situacaoPrazo, textoPrazo } from "./prazo-tarefa.ts";

const agora = new Date("2026-09-21T15:00:00Z");

test("o prazo em horas começa quando a pessoa pega a tarefa", () => {
  assert.equal(calcularDeadline("2026-09-21T12:00:00Z", 24), "2026-09-22T12:00:00.000Z");
  assert.equal(calcularDeadline("2026-09-21T12:00:00Z", null), null);
});

test("o limite é o que vencer primeiro entre a data e o prazo em horas", () => {
  // data: fim do dia 21 em Brasília = 22/09 02:59:59Z; prazo em horas vence antes
  const t = { due_date: "2026-09-21", deadline_at: "2026-09-21T18:00:00Z" };
  assert.equal(limiteDaTarefa(t)!.toISOString(), "2026-09-21T18:00:00.000Z");
  assert.equal(limiteDaTarefa({ due_date: "2026-09-21" })!.toISOString(), "2026-09-22T02:59:59.000Z");
  assert.equal(limiteDaTarefa({ due_date: null, deadline_at: null }), null);
});

test("em aberto: no prazo, vence logo e atrasada", () => {
  const base = { status: "em_andamento", submitted_at: null, due_date: null, sla_hours: 24 };
  assert.equal(situacaoPrazo({ ...base, deadline_at: "2026-09-22T12:00:00Z" }, agora).estado, "no_prazo");
  // falta 3 h de um prazo de 24 h: último quarto
  assert.equal(situacaoPrazo({ ...base, deadline_at: "2026-09-21T18:00:00Z" }, agora).estado, "vence_logo");
  const atrasada = situacaoPrazo({ ...base, deadline_at: "2026-09-21T13:00:00Z" }, agora);
  assert.equal(atrasada.estado, "atrasada");
  assert.equal(textoPrazo(atrasada), "atrasada há 2 h");
});

test("entregar é enviar para revisão; a demora da revisão não conta", () => {
  const t = {
    status: "concluida",
    due_date: null,
    deadline_at: "2026-09-21T12:00:00Z",
    submitted_at: "2026-09-21T11:00:00Z",
    completed_at: "2026-09-23T11:00:00Z",
  };
  assert.equal(situacaoPrazo(t, agora).estado, "entregue_no_prazo");
  assert.equal(noPrazo(t), true);
  assert.equal(noPrazo({ ...t, submitted_at: "2026-09-21T17:00:00Z" }), false);
  assert.equal(textoPrazo(situacaoPrazo({ ...t, submitted_at: "2026-09-21T17:00:00Z" }, agora)), "entregue 5 h depois");
});

test("sem prazo nenhum não é atraso", () => {
  const s = situacaoPrazo({ status: "assumida", due_date: null, deadline_at: null, submitted_at: null }, agora);
  assert.equal(s.estado, "sem_prazo");
  assert.equal(noPrazo({ due_date: null, submitted_at: "2026-09-21T11:00:00Z" }), null);
});
