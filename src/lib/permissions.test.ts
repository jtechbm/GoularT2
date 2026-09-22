import { strict as assert } from "node:assert";
import { test } from "node:test";
import { can, gravarPermissoes, permissoesGravadas, permissoesPadrao } from "./permissions.ts";

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

test("permissão criada depois de salvar usa o padrão; o que foi escolhido continua", () => {
  // lista salva antes das permissões de tela, sem "ver a carteira inteira"
  const antigo = JSON.stringify(["clientes.gerenciar", "financeiro"]);
  const gestor = permissoesGravadas("gestor", antigo);
  assert.equal(gestor.includes("clientes.ver"), true); // tela nova: padrão do gestor
  assert.equal(gestor.includes("carteira.completa"), false); // escolha de quem salvou
  const membro = permissoesGravadas("membro", "[]");
  assert.equal(membro.includes("clientes.ver"), false); // padrão do membro: sem telas
  // salvo no formato novo, o que não está marcado não volta
  assert.equal(permissoesGravadas("gestor", gravarPermissoes(["financeiro"])).includes("clientes.ver"), false);
});
