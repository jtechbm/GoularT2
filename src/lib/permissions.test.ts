import { strict as assert } from "node:assert";
import { test } from "node:test";
import { can, permissoesGravadas, permissoesPadrao } from "./permissions.ts";

test("o admin tem tudo, mesmo que alguém grave outra coisa para ele", () => {
  assert.equal(can({ role: "admin", permissions: [] }, "equipe.gerenciar"), true);
  assert.equal(permissoesGravadas("admin", "[]").includes("equipe.gerenciar"), true);
});

test("a permissão gravada para o papel vale mais que o padrão", () => {
  const membro = permissoesGravadas("membro", JSON.stringify(["integracoes.sincronizar", "carteira.completa"]));
  assert.equal(can({ role: "membro", permissions: membro }, "carteira.completa"), true);
  const gestor = permissoesGravadas("gestor", JSON.stringify(["clientes.gerenciar"]));
  assert.equal(can({ role: "gestor", permissions: gestor }, "financeiro"), false);
});

test("sem nada gravado, ou com texto estragado, vale o padrão; permissão que não existe é ignorada", () => {
  assert.deepEqual(permissoesGravadas("gestor", null), permissoesPadrao("gestor"));
  assert.deepEqual(permissoesGravadas("gestor", "{quebrado"), permissoesPadrao("gestor"));
  assert.deepEqual(permissoesGravadas("membro", JSON.stringify(["inventada", "financeiro"])), ["financeiro"]);
  // sessão antiga sem permissões carregadas: padrão do código
  assert.equal(can({ role: "membro" }, "financeiro"), false);
  assert.equal(can({ role: "gestor" }, "financeiro"), true);
});
