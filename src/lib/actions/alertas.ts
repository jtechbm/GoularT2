"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { id, now, run } from "@/lib/db";
import { assertClientAccess, requireUser } from "@/lib/auth";
import { str, strOrNull } from "@/lib/format";
import { TASK_PRIORITIES } from "@/lib/types";

/**
 * Marca um alerta como resolvido.
 *
 * O alerta em si não é gravado, só esta marcação. A chave carrega o mês,
 * então o mesmo problema no mês seguinte volta a aparecer, que é o
 * comportamento desejado: ninguém "resolve para sempre" uma queda de
 * faturamento.
 */
export async function resolverAlertaAction(formData: FormData) {
  const user = await requireUser();
  const key = str(formData.get("alert_key"));
  const clientId = strOrNull(formData.get("client_id"));
  if (!key) throw new Error("Alerta não informado.");
  if (clientId) await assertClientAccess(user, clientId);

  await run(
    `INSERT INTO alert_resolutions (id, alert_key, client_id, kind, ref_month, note, resolved_by, resolved_at)
     VALUES (?,?,?,?,?,?,?,?)
     ON CONFLICT (alert_key) DO UPDATE SET note = EXCLUDED.note, resolved_by = EXCLUDED.resolved_by,
                                           resolved_at = EXCLUDED.resolved_at`,
    id(),
    key,
    clientId,
    str(formData.get("kind")),
    strOrNull(formData.get("ref_month")),
    strOrNull(formData.get("note")),
    user.id,
    now(),
  );

  revalidatePath("/alertas");
  revalidatePath("/");
  redirect(str(formData.get("redirect_to")) || "/alertas");
}

/** Reabre um alerta que alguém marcou como resolvido por engano. */
export async function reabrirAlertaAction(formData: FormData) {
  await requireUser();
  await run("DELETE FROM alert_resolutions WHERE alert_key = ?", str(formData.get("alert_key")));
  revalidatePath("/alertas");
  revalidatePath("/");
  redirect(str(formData.get("redirect_to")) || "/alertas");
}

/**
 * Cria uma tarefa a partir do alerta e já a marca como resolvida.
 *
 * A tarefa nasce disponível, sem dono, para alguém da equipe pegar. Marcar
 * o alerta como resolvido aqui é proposital: o problema virou trabalho
 * rastreado, e deixar os dois abertos faria a mesma coisa cobrar atenção
 * em duas listas.
 */
export async function criarTarefaDoAlertaAction(formData: FormData) {
  const user = await requireUser();
  const clientId = strOrNull(formData.get("client_id"));
  const titulo = str(formData.get("titulo"));
  const key = str(formData.get("alert_key"));
  if (!titulo) throw new Error("Título da tarefa é obrigatório.");
  if (clientId) await assertClientAccess(user, clientId);

  const prioridade = str(formData.get("prioridade")) || "alta";
  const pontos = TASK_PRIORITIES.find((p) => p.value === prioridade)?.points ?? 20;
  const taskId = id();

  await run(
    `INSERT INTO tasks (id, title, description, client_id, priority, status, due_date, points, created_by,
                        created_at, updated_at)
     VALUES (?,?,?,?,?,'disponivel',NULL,?,?,?,?)`,
    taskId,
    titulo,
    `Criada a partir de um alerta: ${str(formData.get("detalhe"))}`,
    clientId,
    prioridade,
    pontos,
    user.id,
    now(),
    now(),
  );

  await run(
    `INSERT INTO alert_resolutions (id, alert_key, client_id, kind, ref_month, note, resolved_by, resolved_at)
     VALUES (?,?,?,?,?,?,?,?)
     ON CONFLICT (alert_key) DO UPDATE SET note = EXCLUDED.note, resolved_by = EXCLUDED.resolved_by,
                                           resolved_at = EXCLUDED.resolved_at`,
    id(),
    key,
    clientId,
    str(formData.get("kind")),
    strOrNull(formData.get("ref_month")),
    "Virou tarefa",
    user.id,
    now(),
  );

  revalidatePath("/alertas");
  revalidatePath("/tarefas");
  revalidatePath("/");
  redirect(`/tarefas?destaque=${taskId}`);
}
