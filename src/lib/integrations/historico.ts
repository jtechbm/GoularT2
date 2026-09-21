import { all, one, run } from "../db.ts";
import { addMonths, currentMonth } from "../format.ts";
import { syncAccount } from "./sincronizar-conta.ts";

/** Quantos meses para trás o sistema guarda, contando o atual. */
export const MESES_DE_HISTORICO = 12;

/** O mês mais antigo que o histórico deve alcançar. */
export function mesMaisAntigo(): string {
  return addMonths(currentMonth(), -(MESES_DE_HISTORICO - 1));
}

/**
 * Próximo mês que falta no histórico da conta, ou null se já está completo.
 *
 * `history_from` guarda o mês mais antigo já fechado por completo. Vazio
 * quer dizer que só o mês corrente existe, e a busca começa pelo anterior.
 */
export function proximoMes(historyFrom: string | null): string | null {
  const alvo = addMonths(historyFrom ?? currentMonth(), -1);
  return alvo < mesMaisAntigo() ? null : alvo;
}

/** Quantos meses de histórico a conta já tem, contando o atual. */
export function mesesCarregados(historyFrom: string | null): number {
  if (!historyFrom) return 1;
  const [a1, m1] = currentMonth().split("-").map(Number);
  const [a0, m0] = historyFrom.split("-").map(Number);
  return Math.min(MESES_DE_HISTORICO, (a1 - a0) * 12 + (m1 - m0) + 1);
}

/**
 * Avança o histórico de uma conta até o prazo.
 *
 * Um mês só conta como feito quando a sincronização dele termina completa.
 * Mês parcial (a Shopee não terminou de ler os pedidos) fica para a próxima
 * chamada, que continua de onde parou: os pedidos já lidos estão guardados.
 */
export async function avancarHistorico(
  accountId: string,
  prazo: number,
  trigger: "cron" | "cli",
): Promise<{ meses: string[]; completo: boolean; erro: boolean; ultimaMensagem: string | null }> {
  const feitos: string[] = [];
  let ultimaMensagem: string | null = null;
  let erro = false;

  while (Date.now() < prazo - 5000) {
    const conta = await one<{ history_from: string | null }>(
      "SELECT history_from FROM client_marketplaces WHERE id = ?",
      accountId,
    );
    const mes = proximoMes(conta?.history_from ?? null);
    if (!mes) return { meses: feitos, completo: true, erro, ultimaMensagem };

    const saida = await syncAccount(accountId, mes, null, trigger, prazo);
    ultimaMensagem = `${mes}: ${saida.message}`;
    // parcial continua na próxima chamada; erro não se resolve insistindo
    erro = saida.status === "erro";
    if (saida.status !== "ok") break;

    await run("UPDATE client_marketplaces SET history_from = ? WHERE id = ?", mes, accountId);
    feitos.push(mes);
  }
  const conta = await one<{ history_from: string | null }>(
    "SELECT history_from FROM client_marketplaces WHERE id = ?",
    accountId,
  );
  return { meses: feitos, completo: proximoMes(conta?.history_from ?? null) === null, erro, ultimaMensagem };
}

/** Contas conectadas que ainda não têm os 12 meses, a mais atrasada primeiro. */
export async function contasComHistoricoPendente() {
  const contas = await all<{ id: string; nome: string; marketplace: string; history_from: string | null }>(
    `SELECT cm.id, cl.name AS nome, cm.marketplace, cm.history_from
       FROM client_marketplaces cm JOIN clients cl ON cl.id = cm.client_id
      WHERE cm.status = 'conectado' AND cm.credentials IS NOT NULL
      ORDER BY cm.history_from DESC NULLS FIRST`,
  );
  return contas.filter((c) => proximoMes(c.history_from) !== null);
}
