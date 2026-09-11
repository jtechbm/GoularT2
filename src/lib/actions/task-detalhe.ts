"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { id, now, one, run } from "@/lib/db";
import { assertCan, requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { str, strOrNull } from "@/lib/format";
import { notificar, notificarVarios, resolverMencoes, resumir } from "@/lib/notificacoes";

function refresh(taskId: string) {
  revalidatePath("/tarefas");
  revalidatePath(`/tarefas/${taskId}`);
  revalidatePath("/");
}

async function tarefaOuErro(taskId: string) {
  const t = await one<{ id: string; assignee_id: string | null; status: string }>(
    "SELECT id, assignee_id, status FROM tasks WHERE id = ?",
    taskId,
  );
  if (!t) throw new Error("Tarefa não encontrada.");
  return t;
}

/** Quem executa e quem gerencia podem mexer; o resto só lê. */
async function podeEditar(taskId: string) {
  const user = await requireUser();
  const t = await tarefaOuErro(taskId);
  if (t.assignee_id !== user.id && !can(user, "tarefas.gerenciar")) {
    throw new Error("Esta tarefa não é sua.");
  }
  return { user, task: t };
}

export async function addChecklistItemAction(formData: FormData) {
  const taskId = str(formData.get("task_id"));
  const { user } = await podeEditar(taskId);
  const label = str(formData.get("label")).trim();
  if (!label) redirect(`/tarefas/${taskId}`);

  const ultimo = await one<{ pos: number }>(
    "SELECT COALESCE(MAX(position), 0) AS pos FROM task_checklist WHERE task_id = ?",
    taskId,
  );

  await run(
    `INSERT INTO task_checklist (id, task_id, label, required, done, position, created_at)
     VALUES (?,?,?,?,0,?,?)`,
    id(),
    taskId,
    label,
    formData.get("required") ? 1 : 0,
    (ultimo?.pos ?? 0) + 1,
    now(),
  );
  void user;
  refresh(taskId);
  redirect(`/tarefas/${taskId}`);
}

export async function toggleChecklistItemAction(formData: FormData) {
  const taskId = str(formData.get("task_id"));
  const { user } = await podeEditar(taskId);
  const itemId = str(formData.get("item_id"));

  const item = await one<{ done: number }>("SELECT done FROM task_checklist WHERE id = ?", itemId);
  if (!item) redirect(`/tarefas/${taskId}`);

  const marcando = item.done === 0;
  await run(
    "UPDATE task_checklist SET done = ?, done_by = ?, done_at = ? WHERE id = ?",
    marcando ? 1 : 0,
    marcando ? user.id : null,
    marcando ? now() : null,
    itemId,
  );
  refresh(taskId);
  redirect(`/tarefas/${taskId}`);
}

export async function removeChecklistItemAction(formData: FormData) {
  const taskId = str(formData.get("task_id"));
  await podeEditar(taskId);
  await run("DELETE FROM task_checklist WHERE id = ?", str(formData.get("item_id")));
  refresh(taskId);
  redirect(`/tarefas/${taskId}`);
}

/**
 * Anexa evidência do trabalho.
 *
 * O sistema não hospeda arquivo. Imagem e documento entram como link para
 * onde já estão (Drive, Sheets, o painel do marketplace). Guardar binário
 * aqui traria backup, limite de espaço e uma tela de upload para manter,
 * sem resolver nada que um link não resolva.
 */
export async function addEvidenceAction(formData: FormData) {
  const taskId = str(formData.get("task_id"));
  const { user } = await podeEditar(taskId);

  const url = str(formData.get("url")).trim();
  const body = str(formData.get("body")).trim();
  if (!url && !body) redirect(`/tarefas/${taskId}`);

  await run(
    "INSERT INTO task_evidence (id, task_id, kind, url, body, user_id, created_at) VALUES (?,?,?,?,?,?,?)",
    id(),
    taskId,
    url ? "link" : "nota",
    url || null,
    body || null,
    user.id,
    now(),
  );
  refresh(taskId);
  redirect(`/tarefas/${taskId}`);
}

export async function removeEvidenceAction(formData: FormData) {
  const taskId = str(formData.get("task_id"));
  await podeEditar(taskId);
  await run("DELETE FROM task_evidence WHERE id = ?", str(formData.get("evidence_id")));
  refresh(taskId);
  redirect(`/tarefas/${taskId}`);
}

/** Comentar é liberado para a equipe toda: revisão precisa de conversa. */
export async function addTaskCommentAction(formData: FormData) {
  const user = await requireUser();
  const taskId = str(formData.get("task_id"));
  const body = str(formData.get("body")).trim();
  if (!body) redirect(`/tarefas/${taskId}`);

  const task = await tarefaOuErro(taskId);
  await run(
    "INSERT INTO task_comments (id, task_id, user_id, body, created_at) VALUES (?,?,?,?,?)",
    id(),
    taskId,
    user.id,
    body,
    now(),
  );

  const titulo = await one<{ title: string }>("SELECT title FROM tasks WHERE id = ?", taskId);
  const href = `/tarefas/${taskId}`;

  // quem foi citado recebe aviso de menção; o responsável recebe aviso de
  // comentário. Quem é as duas coisas recebe só a menção, que é mais
  // específica — dois avisos do mesmo comentário viram ruído.
  const { ids: mencionados } = await resolverMencoes(body);
  await notificarVarios(mencionados, {
    actorId: user.id,
    type: "mencao",
    title: `${user.name} citou você em "${titulo?.title ?? "uma tarefa"}"`,
    body: resumir(body),
    href,
    taskId,
  });

  if (task.assignee_id && !mencionados.includes(task.assignee_id)) {
    await notificar({
      userId: task.assignee_id,
      actorId: user.id,
      type: "comentario",
      title: `${user.name} comentou em "${titulo?.title ?? "sua tarefa"}"`,
      body: resumir(body),
      href,
      taskId,
    });
  }

  refresh(taskId);
  redirect(`/tarefas/${taskId}`);
}

/** O gestor liga ou desliga a exigência de evidência nesta tarefa. */
export async function toggleEvidenceRequiredAction(formData: FormData) {
  const user = await requireUser();
  assertCan(user, "tarefas.gerenciar", "Somente gestores e admins exigem evidência.");
  const taskId = str(formData.get("task_id"));
  await run(
    "UPDATE tasks SET requires_evidence = 1 - requires_evidence, updated_at = ? WHERE id = ?",
    now(),
    taskId,
  );
  refresh(taskId);
  redirect(`/tarefas/${taskId}`);
}

export async function setTaskNoteAction(formData: FormData) {
  const taskId = str(formData.get("task_id"));
  await podeEditar(taskId);
  await run(
    "UPDATE tasks SET description = ?, updated_at = ? WHERE id = ?",
    strOrNull(formData.get("description")),
    now(),
    taskId,
  );
  refresh(taskId);
  redirect(`/tarefas/${taskId}`);
}
