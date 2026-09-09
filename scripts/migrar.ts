/**
 * Cria (ou atualiza) o esquema do GoularT no Postgres apontado por DATABASE_URL.
 * É idempotente: rodar de novo não apaga nada.
 *
 *   npm run migrar
 *   npm run migrar -- --limpar   apaga TODAS as linhas antes de recriar o esquema
 */
import { exec, all, closePool } from "../src/lib/db.ts";
import { SCHEMA, TABLES } from "../src/lib/schema.ts";

const limpar = process.argv.includes("--limpar");

const alvo = (process.env.DATABASE_URL ?? "").replace(/:\/\/([^:]+):[^@]*@/, "://$1:***@");
console.log(`Aplicando esquema em ${alvo || "(DATABASE_URL não definida)"}\n`);

await exec(SCHEMA);
console.log("Esquema aplicado.");

if (limpar && process.env.PERMITIR_LIMPAR !== "sim") {
  console.error("\n--limpar apaga TODAS as linhas do banco apontado acima.");
  console.error("Se é isso mesmo, rode com PERMITIR_LIMPAR=sim");
  await closePool();
  process.exit(1);
}

if (limpar) {
  for (const t of TABLES) await exec(`DELETE FROM ${t}`);
  console.log("Todas as tabelas foram esvaziadas.");
}

const contagens = await all<{ tabela: string; linhas: number }>(
  TABLES.map((t) => `SELECT '${t}' AS tabela, COUNT(*) AS linhas FROM ${t}`).join(" UNION ALL "),
);

console.log("\nTabela                 linhas");
for (const c of [...contagens].sort((a, b) => a.tabela.localeCompare(b.tabela))) {
  console.log(`  ${c.tabela.padEnd(22)}${c.linhas}`);
}

await closePool();
