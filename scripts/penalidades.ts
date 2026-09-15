/**
 * Verifica as penalidades das contas do Mercado Livre pela linha de comando.
 *
 *   npm run penalidades
 *
 * Usa o mesmo motor da tela e do agendamento diário.
 */
import { all, closePool } from "../src/lib/db.ts";
import { verificarPenalidadesML } from "../src/lib/penalidades/mercadolivre.ts";

const contas = await all<{ id: string; nome: string }>(
  `SELECT cm.id, c.name AS nome FROM client_marketplaces cm JOIN clients c ON c.id = cm.client_id
    WHERE cm.marketplace = 'mercado_livre' AND cm.status = 'conectado' AND cm.credentials IS NOT NULL
    ORDER BY lower(c.name)`,
);

if (!contas.length) console.log("Nenhuma conta do Mercado Livre conectada.");

for (const c of contas) {
  const r = await verificarPenalidadesML(c.id);
  console.log(`${c.nome}`);
  console.log(`  ${r.ok ? "ok" : "FALHOU"}: ${r.mensagem}`);
  console.log(`  permissão de anúncios: ${r.permissaoAnuncios}`);
}

await closePool();
