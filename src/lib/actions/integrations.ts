"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { all, one, run } from "@/lib/db";
import { requireRole, requireUser } from "@/lib/auth";
import { str } from "@/lib/format";
import { adapterFor, syncAccount } from "@/lib/integrations";
import { currentMonth } from "@/lib/format";

/** Leva o usuário para o consentimento OAuth do marketplace. */
export async function connectAccountAction(formData: FormData) {
  await requireRole("admin", "gestor");
  const accountId = str(formData.get("account_id"));
  const account = await one<{ marketplace: string; client_id: string }>(
    "SELECT marketplace, client_id FROM client_marketplaces WHERE id = ?",
    accountId,
  );
  if (!account) redirect("/integracoes?erro=conta");

  const adapter = adapterFor(account.marketplace);
  if (!adapter.isConfigured()) {
    redirect(`/integracoes?erro=env&mk=${account.marketplace}`);
  }
  redirect(adapter.authorizeUrl(accountId));
}

/** Sincroniza o fechamento do mês de uma conta. */
export async function syncAccountAction(formData: FormData) {
  const user = await requireUser();
  const accountId = str(formData.get("account_id"));
  const refMonth = str(formData.get("ref_month")) || currentMonth();
  const back = str(formData.get("redirect_to")) || "/integracoes";

  const outcome = await syncAccount(accountId, refMonth, user.id);

  revalidatePath("/integracoes");
  revalidatePath("/");
  redirect(`${back}${back.includes("?") ? "&" : "?"}sync=${outcome.status}`);
}

/** Sincroniza todas as contas conectadas de um mês. */
export async function syncAllAction(formData: FormData) {
  const user = await requireUser();
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
  await requireRole("admin", "gestor");
  const accountId = str(formData.get("account_id"));
  await run(
    "UPDATE client_marketplaces SET credentials = NULL, status = 'pendente', last_error = NULL WHERE id = ?",
    accountId,
  );
  revalidatePath("/integracoes");
  redirect("/integracoes?ok=1");
}
