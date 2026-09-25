import { NextResponse, type NextRequest } from "next/server";
import { all, id, now, run } from "@/lib/db";
import { syncAccount } from "@/lib/integrations";
import { avancarHistorico, contasComHistoricoPendente } from "@/lib/integrations/historico";
import { verificarPenalidadesML } from "@/lib/penalidades/mercadolivre";
import { verificarPenalidadesShopee } from "@/lib/penalidades/shopee";
import { addMonths, currentMonth } from "@/lib/format";
import { avisarTarefasAtrasadas } from "@/lib/tarefas-atraso";

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
  const contas = await all<{
    id: string;
    nome: string;
    marketplace: string;
    penalties_checked_at: string | null;
  }>(
    `SELECT cm.id, cl.name AS nome, cm.marketplace, cm.penalties_checked_at
       FROM client_marketplaces cm
       JOIN clients cl ON cl.id = cm.client_id
      WHERE cm.status IN ('conectado', 'erro') AND cm.credentials IS NOT NULL
      ORDER BY CASE cm.marketplace WHEN 'mercado_livre' THEN 0 ELSE 1 END,
               cm.last_sync_at ASC NULLS FIRST`,
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
  /** teto por conta do Mercado Livre: elas terminam em poucos segundos */
  const TETO_ML = 15_000;
  let mlRestantes = contasML * meses.length;

  for (const conta of contas) {
    for (const mes of meses) {
      if (Date.now() > fimSync) {
        semTempo = true;
        break;
      }
      // O Mercado Livre fecha em poucos segundos; a Shopee precisa varrer
      // milhares de pedidos. Dividir o tempo igual entre as contas dava à
      // Shopee uma fatia que não chegava nem para listar o mês — no
      // agendamento de 17/09 ela leu 0 de 2480 pedidos. Agora o ML vem
      // primeiro, com teto curto, e o que sobra é da Shopee, que guarda o
      // progresso e continua na rodada seguinte.
      const sobra = fimSync - Date.now();
      const lentasRestantes = Math.max(1, restantes - mlRestantes);
      const fatia =
        conta.marketplace === "mercado_livre"
          ? Math.min(TETO_ML, sobra)
          : Math.max(15_000, (sobra - mlRestantes * TETO_ML) / lentasRestantes);
      restantes -= 1;
      if (conta.marketplace === "mercado_livre") mlRestantes -= 1;
      const saida = await syncAccount(conta.id, mes, null, "cron", Date.now() + fatia);
      resultados.push({ conta: `${conta.nome} · ${conta.marketplace}`, mes, ok: saida.ok, detalhe: saida.message });
    }
    if (semTempo) break;
  }

  // penalidades depois dos números: se o tempo acabar, o faturamento, que é o
  // que a agência cobra, já foi gravado. Cada verificação são três chamadas.
  //
  // A fila começa pela loja verificada há mais tempo. Antes ela seguia a mesma
  // ordem da sincronização, então o tempo que sobrava caía sempre nas mesmas
  // primeiras contas e o fim da lista nunca era verificado.
  const filaPenalidades = [...contas].sort((a, b) =>
    (a.penalties_checked_at ?? "").localeCompare(b.penalties_checked_at ?? ""),
  );
  let penalidadesNovas = 0;
  let penalidadesVerificadas = 0;
  for (const conta of filaPenalidades) {
    if (Date.now() > fim) {
      semTempo = true;
      break;
    }
    const r =
      conta.marketplace === "mercado_livre"
        ? await verificarPenalidadesML(conta.id)
        : await verificarPenalidadesShopee(conta.id);
    penalidadesVerificadas += 1;
    penalidadesNovas += r.novas;
  }

  // Histórico por último, com o que sobrar: o mês corrente e as penalidades
  // valem mais que um mês de um ano atrás. Carga inicial grande é com
  // `npm run historico`; isto aqui cobre conta nova e o que ficou para trás.
  const historico: string[] = [];
  if (!semTempo && fim - Date.now() > 12_000) {
    for (const conta of await contasComHistoricoPendente()) {
      if (fim - Date.now() < 12_000) break;
      const r = await avancarHistorico(conta.id, fim, "cron");
      historico.push(...r.meses.map((m) => `${conta.nome} · ${conta.marketplace} · ${m}`));
      if (!r.completo && !r.erro) break; // parou por tempo
    }
  }

  // Faxina: sessão vencida não serve para nada e fica no banco para sempre.
  // Barata (um DELETE por índice) e o único lugar do sistema que roda todo dia
  // sem ninguém pedir.
  const sessoesLimpas = await run("DELETE FROM sessions WHERE expires_at < ?", now());
  // a navegação já avisa; isto cobre o fim de semana, quando ninguém entra
  const prazosEstourados = await avisarTarefasAtrasadas().catch(() => 0);

  // batimento cardíaco: sem isto, um cron que nunca roda é indistinguível
  // de um cron que roda e não encontra nada para fazer
  const erros = resultados.filter((r) => !r.ok).length;
  await run(
    "UPDATE sync_logs SET status = ?, message = ?, created_at = ? WHERE id = ?",
    erros ? "parcial" : "ok",
    `${resultados.length} sincronizações · ${erros} com erro · ${penalidadesVerificadas} contas verificadas, ${penalidadesNovas} penalidades novas${historico.length ? ` · ${historico.length} meses de histórico` : ""}${semTempo ? " · fila incompleta" : ""}`,
    now(),
    batimentoId,
  );

  return NextResponse.json({
    sessoesVencidasApagadas: sessoesLimpas,
    prazosEstourados,
    contas: contas.length,
    processadas: resultados.length,
    ok: resultados.filter((r) => r.ok).length,
    erros,
    incompleto: semTempo,
    penalidades: { verificadas: penalidadesVerificadas, novas: penalidadesNovas },
    historico,
    resultados,
  });
}
