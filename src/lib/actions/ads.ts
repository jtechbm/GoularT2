"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { id, now, one, run } from "@/lib/db";
import { assertClientAccess, requireUser } from "@/lib/auth";
import { str, strOrNull, toNumber } from "@/lib/format";

function refresh(clientId?: string) {
  revalidatePath("/ads");
  revalidatePath("/");
  if (clientId) revalidatePath(`/clientes/${clientId}`);
}

/** Registra investimento de Ads por cliente / marketplace / período. */
export async function createAdsAction(formData: FormData) {
  const user = await requireUser();
  const selection = str(formData.get("store_selection"));
  const [selectedClientId, selectedAccountId] = selection ? selection.split("|") : ["", ""];
  const clientId = selectedClientId || str(formData.get("client_id"));
  const accountId = selectedAccountId || strOrNull(formData.get("client_marketplace_id"));
  const periodStart = str(formData.get("period_start"));
  const periodEnd = str(formData.get("period_end")) || periodStart;
  if (!clientId || !periodStart) throw new Error("Cliente e início do período são obrigatórios.");
  await assertClientAccess(user, clientId);
  const account = accountId
    ? await one<{ marketplace: string }>(
        "SELECT marketplace FROM client_marketplaces WHERE id = ? AND client_id = ?",
        accountId,
        clientId,
      )
    : null;
  if (accountId && !account) throw new Error("Loja não encontrada para este cliente.");
  // lançamento sem valor virava uma "campanha sem nome, R$ 0,00" na lista
  if (!(toNumber(formData.get("invested")) > 0) && !(toNumber(formData.get("revenue")) > 0)) {
    throw new Error("Informe o valor investido.");
  }

  await run(
    `INSERT INTO ads_entries (id, client_id, client_marketplace_id, marketplace, campaign, period_start, period_end,
                              invested, revenue, clicks, orders, notes, created_by, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    id(),
    clientId,
    accountId,
    account?.marketplace ?? str(formData.get("marketplace")),
    strOrNull(formData.get("campaign")),
    periodStart,
    periodEnd,
    toNumber(formData.get("invested")),
    toNumber(formData.get("revenue")),
    toNumber(formData.get("clicks")),
    toNumber(formData.get("orders")),
    strOrNull(formData.get("notes")),
    user.id,
    now(),
  );

  refresh(clientId);
  const back = str(formData.get("redirect_to"));
  redirect(back ? `${back}${back.includes("?") ? "&" : "?"}ok=1` : "/ads?ok=1");
}

export async function deleteAdsAction(formData: FormData) {
  const user = await requireUser();
  const clientId = str(formData.get("client_id"));
  await assertClientAccess(user, clientId);
  // linhas da sincronização não se apagam pela tela: voltariam na rodada seguinte
  await run(
    "DELETE FROM ads_entries WHERE id = ? AND client_id = ? AND source = 'manual'",
    str(formData.get("entry_id")),
    clientId,
  );
  refresh(clientId);
  const back = str(formData.get("redirect_to"));
  redirect(back || "/ads");
}
