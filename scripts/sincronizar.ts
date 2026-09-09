/**
 * Sincroniza pela linha de comando as contas de marketplace já conectadas.
 *
 *   npm run sincronizar                 todas as contas conectadas, mês atual
 *   npm run sincronizar -- 2026-08      mês específico
 *   npm run sincronizar -- 2026-09 --diagnostico   só inspeciona, não grava
 *
 * Útil para conferir a integração sem depender da tela, e é a base do
 * agendamento automático mais adiante.
 */
import { all, one, run, closePool, id, now } from "../src/lib/db.ts";
import { decryptJSON, encryptJSON } from "../src/lib/crypto.ts";
import { mercadoLivre } from "../src/lib/integrations/mercadolivre.ts";
import { shopee } from "../src/lib/integrations/shopee.ts";
import type { MarketplaceAdapter, StoredCredentials } from "../src/lib/integrations/types.ts";

const ADAPTERS: Record<string, MarketplaceAdapter> = {
  mercado_livre: mercadoLivre,
  shopee,
};

const args = process.argv.slice(2);
const soDiagnostico = args.includes("--diagnostico");
const refMonth = args.find((a) => /^\d{4}-\d{2}$/.test(a)) ?? new Date().toISOString().slice(0, 7);

const contas = await all<{
  id: string;
  client_id: string;
  client_name: string;
  marketplace: string;
  external_id: string | null;
  credentials: string | null;
}>(
  `SELECT cm.id, cm.client_id, cl.name AS client_name, cm.marketplace, cm.external_id, cm.credentials
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
  const adapter = ADAPTERS[conta.marketplace];
  console.log(`${conta.client_name} · ${adapter?.label ?? conta.marketplace}`);

  if (!adapter) {
    console.log("  marketplace desconhecido\n");
    continue;
  }
  if (!adapter.isConfigured()) {
    console.log(`  faltam variáveis: ${adapter.requiredEnv.filter((v) => !process.env[v]).join(", ")}\n`);
    continue;
  }

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

  try {
    const resultado = await adapter.fetchMonth(
      {
        externalId: conta.external_id,
        credentials: creds,
        saveCredentials: async (next) => {
          await run("UPDATE client_marketplaces SET credentials = ? WHERE id = ?", encryptJSON(next), conta.id);
          console.log("  (token renovado e guardado)");
        },
      },
      refMonth,
    );

    const existente = await one<{ id: string; cogs: number; ads: number }>(
      "SELECT id, cogs, ads FROM finance_snapshots WHERE client_id=? AND marketplace=? AND ref_month=?",
      conta.client_id,
      conta.marketplace,
      refMonth,
    );
    const cogs = existente?.cogs ?? resultado.cogs;
    const ads = existente?.ads ?? resultado.ads;
    const lucro = resultado.revenue - resultado.fees - resultado.shipping - resultado.tax - ads - cogs;

    if (existente) {
      await run(
        `UPDATE finance_snapshots SET revenue=?, orders=?, units=?, fees=?, shipping=?, tax=?, cogs=?, ads=?,
                profit=?, source='api', updated_at=? WHERE id=?`,
        resultado.revenue, resultado.orders, resultado.units, resultado.fees, resultado.shipping,
        resultado.tax, cogs, ads, lucro, now(), existente.id,
      );
    } else {
      await run(
        `INSERT INTO finance_snapshots (id, client_id, marketplace, ref_month, revenue, orders, units, cogs, fees,
                                        shipping, tax, ads, profit, source, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'api',?)`,
        id(), conta.client_id, conta.marketplace, refMonth, resultado.revenue, resultado.orders,
        resultado.units, cogs, resultado.fees, resultado.shipping, resultado.tax, ads, lucro, now(),
      );
    }

    await run("UPDATE client_marketplaces SET last_sync_at = ?, last_error = NULL WHERE id = ?", now(), conta.id);
    await run(
      `INSERT INTO sync_logs (id, client_marketplace_id, marketplace, ref_month, status, message, created_at)
       VALUES (?,?,?,?,'ok',?,?)`,
      id(), conta.id, conta.marketplace, refMonth,
      `${resultado.orders} pedidos · ${resultado.revenue.toFixed(2)}`, now(),
    );

    const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    console.log(`  pedidos        ${resultado.orders}`);
    console.log(`  faturamento    ${brl(resultado.revenue)}`);
    console.log(`  taxas          ${brl(resultado.fees)}`);
    console.log(`  frete          ${brl(resultado.shipping)}`);
    console.log(`  impostos       ${brl(resultado.tax)}`);
    console.log(`  lucro gravado  ${brl(lucro)}\n`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await run("UPDATE client_marketplaces SET last_error = ? WHERE id = ?", msg, conta.id);
    await run(
      `INSERT INTO sync_logs (id, client_marketplace_id, marketplace, ref_month, status, message, created_at)
       VALUES (?,?,?,?,'erro',?,?)`,
      id(), conta.id, conta.marketplace, refMonth, msg, now(),
    );
    console.log(`  FALHOU: ${msg}\n`);
  }
}

await closePool();
