import { NextResponse, type NextRequest } from "next/server";
import { all } from "@/lib/db";
import { syncAccount } from "@/lib/integrations";
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

  const contas = await all<{ id: string; nome: string; marketplace: string }>(
    `SELECT cm.id, cl.name AS nome, cm.marketplace
       FROM client_marketplaces cm
       JOIN clients cl ON cl.id = cm.client_id
      WHERE cm.status = 'conectado' AND cm.credentials IS NOT NULL
      ORDER BY cm.last_sync_at ASC NULLS FIRST`,
  );

  const resultados: { conta: string; mes: string; ok: boolean; detalhe: string }[] = [];
  let semTempo = false;

  for (const conta of contas) {
    for (const mes of meses) {
      if (Date.now() > fim) {
        semTempo = true;
        break;
      }
      const saida = await syncAccount(conta.id, mes, null);
      resultados.push({ conta: `${conta.nome} · ${conta.marketplace}`, mes, ok: saida.ok, detalhe: saida.message });
    }
    if (semTempo) break;
  }

  return NextResponse.json({
    contas: contas.length,
    processadas: resultados.length,
    ok: resultados.filter((r) => r.ok).length,
    erros: resultados.filter((r) => !r.ok).length,
    incompleto: semTempo,
    resultados,
  });
}
