"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { now, one, run } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { str } from "@/lib/format";

/**
 * Marcar como lida e ir para o assunto, numa ação só.
 *
 * Separar as duas coisas faria a pessoa clicar no aviso, resolver o
 * assunto e voltar para achar o mesmo aviso ainda em negrito.
 */
export async function abrirNotificacaoAction(formData: FormData) {
  const user = await requireUser();
  const notifId = str(formData.get("notification_id"));

  const n = await one<{ href: string; user_id: string }>(
    "SELECT href, user_id FROM notifications WHERE id = ?",
    notifId,
  );
  // notificação é de uma pessoa só: ninguém abre a do colega
  if (!n || n.user_id !== user.id) redirect("/notificacoes");

  await run("UPDATE notifications SET read_at = ? WHERE id = ? AND read_at IS NULL", now(), notifId);
  revalidatePath("/notificacoes");
  redirect(n.href);
}

export async function marcarLidaAction(formData: FormData) {
  const user = await requireUser();
  await run(
    "UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ? AND read_at IS NULL",
    now(),
    str(formData.get("notification_id")),
    user.id,
  );
  revalidatePath("/notificacoes");
  revalidatePath("/");
  redirect("/notificacoes");
}

export async function marcarTodasLidasAction() {
  const user = await requireUser();
  await run(
    "UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL",
    now(),
    user.id,
  );
  revalidatePath("/notificacoes");
  revalidatePath("/");
  redirect("/notificacoes");
}
