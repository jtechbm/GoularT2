/**
 * Verifica as penalidades de todas as lojas conectadas pela linha de comando.
 *
 *   npm run penalidades
 *
 * Usa o mesmo motor da tela e do agendamento diário.
 */
import { all, closePool } from "../src/lib/db.ts";
import { verificarPenalidadesML } from "../src/lib/penalidades/mercadolivre.ts";
import { verificarPenalidadesShopee } from "../src/lib/penalidades/shopee.ts";

const contas = await all<{ id: string; nome: string; marketplace: string }>(
  `SELECT cm.id, c.name AS nome, cm.marketplace FROM client_marketplaces cm JOIN clients c ON c.id = cm.client_id
    -- inclui quem está 'erro' pelo mesmo motivo da sincronização
    WHERE cm.status IN ('conectado', 'erro') AND cm.credentials IS NOT NULL
    ORDER BY lower(c.name), cm.marketplace`,
);

if (!contas.length) console.log("Nenhuma loja conectada.");

for (const c of contas) {
  console.log(`${c.nome} · ${c.marketplace}`);
  if (c.marketplace === "mercado_livre") {
    const r = await verificarPenalidadesML(c.id);
    console.log(`  ${r.ok ? "ok" : "FALHOU"}: ${r.mensagem}`);
    console.log(`  permissão de anúncios: ${r.permissaoAnuncios}`);
  } else {
    const r = await verificarPenalidadesShopee(c.id);
    console.log(`  ${r.ok ? "ok" : "FALHOU"}: ${r.mensagem}`);
    console.log(`  nota da loja: ${r.nota ?? "—"}`);
  }
}

await closePool();
