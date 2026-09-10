"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { id, now, one, run } from "@/lib/db";
import { assertCan, requireUser } from "@/lib/auth";
import { str, strOrNull, toNumber } from "@/lib/format";
import { TASK_PRIORITIES } from "@/lib/types";

function refresh() {
  revalidatePath("/tarefas");
  revalidatePath("/");
  revalidatePath("/equipe");
}

/** Registra o evento — é a trilha que a gamificação vai consumir depois. */
async function logEvent(taskId: string, userId: string | null, type: string, points = 0, meta?: string) {
  await run(
    "INSERT INTO task_events (id, task_id, user_id, type, points, meta, created_at) VALUES (?,?,?,?,?,?,?)",
    id(),
    taskId,
    userId,
    type,
    points,
    meta ?? null,
    now(),
  );
}

function pointsFor(priority: string, override?: number): number {
  if (override && override > 0) return override;
  return TASK_PRIORITIES.find((p) => p.value === priority)?.points ?? 10;
}

export async function createTaskAction(formData: FormData) {
  const user = await requireUser();
  assertCan(user, "tarefas.gerenciar", "Somente gestores e admins criam tarefas para a equipe.");

  const title = str(formData.get("title"));
  if (!title) throw new Error("A tarefa precisa de um título.");

  const taskId = id();
  const priority = str(formData.get("priority")) || "media";
  const assignee = strOrNull(formData.get("assignee_id"));

  await run(
    `INSERT INTO tasks (id, title, description, client_id, priority, status, due_date, points, created_by,
                        assignee_id, claimed_at, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    taskId,
    title,
    strOrNull(formData.get("description")),
    strOrNull(formData.get("client_id")),
    priority,
    assignee ? "em_andamento" : "disponivel",
    strOrNull(formData.get("due_date")),
    pointsFor(priority, toNumber(formData.get("points"))),
    user.id,
    assignee,
    assignee ? now() : null,
    now(),
    now(),
  );

  await logEvent(taskId, user.id, "criada");
  if (assignee) await logEvent(taskId, assignee, "assumida", 0, "atribuída na criação");

  refresh();
  redirect("/tarefas?ok=1");
}

/** Um funcionário pega a task do mural — só funciona se ainda estiver disponível. */
export async function claimTaskAction(formData: FormData) {
  const user = await requireUser();
  const taskId = str(formData.get("task_id"));
  const task = await one<{ status: string }>("SELECT status FROM tasks WHERE id = ?", taskId);
  if (!task || task.status !== "disponivel") redirect("/tarefas?erro=indisponivel");

  await run(
    "UPDATE tasks SET status='em_andamento', assignee_id=?, claimed_at=?, updated_at=? WHERE id=? AND status='disponivel'",
    user.id,
    now(),
    now(),
    taskId,
  );
  await logEvent(taskId, user.id, "assumida");
  refresh();
  redirect("/tarefas?aba=minhas&ok=1");
}

/** Devolve a task para o mural. */
export async function releaseTaskAction(formData: FormData) {
  const user = await requireUser();
  const taskId = str(formData.get("task_id"));
  await run(
    "UPDATE tasks SET status='disponivel', assignee_id=NULL, claimed_at=NULL, updated_at=? WHERE id=?",
    now(),
    taskId,
  );
  await logEvent(taskId, user.id, "devolvida");
  refresh();
  redirect("/tarefas?ok=1");
}

export async function completeTaskAction(formData: FormData) {
  const user = await requireUser();
  const taskId = str(formData.get("task_id"));
  const task = await one<{ points: number; assignee_id: string | null }>(
    "SELECT points, assignee_id FROM tasks WHERE id = ?",
    taskId,
  );
  if (!task) redirect("/tarefas");

  await run(
    "UPDATE tasks SET status='concluida', completed_at=?, updated_at=?, assignee_id=COALESCE(assignee_id, ?) WHERE id=?",
    now(),
    now(),
    user.id,
    taskId,
  );
  await logEvent(taskId, task.assignee_id ?? user.id, "concluida", task.points);
  refresh();
  redirect("/tarefas?aba=concluidas&ok=1");
}

export async function reopenTaskAction(formData: FormData) {
  const user = await requireUser();
  const taskId = str(formData.get("task_id"));
  await run("UPDATE tasks SET status='em_andamento', completed_at=NULL, updated_at=? WHERE id=?", now(), taskId);
  await logEvent(taskId, user.id, "reaberta");
  refresh();
  redirect("/tarefas?aba=minhas");
}

export async function updateTaskAction(formData: FormData) {
  const user = await requireUser();
  assertCan(user, "tarefas.gerenciar", "Somente gestores e admins editam a tarefa.");
  const taskId = str(formData.get("task_id"));
  const priority = str(formData.get("priority"));

  await run(
    `UPDATE tasks SET title=?, description=?, client_id=?, priority=?, due_date=?, points=?, assignee_id=?,
            status=?, updated_at=? WHERE id=?`,
    str(formData.get("title")),
    strOrNull(formData.get("description")),
    strOrNull(formData.get("client_id")),
    priority,
    strOrNull(formData.get("due_date")),
    pointsFor(priority, toNumber(formData.get("points"))),
    strOrNull(formData.get("assignee_id")),
    str(formData.get("status")),
    now(),
    taskId,
  );
  await logEvent(taskId, user.id, "editada");
  refresh();
  redirect("/tarefas?ok=1");
}

export async function deleteTaskAction(formData: FormData) {
  const user = await requireUser();
  assertCan(user, "tarefas.gerenciar", "Somente gestores e admins excluem tarefas.");
  await run("DELETE FROM tasks WHERE id = ?", str(formData.get("task_id")));
  refresh();
  redirect("/tarefas");
}
