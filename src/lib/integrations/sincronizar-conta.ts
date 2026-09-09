import { id, now, one, run } from "../db.ts";
import { decryptJSON, encryptJSON } from "../crypto.ts";
import { mercadoLivre } from "./mercadolivre.ts";
import { shopee } from "./shopee.ts";
import { IntegrationError, type MarketplaceAdapter, type MonthlyResult, type StoredCredentials } from "./types.ts";

/**
 * Sincronização de uma conta, em um único lugar.
 *
 * Este módulo usa caminhos relativos e não importa "server-only" de propósito:
 * assim a aplicação e os scripts de linha de comando rodam exatamente o mesmo
 * código. Quando havia duas cópias, uma correção de precedência foi aplicada
 * só numa delas e o investimento em Ads era descartado silenciosamente pela
 * outra.
 */

export const ADAPTERS: Record<string, MarketplaceAdapter> = {
  mercado_livre: mercadoLivre,
  shopee,
};

export function adapterFor(marketplace: string): MarketplaceAdapter {
  const adapter = ADAPTERS[marketplace];
  if (!adapter) throw new IntegrationError(`Marketplace desconhecido: ${marketplace}`, "config");
  return adapter;
}

export function readCredentials(row: { credentials: string | null }): StoredCredentials | null {
  return decryptJSON<StoredCredentials>(row.credentials);
}

export async function writeCredentials(rowId: string, creds: StoredCredentials) {
  await run(
    "UPDATE client_marketplaces SET credentials = ?, status = 'conectado', last_error = NULL WHERE id = ?",
    encryptJSON(creds),
    rowId,
  );
}

async function log(
  rowId: string | null,
  marketplace: string,
  refMonth: string | null,
  status: string,
  message: string,
) {
  await run(
    `INSERT INTO sync_logs (id, client_marketplace_id, marketplace, ref_month, status, message, created_at)
     VALUES (?,?,?,?,?,?,?)`,
    id(),
    rowId,
    marketplace,
    refMonth,
    status,
    message,
    now(),
  );
}

export interface SyncOutcome {
  ok: boolean;
  status: "ok" | "erro";
  message: string;
  result?: MonthlyResult;
}

/**
 * Puxa o fechamento do mês e grava em finance_snapshots (source='api').
 *
 * Precedência dos campos que a API pode ou não trazer: o número da API manda
 * quando existir; senão vale o que a equipe lançou à mão. É por isso que os
 * adaptadores devolvem zero (e não null) só quando têm certeza.
 */
export async function syncAccount(
  accountId: string,
  refMonth: string,
  /** null quando vem do agendamento, não de alguém clicando */
  userId: string | null,
): Promise<SyncOutcome> {
  const row = await one<{
    id: string;
    client_id: string;
    marketplace: string;
    external_id: string | null;
    credentials: string | null;
  }>("SELECT * FROM client_marketplaces WHERE id = ?", accountId);
  if (!row) return { ok: false, status: "erro", message: "Conta não encontrada." };

  const adapter = adapterFor(row.marketplace);
  if (!adapter.isConfigured()) {
    const msg = `Faltam variáveis de ambiente: ${adapter.requiredEnv.filter((v) => !process.env[v]).join(", ")}`;
    await log(row.id, row.marketplace, refMonth, "erro", msg);
    await run("UPDATE client_marketplaces SET last_error = ? WHERE id = ?", msg, row.id);
    return { ok: false, status: "erro", message: msg };
  }

  try {
    const result = await adapter.fetchMonth(
      {
        externalId: row.external_id,
        credentials: readCredentials(row),
        saveCredentials: (next) => writeCredentials(row.id, next),
      },
      refMonth,
    );

    const existing = await one<{ id: string; cogs: number; ads: number; shipping: number }>(
      "SELECT id, cogs, ads, shipping FROM finance_snapshots WHERE client_id=? AND marketplace=? AND ref_month=?",
      row.client_id,
      row.marketplace,
      refMonth,
    );

    const cogs = existing?.cogs ?? result.cogs;
    const ads = result.ads || existing?.ads || 0;
    const shipping = result.shipping || existing?.shipping || 0;
    const profit = result.revenue - result.fees - shipping - result.tax - ads - cogs;

    if (existing) {
      await run(
        `UPDATE finance_snapshots SET revenue=?, orders=?, units=?, fees=?, shipping=?, tax=?, cogs=?, ads=?,
                profit=?, source='api', updated_by=?, updated_at=? WHERE id=?`,
        result.revenue, result.orders, result.units, result.fees, shipping,
        result.tax, cogs, ads, profit, userId, now(), existing.id,
      );
    } else {
      await run(
        `INSERT INTO finance_snapshots (id, client_id, marketplace, ref_month, revenue, orders, units, cogs, fees,
                                        shipping, tax, ads, profit, source, updated_by, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'api',?,?)`,
        id(), row.client_id, row.marketplace, refMonth, result.revenue, result.orders,
        result.units, cogs, result.fees, shipping, result.tax, ads, profit, userId, now(),
      );
    }

    await run(
      "UPDATE client_marketplaces SET last_sync_at = ?, last_error = NULL, status = 'conectado' WHERE id = ?",
      now(),
      row.id,
    );

    const msg = `${result.orders} pedidos · faturamento ${result.revenue.toFixed(2)}${ads ? ` · ads ${ads.toFixed(2)}` : ""}`;
    await log(row.id, row.marketplace, refMonth, "ok", msg);
    return { ok: true, status: "ok", message: msg, result };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await run("UPDATE client_marketplaces SET last_error = ?, status = 'erro' WHERE id = ?", msg, row.id);
    await log(row.id, row.marketplace, refMonth, "erro", msg);
    return { ok: false, status: "erro", message: msg };
  }
}
