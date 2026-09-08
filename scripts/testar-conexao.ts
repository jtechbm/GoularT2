/**
 * Diagnostica a conexão com o banco: separa problema de rede, de TLS,
 * de senha e de permissão. Nunca imprime a senha.
 *
 *   npm run testar-conexao
 */
import { all, one, closePool } from "../src/lib/db.ts";
import { TABLES } from "../src/lib/schema.ts";

const url = process.env.DATABASE_URL ?? "";
const partes = /^postgres(?:ql)?:\/\/([^:]+):([^@]*)@([^:]+):(\d+)\/(\w+)/.exec(url);

if (!partes) {
  console.error("DATABASE_URL ausente ou em formato inesperado no .env.");
  process.exit(1);
}

const [, usuario, senha, host, porta, banco] = partes;
const pooler = porta === "5432" ? "session pooler" : porta === "6543" ? "transaction pooler" : "porta fora do padrão";

console.log("Destino");
console.log(`  host    ${host}`);
console.log(`  porta   ${porta} (${pooler})`);
console.log(`  usuário ${usuario}`);
console.log(`  banco   ${banco}`);
console.log(`  senha   ${senha ? `preenchida (${senha.length} caracteres)` : "VAZIA"}`);

if (!senha || senha.includes("COLOQUE_A_SENHA")) {
  console.error("\nA senha ainda não foi preenchida no .env. Substitua o placeholder e rode de novo.");
  process.exit(1);
}

const inicio = Date.now();
try {
  const info = await one<{ versao: string; base: string; usuario: string; agora: string }>(
    "SELECT version() AS versao, current_database() AS base, current_user AS usuario, now()::text AS agora",
  );
  console.log(`\nConectado em ${Date.now() - inicio} ms`);
  console.log(`  ${info?.versao?.split(",")[0]}`);
  console.log(`  banco ${info?.base} · usuário ${info?.usuario}`);
  console.log(`  hora do servidor: ${info?.agora}`);

  const existentes = await all<{ table_name: string }>(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name",
  );
  const nomes = existentes.map((t) => t.table_name);
  const faltando = TABLES.filter((t) => !nomes.includes(t));

  console.log(`\nTabelas do GoularT: ${TABLES.length - faltando.length} de ${TABLES.length} presentes`);
  if (faltando.length) {
    console.log(`  faltando: ${faltando.join(", ")}`);
    console.log("  rode: npm run migrar");
  } else {
    const linhas = await all<{ tabela: string; linhas: number }>(
      TABLES.map((t) => `SELECT '${t}' AS tabela, COUNT(*) AS linhas FROM ${t}`).join(" UNION ALL "),
    );
    const comDados = linhas.filter((l) => l.linhas > 0);
    console.log(
      comDados.length
        ? `  com dados: ${comDados.map((l) => `${l.tabela}=${l.linhas}`).join(", ")}`
        : "  todas vazias",
    );
  }

  // escrita e leitura de verdade, sem deixar rastro
  await all("CREATE TEMP TABLE goulart_check (v text)");
  await all("INSERT INTO goulart_check VALUES (?)", "ok");
  const eco = await one<{ v: string }>("SELECT v FROM goulart_check");
  console.log(`\nEscrita e leitura: ${eco?.v === "ok" ? "ok" : "FALHOU"}`);
  console.log("Conexão validada.");
} catch (error) {
  const e = error as { code?: string; message: string };
  const explicacao: Record<string, string> = {
    "28P01": "senha incorreta para este usuário",
    "3D000": "o banco informado não existe",
    "28000": "usuário recusado (confira o formato postgres.PROJETO)",
    ENOTFOUND: "host não resolveu — confira o endereço do pooler",
    ETIMEDOUT: "sem resposta do host — rede ou firewall bloqueando a porta",
    ECONNREFUSED: "conexão recusada na porta",
    "42501": "usuário sem permissão para esta operação",
  };
  console.error(`\nFalhou: ${e.message}`);
  if (e.code) console.error(`  código ${e.code}${explicacao[e.code] ? ` — ${explicacao[e.code]}` : ""}`);
  process.exitCode = 1;
} finally {
  await closePool();
}
