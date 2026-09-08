"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { id, now, run } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { str, strOrNull, toNumber } from "@/lib/format";

function refresh(clientId?: string) {
  revalidatePath("/ads");
  revalidatePath("/");
  if (clientId) revalidatePath(`/clientes/${clientId}`);
}

/** Registra investimento de Ads por cliente / marketplace / período. */
export async function createAdsAction(formData: FormData) {
  const user = await requireUser();
  const clientId = str(formData.get("client_id"));
  const periodStart = str(formData.get("period_start"));
  const periodEnd = str(formData.get("period_end")) || periodStart;
  if (!clientId || !periodStart) throw new Error("Cliente e início do período são obrigatórios.");

  run(
    `INSERT INTO ads_entries (id, client_id, marketplace, campaign, period_start, period_end, invested, revenue,
                              clicks, orders, notes, created_by, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    id(),
    clientId,
    str(formData.get("marketplace")),
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
  await requireUser();
  const clientId = str(formData.get("client_id"));
  run("DELETE FROM ads_entries WHERE id = ?", str(formData.get("entry_id")));
  refresh(clientId);
  const back = str(formData.get("redirect_to"));
  redirect(back || "/ads");
}
