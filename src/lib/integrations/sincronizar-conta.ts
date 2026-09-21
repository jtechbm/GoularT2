import { all, id, now, one, run } from "../db.ts";
import { decryptJSON, encryptJSON } from "../crypto.ts";
import { mercadoLivre } from "./mercadolivre.ts";
import { shopee } from "./shopee.ts";
import {
  IntegrationError,
  monthRange,
  type AdsCampaign,
  type DailyResult,
  type MarketplaceAdapter,
  type MonthlyResult,
  type StoredCredentials,
} from "./types.ts";

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

/**
 * Espelha as campanhas do mês em ads_entries, que é o que alimenta a aba Ads.
 *
 * Só mexe nas linhas com source='api': o que a equipe lançou à mão continua
 * intacto. Campanhas que sumiram da resposta são removidas, senão um mês
 * corrigido pelo marketplace ficaria somando duas vezes.
 */
async function saveAdsCampaigns(
  clientId: string,
  marketplace: string,
  refMonth: string,
  campaigns: AdsCampaign[],
  userId: string | null,
) {
  const { start, end } = monthRange(refMonth);
  const periodStart = start.toISOString().slice(0, 10);
  // no mês corrente o período fecha hoje, não numa data futura
  const periodEnd = new Date(Math.min(end.getTime() - 864e5, Date.now())).toISOString().slice(0, 10);

  const anteriores = await all<{ id: string; external_id: string | null }>(
    `SELECT id, external_id FROM ads_entries
      WHERE client_id=? AND marketplace=? AND source='api' AND period_start=?`,
    clientId,
    marketplace,
    periodStart,
  );

  for (const c of campaigns) {
    const existente = anteriores.find((a) => a.external_id === c.external_id);
    if (existente) {
      await run(
        `UPDATE ads_entries SET campaign=?, period_end=?, invested=?, revenue=?, clicks=?, orders=?, updated_at=?
          WHERE id=?`,
        c.name, periodEnd, c.invested, c.revenue, c.clicks, c.orders, now(), existente.id,
      );
    } else {
      await run(
        `INSERT INTO ads_entries (id, client_id, marketplace, campaign, period_start, period_end, invested, revenue,
                                  clicks, orders, notes, source, external_id, created_by, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,NULL,'api',?,?,?,?)`,
        id(), clientId, marketplace, c.name, periodStart, periodEnd, c.invested, c.revenue,
        c.clicks, c.orders, c.external_id, userId, now(), now(),
      );
    }
  }

  const vivas = new Set(campaigns.map((c) => c.external_id));
  for (const a of anteriores) {
    if (!vivas.has(a.external_id ?? "")) await run("DELETE FROM ads_entries WHERE id = ?", a.id);
  }
}

/**
 * Grava o fechamento de cada dia.
 *
 * Escreve dia a dia com UPSERT na chave (cliente, loja, dia). Isso resolve
 * duas coisas de uma vez: rodar de novo o mesmo período não duplica linha,
 * e um dia que ainda está acontecendo pode ser corrigido na rodada
 * seguinte, quando os pedidos do fim do dia entrarem.
 *
 * Dias que a API não devolveu não são apagados. Uma falha parcial da loja
 * nunca pode zerar histórico já apurado.
 *
 * Sem `comAds` as colunas de anúncio ficam como estão: o aviso em tempo real
 * da Shopee regrava o dia só com pedidos, e sobrescrever ali zerava o Ads
 * que a rodada completa tinha lido.
 */
async function saveDailyHistory(
  clientId: string,
  marketplace: string,
  dias: DailyResult[],
  comAds: boolean,
): Promise<number> {
  const colunasAds = comAds
    ? `ads = EXCLUDED.ads, ads_revenue = EXCLUDED.ads_revenue, clicks = EXCLUDED.clicks,
         prints = EXCLUDED.prints, `
    : "";
  let gravados = 0;
  for (const d of dias) {
    await run(
      `INSERT INTO finance_daily (id, client_id, marketplace, day, revenue, orders, units, fees, shipping, tax,
                                  ads, ads_revenue, clicks, prints, source, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,'api',?)
       ON CONFLICT (client_id, marketplace, day) DO UPDATE SET
         revenue = EXCLUDED.revenue, orders = EXCLUDED.orders, units = EXCLUDED.units,
         fees = EXCLUDED.fees, shipping = EXCLUDED.shipping, tax = EXCLUDED.tax,
         ${colunasAds}updated_at = EXCLUDED.updated_at`,
      id(), clientId, marketplace, d.day, d.revenue, d.orders, d.units, d.fees, d.shipping,
      d.tax, d.ads, d.ads_revenue, d.clicks, d.prints, now(),
    );
    gravados += 1;
  }
  return gravados;
}

/**
 * Rodadas que ficaram "rodando" há mais de cinco minutos morreram.
 *
 * Quando a Vercel mata a função por tempo, ela não chega a gravar o fim.
 * Sem esta limpeza a rodada fica "rodando" para sempre, e a tela nunca
 * mostra que a conta está parada. Nenhuma função da Vercel no plano atual
 * passa de um minuto, então cinco é folga larga.
 */
async function encerrarRodadasMortas(accountId: string) {
  await run(
    `UPDATE sync_runs SET status = 'interrompida', finished_at = ?,
            error = 'A rodada passou do tempo limite do servidor e foi interrompida antes de terminar.'
      WHERE client_marketplace_id = ? AND status = 'rodando' AND started_at < ?`,
    now(),
    accountId,
    new Date(Date.now() - 5 * 60_000).toISOString(),
  );
}

/** Abre uma rodada de sincronização e devolve o id, para fechar depois. */
async function abrirRodada(
  accountId: string | null,
  marketplace: string | null,
  trigger: string,
  userId: string | null,
): Promise<string> {
  const runId = id();
  await run(
    `INSERT INTO sync_runs (id, client_marketplace_id, marketplace, trigger, started_at, status, started_by)
     VALUES (?,?,?,?,?,'rodando',?)`,
    runId, accountId, marketplace, trigger, now(), userId,
  );
  return runId;
}

async function fecharRodada(
  runId: string,
  status: "ok" | "erro" | "parcial",
  message: string,
  diasGravados: number,
  erro?: string,
) {
  await run(
    "UPDATE sync_runs SET finished_at=?, status=?, message=?, days_written=?, error=? WHERE id=?",
    now(), status, message, diasGravados, erro ?? null, runId,
  );
}

/**
 * Grava o fechamento do mês, o histórico diário e as campanhas.
 *
 * Separado da sincronização para o aviso em tempo real da Shopee gravar pelo
 * mesmo caminho: dois lugares escrevendo o fechamento de jeitos diferentes
 * foi exatamente o que já fez o Ads sumir uma vez.
 */
export async function gravarResultado(
  row: { id: string; client_id: string; marketplace: string },
  refMonth: string,
  result: MonthlyResult,
  userId: string | null,
): Promise<{ ads: number; diasGravados: number }> {
  const existing = await one<{ id: string; cogs: number; ads: number; shipping: number }>(
    "SELECT id, cogs, ads, shipping FROM finance_snapshots WHERE client_id=? AND marketplace=? AND ref_month=?",
    row.client_id,
    row.marketplace,
    refMonth,
  );

  const cogs = existing?.cogs ?? result.cogs;
  const ads = result.ads || existing?.ads || 0;
  // frete zero só herda o valor antigo quando o adaptador não tem certeza dele
  const shipping = result.freteApurado ? result.shipping : result.shipping || existing?.shipping || 0;
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

  // undefined = a API de Ads não respondeu; array vazio = respondeu e não há
  // campanha. Só o segundo caso pode limpar o que estava gravado.
  if (result.adsCampaigns) {
    await saveAdsCampaigns(row.client_id, row.marketplace, refMonth, result.adsCampaigns, userId);
  }

  const leuAds = result.adsPermissao === "liberada";
  const diasGravados = result.days?.length
    ? await saveDailyHistory(row.client_id, row.marketplace, result.days, leuAds)
    : 0;
  const ultimoDia = result.days?.length ? result.days[result.days.length - 1].day : null;

  await run(
    `UPDATE client_marketplaces
        SET last_sync_at = ?, last_success_at = ?, last_error = NULL, status = 'conectado',
            daily_synced_until = GREATEST(daily_synced_until, ?), -- mês antigo não recua o marcador
            ads_permission = COALESCE(?, ads_permission)
      WHERE id = ?`,
    now(),
    now(),
    ultimoDia,
    result.adsPermissao ?? null,
    row.id,
  );

  return { ads, diasGravados };
}

export interface SyncOutcome {
  ok: boolean;
  status: "ok" | "erro" | "parcial";
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
  /** de onde partiu: 'manual', 'cron' ou 'cli' */
  trigger: "manual" | "cron" | "cli" = "manual",
  /** até quando esta conta pode trabalhar (epoch ms); o agendamento divide o tempo */
  deadline?: number,
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
  await encerrarRodadasMortas(row.id);
  const runId = await abrirRodada(row.id, row.marketplace, trigger, userId);

  if (!adapter.isConfigured()) {
    const msg = `Faltam variáveis de ambiente: ${adapter.requiredEnv.filter((v) => !process.env[v]).join(", ")}`;
    await log(row.id, row.marketplace, refMonth, "erro", msg);
    await run("UPDATE client_marketplaces SET last_error = ? WHERE id = ?", msg, row.id);
    await fecharRodada(runId, "erro", msg, 0, msg);
    return { ok: false, status: "erro", message: msg };
  }

  try {
    const result = await adapter.fetchMonth(
      {
        externalId: row.external_id,
        credentials: readCredentials(row),
        saveCredentials: (next) => writeCredentials(row.id, next),
        accountId: row.id,
        deadline,
      },
      refMonth,
    );

    // Progresso salvo, mas o mês ainda não foi lido inteiro. Não é erro e a
    // conta continua conectada: a próxima rodada continua de onde parou. O
    // fechamento do mês não é tocado, senão um número parcial menor
    // apareceria como se fosse o faturamento real.
    if (result.incompleto) {
      const { feitos, total, dias, listagemCompleta } = result.incompleto;
      const faltaDia = dias ? ` · ${dias} ${dias === 1 ? "dia" : "dias"} sem varrer` : "";
      const msg = `Carga em andamento: ${feitos} de ${total} pedidos conferidos${faltaDia}. A próxima rodada continua de onde parou.`;

      // Quando a listagem do mês fechou, o conjunto de pedidos está completo e
      // só faltou reler o valor de alguns: o total é o melhor retrato que
      // existe, e gravá-lo é melhor do que deixar o fechamento de ontem na
      // tela. Sem a listagem completa o número seria menor por falta de dado,
      // e aí o fechamento antigo continua valendo.
      if (listagemCompleta) {
        const { ads, diasGravados } = await gravarResultado(row, refMonth, result, userId);
        const parcial = `${result.orders} pedidos · faturamento ${result.revenue.toFixed(2)}${ads ? ` · ads ${ads.toFixed(2)}` : ""}${diasGravados ? ` · ${diasGravados} dias` : ""} · ${feitos} de ${total} pedidos conferidos, o resto na próxima rodada`;
        await log(row.id, row.marketplace, refMonth, "parcial", parcial);
        await fecharRodada(runId, "parcial", parcial, diasGravados);
        return { ok: true, status: "parcial", message: parcial, result };
      }

      await run(
        "UPDATE client_marketplaces SET last_sync_at = ?, last_error = NULL, status = 'conectado' WHERE id = ?",
        now(),
        row.id,
      );
      await log(row.id, row.marketplace, refMonth, "parcial", msg);
      await fecharRodada(runId, "parcial", msg, 0);
      return { ok: true, status: "parcial", message: msg, result };
    }

    const { ads, diasGravados } = await gravarResultado(row, refMonth, result, userId);

    const msg = `${result.orders} pedidos · faturamento ${result.revenue.toFixed(2)}${ads ? ` · ads ${ads.toFixed(2)}` : ""}${diasGravados ? ` · ${diasGravados} dias` : ""}`;
    await log(row.id, row.marketplace, refMonth, "ok", msg);
    await fecharRodada(runId, "ok", msg, diasGravados);
    return { ok: true, status: "ok", message: msg, result };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await run("UPDATE client_marketplaces SET last_error = ?, status = 'erro' WHERE id = ?", msg, row.id);
    await log(row.id, row.marketplace, refMonth, "erro", msg);
    await fecharRodada(runId, "erro", msg, 0, msg);
    return { ok: false, status: "erro", message: msg };
  }
}
