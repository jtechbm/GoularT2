"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { id, now, one, run } from "@/lib/db";
import { assertCan, assertClientAccess, requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
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

/**
 * Cria tarefa. Duas portas diferentes na mesma ação.
 *
 * Gestor e admin publicam para a equipe e podem atribuir a quem quiserem.
 * O membro só registra demanda que ele mesmo encontrou, e ela já nasce na
 * mão dele: sem isso, um membro poderia empurrar trabalho para os colegas,
 * que é exatamente o que a permissão de distribuir tarefas protege.
 *
 * A tarefa própria não pontua sozinha. Ela segue o mesmo caminho de
 * revisão das outras, e os pontos só saem quando um gestor aprova. Sem
 * isso, qualquer um inventaria tarefas para subir no ranking.
 */
export async function createTaskAction(formData: FormData) {
  const user = await requireUser();
  const distribui = can(user, "tarefas.gerenciar");

  const title = str(formData.get("title"));
  if (!title) throw new Error("A tarefa precisa de um título.");

  const taskId = id();
  const priority = str(formData.get("priority")) || "media";
  const pedido = strOrNull(formData.get("assignee_id"));

  if (!distribui && pedido && pedido !== user.id) {
    throw new Error("Você só pode registrar tarefas para si mesmo.");
  }
  // quem não distribui sempre fica com a própria tarefa
  const assignee = distribui ? pedido : user.id;
  const propria = assignee === user.id && !distribui;

  const clientId = strOrNull(formData.get("client_id"));
  if (clientId) await assertClientAccess(user, clientId);

  await run(
    `INSERT INTO tasks (id, title, description, client_id, priority, status, due_date, points, created_by,
                        assignee_id, claimed_at, requires_evidence, self_created, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    taskId,
    title,
    strOrNull(formData.get("description")),
    clientId,
    priority,
    assignee ? "assumida" : "disponivel",
    strOrNull(formData.get("due_date")),
    pointsFor(priority, toNumber(formData.get("points"))),
    user.id,
    assignee,
    assignee ? now() : null,
    formData.get("requires_evidence") ? 1 : 0,
    propria ? 1 : 0,
    now(),
    now(),
  );

  await logEvent(
    taskId,
    user.id,
    "criada",
    0,
    propria ? "registrada pela própria pessoa" : undefined,
  );
  if (assignee && !propria) await logEvent(taskId, assignee, "assumida", 0, "atribuída na criação");

  refresh();
  redirect(propria ? `/tarefas/${taskId}` : "/tarefas?ok=1");
}

/** Um funcionário pega a task do mural — só funciona se ainda estiver disponível. */
export async function claimTaskAction(formData: FormData) {
  const user = await requireUser();
  const taskId = str(formData.get("task_id"));
  const task = await one<{ status: string }>("SELECT status FROM tasks WHERE id = ?", taskId);
  if (!task || task.status !== "disponivel") redirect("/tarefas?erro=indisponivel");

  // a condição status='disponivel' no UPDATE e o que impede dois
  // funcionários de pegarem a mesma tarefa: quem chega depois atualiza
  // zero linhas e cai no erro, em vez de roubar a tarefa do primeiro
  const linhas = await run(
    "UPDATE tasks SET status='assumida', assignee_id=?, claimed_at=?, updated_at=? WHERE id=? AND status='disponivel'",
    user.id,
    now(),
    now(),
    taskId,
  );
  if (!linhas) redirect("/tarefas?erro=indisponivel");

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

/**
 * O funcionário diz "terminei". Isso NÃO conclui a tarefa.
 *
 * A tarefa vai para revisão e os pontos ficam retidos. Sem esta etapa,
 * concluir e pontuar eram a mesma ação e ninguém conferia nada.
 */
export async function submitTaskAction(formData: FormData) {
  const user = await requireUser();
  const taskId = str(formData.get("task_id"));

  const task = await one<{ status: string; assignee_id: string | null; requires_evidence: number }>(
    "SELECT status, assignee_id, requires_evidence FROM tasks WHERE id = ?",
    taskId,
  );
  if (!task) redirect("/tarefas");

  const pendentes = await one<{ n: number }>(
    "SELECT COUNT(*) AS n FROM task_checklist WHERE task_id = ? AND required = 1 AND done = 0",
    taskId,
  );
  if ((pendentes?.n ?? 0) > 0) {
    throw new Error(`Ainda faltam ${pendentes!.n} itens obrigatórios do checklist.`);
  }

  if (task.requires_evidence) {
    const evid = await one<{ n: number }>("SELECT COUNT(*) AS n FROM task_evidence WHERE task_id = ?", taskId);
    if ((evid?.n ?? 0) === 0) {
      throw new Error("Esta tarefa exige evidência antes de ir para revisão.");
    }
  }

  await run(
    "UPDATE tasks SET status='em_revisao', submitted_at=?, updated_at=?, assignee_id=COALESCE(assignee_id, ?) WHERE id=?",
    now(),
    now(),
    user.id,
    taskId,
  );
  await logEvent(taskId, task.assignee_id ?? user.id, "enviada_revisao");
  refresh();
  redirect("/tarefas?aba=revisao&ok=1");
}

/**
 * Aprova a tarefa e só então libera os pontos.
 *
 * Quem executou não aprova o próprio trabalho. Sem essa checagem, um gestor
 * pegaria a própria tarefa e se autoaprovaria, e a revisão viraria enfeite.
 */
export async function approveTaskAction(formData: FormData) {
  const user = await requireUser();
  assertCan(user, "tarefas.gerenciar", "Somente gestores e admins aprovam tarefas.");
  const taskId = str(formData.get("task_id"));

  const task = await one<{ points: number; assignee_id: string | null; status: string }>(
    "SELECT points, assignee_id, status FROM tasks WHERE id = ?",
    taskId,
  );
  if (!task) redirect("/tarefas");
  if (task.assignee_id === user.id) {
    throw new Error("Você não pode aprovar a própria tarefa. Peça a outro gestor.");
  }

  await run(
    `UPDATE tasks SET status='concluida', completed_at=?, reviewed_at=?, reviewed_by=?, review_note=?,
            updated_at=? WHERE id=?`,
    now(), now(), user.id, strOrNull(formData.get("nota")), now(), taskId,
  );
  // os pontos só existem a partir daqui
  await logEvent(taskId, task.assignee_id ?? user.id, "aprovada", task.points);
  refresh();
  redirect("/tarefas?aba=concluidas&ok=1");
}

/** Reprova e devolve para o executor, com o motivo obrigatório. */
export async function rejectTaskAction(formData: FormData) {
  const user = await requireUser();
  assertCan(user, "tarefas.gerenciar", "Somente gestores e admins revisam tarefas.");
  const taskId = str(formData.get("task_id"));
  const motivo = str(formData.get("nota")).trim();

  if (!motivo) throw new Error("Diga o que precisa mudar. Reprovar sem motivo não ajuda ninguém.");

  const task = await one<{ assignee_id: string | null }>("SELECT assignee_id FROM tasks WHERE id = ?", taskId);
  if (!task) redirect("/tarefas");
  if (task.assignee_id === user.id) {
    throw new Error("Você não pode revisar a própria tarefa.");
  }

  await run(
    `UPDATE tasks SET status='em_andamento', submitted_at=NULL, reviewed_at=?, reviewed_by=?, review_note=?,
            rejections = rejections + 1, updated_at=? WHERE id=?`,
    now(), user.id, motivo, now(), taskId,
  );
  await run(
    "INSERT INTO task_comments (id, task_id, user_id, body, created_at) VALUES (?,?,?,?,?)",
    id(), taskId, user.id, `Ajuste pedido na revisão: ${motivo}`, now(),
  );
  await logEvent(taskId, user.id, "reprovada", 0, motivo);
  refresh();
  redirect("/tarefas?aba=minhas&ok=1");
}

/** Começa o trabalho: de "assumida" para "em andamento". */
export async function startTaskAction(formData: FormData) {
  const user = await requireUser();
  const taskId = str(formData.get("task_id"));
  await run(
    "UPDATE tasks SET status='em_andamento', started_at=COALESCE(started_at, ?), updated_at=? WHERE id=? AND assignee_id=?",
    now(), now(), taskId, user.id,
  );
  await logEvent(taskId, user.id, "iniciada");
  refresh();
  redirect("/tarefas?aba=minhas&ok=1");
}

/** Move a tarefa entre etapas pelo quadro, respeitando quem pode o que. */
export async function moveTaskAction(formData: FormData) {
  const user = await requireUser();
  const taskId = str(formData.get("task_id"));
  const destino = str(formData.get("status"));

  const task = await one<{ status: string; assignee_id: string | null }>(
    "SELECT status, assignee_id FROM tasks WHERE id = ?",
    taskId,
  );
  if (!task) redirect("/tarefas");

  const gestor = can(user, "tarefas.gerenciar");
  const dono = task.assignee_id === user.id;
  // aprovar e reprovar têm ação própria porque mexem em pontos e exigem
  // justificativa; o arraste do quadro não passa por aqui
  if (destino === "concluida") throw new Error("Conclusão passa pela revisão.");
  if (!gestor && !dono) throw new Error("Esta tarefa não é sua.");

  await run("UPDATE tasks SET status=?, updated_at=? WHERE id=?", destino, now(), taskId);
  await logEvent(taskId, user.id, `moveu_para_${destino}`);
  refresh();
  redirect(str(formData.get("redirect_to")) || "/tarefas");
}

export async function reopenTaskAction(formData: FormData) {
  const user = await requireUser();
  assertCan(user, "tarefas.gerenciar", "Somente gestores e admins reabrem tarefas.");
  const taskId = str(formData.get("task_id"));
  await run(
    "UPDATE tasks SET status='em_andamento', completed_at=NULL, reviewed_at=NULL, updated_at=? WHERE id=?",
    now(),
    taskId,
  );
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
