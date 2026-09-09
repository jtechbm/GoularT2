import "server-only";
import { all, one } from "@/lib/db";
import { ADAPTERS } from "./sincronizar-conta";
import { IntegrationError } from "./types";

export { adapterFor, readCredentials, writeCredentials, syncAccount, ADAPTERS } from "./sincronizar-conta";
export type { SyncOutcome } from "./sincronizar-conta";
export { IntegrationError };

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

/** Usado só para checagens pontuais fora do fluxo de sincronização. */
export async function contaPorId(accountId: string) {
  return one("SELECT * FROM client_marketplaces WHERE id = ?", accountId);
}
