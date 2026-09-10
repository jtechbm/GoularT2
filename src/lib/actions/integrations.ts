"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomBytes } from "node:crypto";
import { all, id, now, one, run } from "@/lib/db";
import { assertCan, assertClientAccess, requirePermission, requireUser } from "@/lib/auth";
import { str } from "@/lib/format";
import { adapterFor, syncAccount } from "@/lib/integrations";
import { currentMonth } from "@/lib/format";

const DIAS_VALIDADE = 7;

/**
 * Gera o link de autorização que o Kadu manda para o lojista pelo WhatsApp.
 * Token longo, de uso único e com prazo — é ele que autoriza a gravação no
 * callback, já que o lojista não tem sessão no Elleva.
 */
export async function generateAuthLinkAction(formData: FormData) {
  const user = await requirePermission("integracoes.gerenciar");
  const accountId = str(formData.get("account_id"));
  const back = str(formData.get("redirect_to")) || "/integracoes";

  const conta = await one<{ marketplace: string }>(
    "SELECT marketplace FROM client_marketplaces WHERE id = ?",
    accountId,
  );
  if (!conta) redirect(`${back}${back.includes("?") ? "&" : "?"}erro=conta`);

  const adapter = adapterFor(conta.marketplace);
  if (!adapter.isConfigured()) {
    redirect(`${back}${back.includes("?") ? "&" : "?"}erro=env&mk=${conta.marketplace}`);
  }

  const token = randomBytes(32).toString("hex");
  const expira = new Date(Date.now() + DIAS_VALIDADE * 864e5).toISOString();

  await run(
    `UPDATE client_marketplaces
        SET auth_token = ?, auth_expires_at = ?, auth_used_at = NULL, auth_created_by = ?
      WHERE id = ?`,
    token,
    expira,
    user.id,
    accountId,
  );

  revalidatePath("/integracoes");
  redirect(`${back}${back.includes("?") ? "&" : "?"}link=${accountId}`);
}

/**
 * Caminho curto: um clique na página do cliente e o link fica pronto.
 * Cria a conta do marketplace se ainda não existir — quem usa não precisa
 * saber que existe um cadastro de "canal" por trás.
 */
export async function requestAccessAction(formData: FormData) {
  const user = await requirePermission("integracoes.gerenciar");
  const clientId = str(formData.get("client_id"));
  const marketplace = str(formData.get("marketplace"));

  const adapter = adapterFor(marketplace);
  if (!adapter.isConfigured()) {
    redirect(`/clientes/${clientId}?erro=env&mk=${marketplace}`);
  }

  let conta = await one<{ id: string }>(
    "SELECT id FROM client_marketplaces WHERE client_id = ? AND marketplace = ? ORDER BY created_at LIMIT 1",
    clientId,
    marketplace,
  );

  if (!conta) {
    const novo = id();
    await run(
      `INSERT INTO client_marketplaces (id, client_id, marketplace, status, created_at)
       VALUES (?,?,?,'pendente',?)`,
      novo,
      clientId,
      marketplace,
      now(),
    );
    conta = { id: novo };
  }

  const token = randomBytes(32).toString("hex");
  await run(
    `UPDATE client_marketplaces
        SET auth_token = ?, auth_expires_at = ?, auth_used_at = NULL, auth_created_by = ?
      WHERE id = ?`,
    token,
    new Date(Date.now() + DIAS_VALIDADE * 864e5).toISOString(),
    user.id,
    conta.id,
  );

  revalidatePath(`/clientes/${clientId}`);
  revalidatePath("/integracoes");
  redirect(`/clientes/${clientId}?acesso=${marketplace}`);
}

/** Invalida o link sem mexer na conexão já feita. */
export async function revokeAuthLinkAction(formData: FormData) {
  await requirePermission("integracoes.gerenciar");
  const accountId = str(formData.get("account_id"));
  const back = str(formData.get("redirect_to")) || "/integracoes";
  await run(
    "UPDATE client_marketplaces SET auth_token = NULL, auth_expires_at = NULL WHERE id = ?",
    accountId,
  );
  revalidatePath("/integracoes");
  redirect(back);
}

/** Sincroniza o fechamento do mês de uma conta. */
export async function syncAccountAction(formData: FormData) {
  const user = await requireUser();
  const accountId = str(formData.get("account_id"));
  const refMonth = str(formData.get("ref_month")) || currentMonth();
  const back = str(formData.get("redirect_to")) || "/integracoes";

  // sem isto qualquer pessoa logada puxava os números de qualquer conta,
  // bastando conhecer o id
  const conta = await one<{ client_id: string }>(
    "SELECT client_id FROM client_marketplaces WHERE id = ?",
    accountId,
  );
  if (!conta) throw new Error("Conta não encontrada.");
  assertCan(user, "integracoes.sincronizar", "Seu papel não permite sincronizar contas.");
  await assertClientAccess(user, conta.client_id);

  const outcome = await syncAccount(accountId, refMonth, user.id);

  revalidatePath("/integracoes");
  revalidatePath("/");
  redirect(`${back}${back.includes("?") ? "&" : "?"}sync=${outcome.status}`);
}

/** Sincroniza todas as contas conectadas de um mês. */
export async function syncAllAction(formData: FormData) {
  const user = await requirePermission("integracoes.gerenciar");
  const refMonth = str(formData.get("ref_month")) || currentMonth();
  const accounts = await all<{ id: string }>(
    "SELECT id FROM client_marketplaces WHERE status IN ('conectado','erro')",
  );

  let ok = 0;
  for (const account of accounts) {
    const outcome = await syncAccount(account.id, refMonth, user.id);
    if (outcome.ok) ok += 1;
  }

  revalidatePath("/integracoes");
  revalidatePath("/");
  redirect(`/integracoes?sync=lote&ok=${ok}&total=${accounts.length}`);
}

/** Desconecta a conta, apagando os tokens guardados. */
export async function disconnectAccountAction(formData: FormData) {
  await requirePermission("integracoes.gerenciar");
  const accountId = str(formData.get("account_id"));
  await run(
    `UPDATE client_marketplaces
        SET credentials = NULL, status = 'pendente', last_error = NULL,
            authorized_at = NULL, auth_token = NULL, auth_expires_at = NULL, auth_used_at = NULL
      WHERE id = ?`,
    accountId,
  );
  revalidatePath("/integracoes");
  redirect("/integracoes?ok=1");
}
