"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertCan, assertClientAccess, requireUser, visibleClientIds } from "@/lib/auth";
import { currentMonth, str } from "@/lib/format";
import { coletarDossie, lojaVisivel } from "@/lib/analise/coleta";
import { analisarLoja } from "@/lib/analise/llm";
import { gravarAnalise } from "@/lib/analise/repositorio";

/** O teto combinado: a ação inteira cabe em 30 segundos. */
const TETO_MS = 30_000;

function recado(e: unknown): string {
  return e instanceof Error ? e.message : "Não consegui analisar a loja agora.";
}

/**
 * Manda a IA analisar uma loja.
 *
 * A permissão é conferida aqui, e não só na tela: a ação gasta dinheiro a cada
 * execução, e ação de servidor pode ser chamada direto, sem passar pelo botão
 * que a esconde.
 *
 * O orçamento de tempo é repartido: o que sobrar dos 30 segundos depois da
 * coleta é o que o modelo tem para pensar. Assim a conta fecha mesmo quando o
 * banco está lento, em vez de somar 3 + 25 e estourar.
 */
export async function analisarLojaAction(formData: FormData) {
  const user = await requireUser();
  assertCan(user, "analise.rodar", "Somente o admin dispara a análise da loja.");

  const escopo = await visibleClientIds(user);
  const loja = await lojaVisivel(str(formData.get("loja_id")), escopo);
  if (!loja) throw new Error("Loja não encontrada ou ainda não conectada.");
  await assertClientAccess(user, loja.client_id);

  const refMonth = str(formData.get("mes")) || currentMonth();
  const volta = `/analise?loja=${loja.id}&mes=${refMonth}`;
  const comecou = Date.now();

  let analiseId: string;
  try {
    const dossie = await coletarDossie(loja, refMonth);
    const sobrou = TETO_MS - (Date.now() - comecou) - 3000;
    const resultado = await analisarLoja(dossie, Math.max(8000, sobrou));
    analiseId = await gravarAnalise({
      clientId: loja.client_id,
      lojaId: loja.id,
      marketplace: loja.marketplace,
      refMonth,
      dossie,
      resultado,
      duracaoMs: Date.now() - comecou,
      userId: user.id,
    });
  } catch (e) {
    revalidatePath("/analise");
    redirect(`${volta}&erro=${encodeURIComponent(recado(e))}`);
  }

  revalidatePath("/analise");
  redirect(`${volta}&a=${analiseId}&pronta=1`);
}
