import { NextResponse, type NextRequest } from "next/server";
import { all, id, now, run } from "@/lib/db";
import { syncAccount } from "@/lib/integrations";
import { verificarPenalidadesML } from "@/lib/penalidades/mercadolivre";
import { addMonths, currentMonth } from "@/lib/format";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Sincronização automática, chamada pela Vercel uma vez por dia.
 *
 * O limite de tempo da função é curto, então não dá para garantir que todas
 * as contas sejam processadas numa execução. A fila é ordenada pela conta
 * mais desatualizada, e cada execução processa o que couber no prazo — como
 * roda todo dia, a fila se resolve sozinha em poucos dias mesmo com muitas
 * contas. Melhor isso do que estourar o tempo e não gravar nada.
 */

const PRAZO_MS = 50_000; // deixa folga para responder antes do corte da Vercel

function autorizado(req: NextRequest): boolean {
  const segredo = process.env.CRON_SECRET;
  // sem segredo configurado a rota fica fechada, em vez de aberta
  if (!segredo) return false;
  return req.headers.get("authorization") === `Bearer ${segredo}`;
}

export async function GET(req: NextRequest) {
  if (!autorizado(req)) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }

  const fim = Date.now() + PRAZO_MS;
  const mesAtual = currentMonth();
  // nos primeiros dias do mês o mês anterior ainda recebe repasses atrasados
  const meses = new Date().getUTCDate() <= 5 ? [mesAtual, addMonths(mesAtual, -1)] : [mesAtual];

  // Contas com erro entram também. Antes só entravam as "conectadas": uma
  // falha por tempo virava status de erro e o agendamento nunca mais tentava
  // aquela conta, que ficava parada até alguém clicar à mão.
  const contas = await all<{ id: string; nome: string; marketplace: string }>(
    `SELECT cm.id, cl.name AS nome, cm.marketplace
       FROM client_marketplaces cm
       JOIN clients cl ON cl.id = cm.client_id
      WHERE cm.status IN ('conectado', 'erro') AND cm.credentials IS NOT NULL
      ORDER BY cm.last_sync_at ASC NULLS FIRST`,
  );

  // batimento no começo: se a Vercel matar a função, fica registrado que a
  // rodada começou, em vez de o agendamento parecer que nem foi chamado
  const batimentoId = id();
  await run(
    `INSERT INTO sync_logs (id, client_marketplace_id, marketplace, ref_month, status, message, created_at)
     VALUES (?,NULL,'cron',?,'rodando',?,?)`,
    batimentoId,
    mesAtual,
    `começou com ${contas.length} contas`,
    now(),
  );

  const resultados: { conta: string; mes: string; ok: boolean; detalhe: string }[] = [];
  let semTempo = false;

  // reserva alguns segundos para as penalidades, que vêm depois
  const contasML = contas.filter((c) => c.marketplace === "mercado_livre").length;
  const fimSync = fim - contasML * 3000;
  let restantes = contas.length * meses.length;

  for (const conta of contas) {
    for (const mes of meses) {
      if (Date.now() > fimSync) {
        semTempo = true;
        break;
      }
      // Cada conta ganha uma fatia do tempo que sobra. Antes a primeira da
      // fila podia gastar o prazo inteiro, e uma loja grande deixava todas
      // as outras sem atualizar. A Shopee guarda o progresso, então fatia
      // curta não perde trabalho: continua na rodada seguinte.
      const fatia = Math.max(10_000, (fimSync - Date.now()) / Math.max(1, restantes));
      restantes -= 1;
      const saida = await syncAccount(conta.id, mes, null, "cron", Date.now() + fatia);
      resultados.push({ conta: `${conta.nome} · ${conta.marketplace}`, mes, ok: saida.ok, detalhe: saida.message });
    }
    if (semTempo) break;
  }

  // penalidades depois dos números: se o tempo acabar, o faturamento, que é o
  // que a agência cobra, já foi gravado. Cada verificação são três chamadas.
  let penalidadesNovas = 0;
  let penalidadesVerificadas = 0;
  for (const conta of contas.filter((c) => c.marketplace === "mercado_livre")) {
    if (Date.now() > fim) {
      semTempo = true;
      break;
    }
    const r = await verificarPenalidadesML(conta.id);
    penalidadesVerificadas += 1;
    penalidadesNovas += r.novas;
  }

  // batimento cardíaco: sem isto, um cron que nunca roda é indistinguível
  // de um cron que roda e não encontra nada para fazer
  const erros = resultados.filter((r) => !r.ok).length;
  await run(
    "UPDATE sync_logs SET status = ?, message = ?, created_at = ? WHERE id = ?",
    erros ? "parcial" : "ok",
    `${resultados.length} sincronizações · ${erros} com erro · ${penalidadesVerificadas} contas verificadas, ${penalidadesNovas} penalidades novas${semTempo ? " · fila incompleta" : ""}`,
    now(),
    batimentoId,
  );

  return NextResponse.json({
    contas: contas.length,
    processadas: resultados.length,
    ok: resultados.filter((r) => r.ok).length,
    erros,
    incompleto: semTempo,
    penalidades: { verificadas: penalidadesVerificadas, novas: penalidadesNovas },
    resultados,
  });
}
