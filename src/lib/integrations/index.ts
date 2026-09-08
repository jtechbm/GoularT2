import "server-only";
import { id, now, one, run } from "@/lib/db";
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

export function integrationStatus() {
  return Object.values(ADAPTERS).map((a) => ({
    marketplace: a.marketplace,
    label: a.label,
    configured: a.isConfigured(),
    requiredEnv: a.requiredEnv,
    missingEnv: a.requiredEnv.filter((v) => !process.env[v]),
    accounts: one<{ n: number }>(
      "SELECT COUNT(*) n FROM client_marketplaces WHERE marketplace = ? AND status != 'desativado'",
      a.marketplace,
    )?.n ?? 0,
    connected: one<{ n: number }>(
      "SELECT COUNT(*) n FROM client_marketplaces WHERE marketplace = ? AND status = 'conectado'",
      a.marketplace,
    )?.n ?? 0,
  }));
}

export function readCredentials(row: ClientMarketplace): StoredCredentials | null {
  return decryptJSON<StoredCredentials>(row.credentials);
}

export function writeCredentials(rowId: string, creds: StoredCredentials) {
  run(
    "UPDATE client_marketplaces SET credentials = ?, status = 'conectado', last_error = NULL WHERE id = ?",
    encryptJSON(creds),
    rowId,
  );
}

function log(rowId: string | null, marketplace: string, refMonth: string | null, status: string, message: string) {
  run(
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
export async function syncAccount(accountId: string, refMonth: string, userId: string): Promise<SyncOutcome> {
  const row = one<ClientMarketplace>("SELECT * FROM client_marketplaces WHERE id = ?", accountId);
  if (!row) return { ok: false, status: "erro", message: "Conta não encontrada." };

  const adapter = adapterFor(row.marketplace);
  if (!adapter.isConfigured()) {
    const msg = `Faltam variáveis de ambiente: ${adapter.requiredEnv.filter((v) => !process.env[v]).join(", ")}`;
    log(row.id, row.marketplace, refMonth, "erro", msg);
    run("UPDATE client_marketplaces SET last_error = ? WHERE id = ?", msg, row.id);
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

    const existing = one<{ id: string; cogs: number; ads: number }>(
      "SELECT id, cogs, ads FROM finance_snapshots WHERE client_id=? AND marketplace=? AND ref_month=?",
      row.client_id,
      row.marketplace,
      refMonth,
    );
    const cogs = existing?.cogs ?? result.cogs;
    const ads = existing?.ads ?? result.ads;
    const profit = result.revenue - result.fees - result.shipping - result.tax - ads - cogs;

    if (existing) {
      run(
        `UPDATE finance_snapshots SET revenue=?, orders=?, units=?, fees=?, shipping=?, tax=?, cogs=?, ads=?,
                profit=?, source='api', updated_by=?, updated_at=? WHERE id=?`,
        result.revenue,
        result.orders,
        result.units,
        result.fees,
        result.shipping,
        result.tax,
        cogs,
        ads,
        profit,
        userId,
        now(),
        existing.id,
      );
    } else {
      run(
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
        result.shipping,
        result.tax,
        ads,
        profit,
        userId,
        now(),
      );
    }

    run(
      "UPDATE client_marketplaces SET last_sync_at = ?, last_error = NULL, status = 'conectado' WHERE id = ?",
      now(),
      row.id,
    );
    const msg = `${result.orders} pedidos · faturamento ${result.revenue.toFixed(2)}`;
    log(row.id, row.marketplace, refMonth, "ok", msg);
    return { ok: true, status: "ok", message: msg, result };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    run("UPDATE client_marketplaces SET last_error = ?, status = 'erro' WHERE id = ?", msg, row.id);
    log(row.id, row.marketplace, refMonth, "erro", msg);
    return { ok: false, status: "erro", message: msg };
  }
}

export { IntegrationError };
