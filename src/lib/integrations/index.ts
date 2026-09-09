import "server-only";
import { all, id, now, one, run } from "@/lib/db";
import { decryptJSON, encryptJSON } from "@/lib/crypto";
import type { ClientMarketplace, Marketplace } from "@/lib/types";
import { mercadoLivre } from "./mercadolivre";
import { shopee } from "./shopee";
import { IntegrationError, type MarketplaceAdapter, type MonthlyResult, type StoredCredentials } from "./types";

export const ADAPTERS: Record<Marketplace, MarketplaceAdapter> = {
  mercado_livre: mercadoLivre,
  shopee,
};

export function adapterFor(marketplace: string): MarketplaceAdapter {
  const adapter = ADAPTERS[marketplace as Marketplace];
  if (!adapter) throw new IntegrationError(`Marketplace desconhecido: ${marketplace}`, "config");
  return adapter;
}

export async function integrationStatus() {
  // uma consulta só para os dois contadores de todos os marketplaces
  const counts = await all<{ marketplace: string; accounts: number; connected: number }>(
    `SELECT marketplace,
            COUNT(*) FILTER (WHERE status <> 'desativado') AS accounts,
            COUNT(*) FILTER (WHERE status = 'conectado')   AS connected
       FROM client_marketplaces
      GROUP BY marketplace`,
  );

  return Object.values(ADAPTERS).map((a) => {
    const row = counts.find((c) => c.marketplace === a.marketplace);
    return {
      marketplace: a.marketplace,
      label: a.label,
      configured: a.isConfigured(),
      requiredEnv: a.requiredEnv,
      missingEnv: a.requiredEnv.filter((v) => !process.env[v]),
      accounts: row?.accounts ?? 0,
      connected: row?.connected ?? 0,
    };
  });
}

export function readCredentials(row: ClientMarketplace): StoredCredentials | null {
  return decryptJSON<StoredCredentials>(row.credentials);
}

export async function writeCredentials(rowId: string, creds: StoredCredentials) {
  await run(
    "UPDATE client_marketplaces SET credentials = ?, status = 'conectado', last_error = NULL WHERE id = ?",
    encryptJSON(creds),
    rowId,
  );
}

async function log(rowId: string | null, marketplace: string, refMonth: string | null, status: string, message: string) {
  await run(
    "INSERT INTO sync_logs (id, client_marketplace_id, marketplace, ref_month, status, message, created_at) VALUES (?,?,?,?,?,?,?)",
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
 * Puxa o fechamento do mês de uma conta e grava em finance_snapshots (source='api').
 * O que já foi preenchido à mão em cogs/ads é preservado — a API não sabe esses números.
 */
export async function syncAccount(
  accountId: string,
  refMonth: string,
  /** null quando a sincronização vem do agendamento, não de alguém clicando */
  userId: string | null,
): Promise<SyncOutcome> {
  const row = await one<ClientMarketplace>("SELECT * FROM client_marketplaces WHERE id = ?", accountId);
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
    const ads = existing?.ads ?? result.ads;
    // a API do ML não informa o frete pago pelo vendedor; o lançado à mão manda
    const shipping = result.shipping || existing?.shipping || 0;
    const profit = result.revenue - result.fees - shipping - result.tax - ads - cogs;

    if (existing) {
      await run(
        `UPDATE finance_snapshots SET revenue=?, orders=?, units=?, fees=?, shipping=?, tax=?, cogs=?, ads=?,
                profit=?, source='api', updated_by=?, updated_at=? WHERE id=?`,
        result.revenue,
        result.orders,
        result.units,
        result.fees,
        shipping,
        result.tax,
        cogs,
        ads,
        profit,
        userId,
        now(),
        existing.id,
      );
    } else {
      await run(
        `INSERT INTO finance_snapshots (id, client_id, marketplace, ref_month, revenue, orders, units, cogs, fees,
                                        shipping, tax, ads, profit, source, updated_by, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'api',?,?)`,
        id(),
        row.client_id,
        row.marketplace,
        refMonth,
        result.revenue,
        result.orders,
        result.units,
        cogs,
        result.fees,
        shipping,
        result.tax,
        ads,
        profit,
        userId,
        now(),
      );
    }

    await run(
      "UPDATE client_marketplaces SET last_sync_at = ?, last_error = NULL, status = 'conectado' WHERE id = ?",
      now(),
      row.id,
    );
    const msg = `${result.orders} pedidos · faturamento ${result.revenue.toFixed(2)}`;
    await log(row.id, row.marketplace, refMonth, "ok", msg);
    return { ok: true, status: "ok", message: msg, result };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await run("UPDATE client_marketplaces SET last_error = ?, status = 'erro' WHERE id = ?", msg, row.id);
    await log(row.id, row.marketplace, refMonth, "erro", msg);
    return { ok: false, status: "erro", message: msg };
  }
}

export { IntegrationError };
