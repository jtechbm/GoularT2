/**
 * Sincroniza pela linha de comando as contas de marketplace já conectadas.
 *
 *   npm run sincronizar                    todas as contas conectadas, mês atual
 *   npm run sincronizar -- 2026-08         mês específico
 *   npm run sincronizar -- --diagnostico   só inspeciona os tokens, não grava
 *
 * Usa o mesmo syncAccount da aplicação: nada de lógica duplicada aqui.
 */
import { all, closePool } from "../src/lib/db.ts";
import { decryptJSON } from "../src/lib/crypto.ts";
import { adapterFor, syncAccount } from "../src/lib/integrations/sincronizar-conta.ts";
import type { StoredCredentials } from "../src/lib/integrations/types.ts";

const args = process.argv.slice(2);
const soDiagnostico = args.includes("--diagnostico");
const refMonth = args.find((a) => /^\d{4}-\d{2}$/.test(a)) ?? new Date().toISOString().slice(0, 7);

const contas = await all<{
  id: string;
  client_name: string;
  marketplace: string;
  credentials: string | null;
}>(
  `SELECT cm.id, cl.name AS client_name, cm.marketplace, cm.credentials
     FROM client_marketplaces cm JOIN clients cl ON cl.id = cm.client_id
    WHERE cm.status = 'conectado' AND cm.credentials IS NOT NULL
    ORDER BY lower(cl.name)`,
);

if (!contas.length) {
  console.log("Nenhuma conta conectada. Peça acesso ao lojista primeiro.");
  await closePool();
  process.exit(0);
}

console.log(`Mês de referência: ${refMonth}${soDiagnostico ? "  (diagnóstico — nada será gravado)" : ""}\n`);

for (const conta of contas) {
  const adapter = adapterFor(conta.marketplace);
  console.log(`${conta.client_name} · ${adapter.label}`);

  const creds = decryptJSON<StoredCredentials>(conta.credentials);
  if (!creds) {
    console.log("  não consegui decifrar as credenciais — GOULART_SESSION_SECRET diferente do que gravou\n");
    continue;
  }

  console.log(`  access_token   ${creds.access_token ? "presente" : "AUSENTE"}`);
  console.log(
    `  refresh_token  ${creds.refresh_token ? "presente" : "AUSENTE — a conexão morre quando o token expirar"}`,
  );
  if (creds.expires_at) {
    const restam = Math.round((creds.expires_at - Date.now()) / 60000);
    console.log(`  validade       ${restam > 0 ? `${restam} min restantes` : `expirado há ${-restam} min`}`);
  }

  if (soDiagnostico) {
    console.log("");
    continue;
  }

  const saida = await syncAccount(conta.id, refMonth, null);
  console.log(`  ${saida.ok ? "ok" : "FALHOU"}: ${saida.message}\n`);
}

await closePool();
