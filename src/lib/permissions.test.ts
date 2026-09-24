import { strict as assert } from "node:assert";
import { test } from "node:test";
import { can, gravarPermissoes, permissoesGravadas, permissoesPadrao } from "./permissions.ts";

test("o admin tem tudo, mesmo que alguém grave outra coisa para ele", () => {
  assert.equal(can({ role: "admin", permissions: [] }, "equipe.gerenciar"), true);
  assert.equal(permissoesGravadas("admin", "[]").includes("equipe.gerenciar"), true);
});

test("a permissão gravada para o papel vale mais que o padrão", () => {
  const membro = permissoesGravadas("membro", JSON.stringify(["integracoes.sincronizar", "financeiro"]));
  assert.equal(can({ role: "membro", permissions: membro }, "financeiro"), true);
  const gestor = permissoesGravadas("gestor", JSON.stringify(["clientes.gerenciar"]));
  assert.equal(can({ role: "gestor", permissions: gestor }, "financeiro"), false);
});

test("sem nada gravado, ou com texto estragado, vale o padrão; permissão que não existe é ignorada", () => {
  assert.deepEqual(permissoesGravadas("gestor", null), permissoesPadrao("gestor"));
  assert.deepEqual(permissoesGravadas("gestor", "{quebrado"), permissoesPadrao("gestor"));
  assert.deepEqual(permissoesGravadas("membro", JSON.stringify(["inventada", "financeiro"])), [
    "clientes.ver",
    "clientes.cadastrar",
    "financeiro",
  ]);
  // sessão antiga sem permissões carregadas: padrão do código
  assert.equal(can({ role: "membro" }, "financeiro"), false);
  // o financeiro da agência e as lojas do Kadu não são da equipe
  assert.equal(can({ role: "gestor" }, "financeiro"), false);
  assert.equal(can({ role: "gestor" }, "lojas.proprias"), false);
  // o financeiro das lojas dos clientes continua sendo trabalho dele
  assert.equal(can({ role: "gestor" }, "clientes.ver"), true);
  assert.equal(can({ role: "admin" }, "financeiro"), true);
});

test("permissão criada depois de salvar usa o padrão; o que foi escolhido continua", () => {
  const antigo = JSON.stringify(["clientes.gerenciar", "financeiro"]);
  const gestor = permissoesGravadas("gestor", antigo);
  assert.equal(gestor.includes("clientes.ver"), true); // tela nova: padrão do gestor
  const membro = permissoesGravadas("membro", "[]");
  assert.equal(membro.includes("clientes.ver"), true);
  // Abrir e cadastrar clientes são fixos mesmo quando o formato novo tenta tirá-los.
  const salvo = permissoesGravadas("gestor", gravarPermissoes(["financeiro"]));
  assert.equal(salvo.includes("clientes.ver"), true);
  assert.equal(salvo.includes("clientes.cadastrar"), true);
});

test("gestor e membro sempre podem abrir e cadastrar clientes", () => {
  for (const role of ["gestor", "membro"] as const) {
    assert.equal(can({ role, permissions: [] }, "clientes.ver"), true);
    assert.equal(can({ role, permissions: [] }, "clientes.cadastrar"), true);
  }
});
