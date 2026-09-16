"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertCan, assertClientAccess, requireUser, visibleClientIds } from "@/lib/auth";
import { str } from "@/lib/format";
import { buscarConcorrentes, fonteDe, produtoDoUsuario } from "@/lib/precos/comparador";
import { contaConectada, importarAnuncios } from "@/lib/precos/produtos";

/** Importa os anúncios da loja para o comparador ter de onde partir. */
export async function importarAnunciosAction(formData: FormData) {
  const user = await requireUser();
  assertCan(user, "integracoes.sincronizar");

  const conta = await contaConectada(str(formData.get("conta_id")));
  if (!conta) throw new Error("Conta não encontrada ou ainda não conectada.");
  await assertClientAccess(user, conta.client_id);

  const total = await importarAnuncios(conta);
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

  const { gravados, descartados } = await buscarConcorrentes(produto, user.id);
  revalidatePath("/precos");
  redirect(`/precos?cliente=${produto.client_id}&produto=${produto.id}&achados=${gravados}&fora=${descartados}`);
}
