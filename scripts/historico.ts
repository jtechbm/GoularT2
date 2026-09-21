/**
 * Carrega os 12 meses de histórico de todas as contas conectadas.
 *
 *   npm run historico
 *
 * O agendamento diário também avança o histórico com o tempo que sobra, mas
 * aos poucos. Isto faz tudo de uma vez, sem o limite de 60 segundos da
 * Vercel. Pode ser interrompido e rodado de novo: continua de onde parou.
 */
import { closePool } from "../src/lib/db.ts";
import { avancarHistorico, contasComHistoricoPendente, mesesCarregados, MESES_DE_HISTORICO } from "../src/lib/integrations/historico.ts";

const contas = await contasComHistoricoPendente();
if (!contas.length) console.log(`Todas as contas já têm ${MESES_DE_HISTORICO} meses de histórico.`);

for (const conta of contas) {
  console.log(`${conta.nome} · ${conta.marketplace} — ${mesesCarregados(conta.history_from)} de ${MESES_DE_HISTORICO} meses`);
  let tentativas = 0;
  while (tentativas < 40) {
    tentativas += 1;
    // fatias de 5 minutos: a Shopee guarda o progresso de cada pedido lido
    const r = await avancarHistorico(conta.id, Date.now() + 300_000, "cli");
    for (const m of r.meses) console.log(`  ${m} ok`);
    if (r.completo) {
      console.log("  completo\n");
      break;
    }
    if (r.erro) {
      console.log(`  parou: ${r.ultimaMensagem}
`);
      break;
    }
    if (!r.meses.length) console.log(`  ${r.ultimaMensagem ?? "sem resposta"}`);
  }
}

await closePool();
