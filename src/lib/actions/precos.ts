"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertCan, assertClientAccess, requireUser, visibleClientIds } from "@/lib/auth";
import { str } from "@/lib/format";
import { buscarConcorrentes, fonteDe, produtoDoUsuario } from "@/lib/precos/comparador";
import { contaConectada, importarAnuncios } from "@/lib/precos/produtos";

/**
 * O texto que a pessoa vê quando a coleta falha.
 *
 * redirect() do Next funciona lançando um erro próprio, então ele nunca pode
 * ser engolido por este tratamento: é por isso que os try/catch daqui
 * envolvem só a chamada que vai à rede, e o redirect fica fora.
 */
function recado(e: unknown): string {
  return e instanceof Error ? e.message : "Não consegui falar com o marketplace agora.";
}

/** Importa os anúncios da loja para o comparador ter de onde partir. */
export async function importarAnunciosAction(formData: FormData) {
  const user = await requireUser();
  assertCan(user, "integracoes.sincronizar");

  const conta = await contaConectada(str(formData.get("conta_id")));
  if (!conta) throw new Error("Conta não encontrada ou ainda não conectada.");
  await assertClientAccess(user, conta.client_id);

  // marketplace fora do ar, permissao faltando ou token vencido sao recados
  // para a pessoa, nao defeito do sistema: voltam na propria tela em vez de
  // derrubar a pagina inteira numa tela de erro
  let total: number;
  try {
    total = await importarAnuncios(conta);
  } catch (e) {
    revalidatePath("/precos");
    redirect(`/precos?cliente=${conta.client_id}&erro=${encodeURIComponent(recado(e))}`);
  }

  revalidatePath("/precos");
  redirect(`/precos?cliente=${conta.client_id}&importados=${total}`);
}

/**
 * Dispara a busca de concorrentes na web.
 *
 * A verificação de permissão se repete aqui, e não só na renderização da
 * página: a ação gasta dinheiro a cada execução, e uma ação de servidor pode
 * ser chamada direto, sem passar pela tela que a esconde.
 */
export async function buscarConcorrentesAction(formData: FormData) {
  const user = await requireUser();
  assertCan(user, "precos.pesquisar", "Somente gestores e admins disparam a busca de preços.");

  const produtoId = str(formData.get("produto_id"));
  const produto = await produtoDoUsuario(produtoId, await visibleClientIds(user));
  if (!produto) throw new Error("Produto não encontrado.");
  if (fonteDe(produto.marketplace) === "api") {
    throw new Error("No Mercado Livre os preços vêm do catálogo oficial, sem busca na web.");
  }

  const volta = `/precos?cliente=${produto.client_id}&produto=${produto.id}`;
  let resultado: { gravados: number; descartados: number; proprios: number };
  try {
    resultado = await buscarConcorrentes(produto, user.id);
  } catch (e) {
    revalidatePath("/precos");
    redirect(`${volta}&erro=${encodeURIComponent(recado(e))}`);
  }

  revalidatePath("/precos");
  redirect(
    `${volta}&achados=${resultado.gravados}&fora=${resultado.descartados}&proprios=${resultado.proprios}`,
  );
}
