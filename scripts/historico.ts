/**
 * Carrega o histórico de todas as contas conectadas (MESES_DE_HISTORICO).
 *
 *   npm run historico                 todas as contas, uma de cada vez
 *   npm run historico -- --parte 1/3  só um terço delas
 *
 * O tempo aqui é quase todo espera de resposta do marketplace, não trabalho
 * da máquina. Por isso vale abrir três janelas com --parte 1/3, 2/3 e 3/3:
 * cada uma pega um pedaço fixo da lista, então duas nunca disputam a mesma
 * loja, e a carga inicial termina em um terço do tempo.
 *
 * O agendamento diário também avança o histórico com o tempo que sobra, mas
 * aos poucos. Isto faz tudo de uma vez, sem o limite de 60 segundos da
 * Vercel. Pode ser interrompido e rodado de novo: continua de onde parou.
 */
import { closePool } from "../src/lib/db.ts";
import { avancarHistorico, contasComHistoricoPendente, mesesCarregados, MESES_DE_HISTORICO } from "../src/lib/integrations/historico.ts";

/** `--parte 2/3` devolve [1, 3]: o segundo pedaço de três. */
function parte(): [number, number] {
  const arg = process.argv.slice(2).join(" ").match(/--parte\s+(\d+)\s*\/\s*(\d+)/);
  if (!arg) return [0, 1];
  const [, qual, total] = arg;
  const m = Math.max(1, Number(total));
  return [Math.min(m, Math.max(1, Number(qual))) - 1, m];
}

const [meu, partes] = parte();
const todas = await contasComHistoricoPendente();
// divide por posição na lista: a mesma conta cai sempre no mesmo pedaço
const contas = todas.filter((_, i) => i % partes === meu);

if (!todas.length) console.log(`Todas as contas já têm ${MESES_DE_HISTORICO} meses de histórico.`);
else if (partes > 1) console.log(`Parte ${meu + 1} de ${partes}: ${contas.length} das ${todas.length} contas pendentes.
`);

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
