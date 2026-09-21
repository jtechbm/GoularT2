import { all, id, now, run } from "./db.ts";
import { notificar, notificarVarios } from "./notificacoes.ts";
import { rotuloPrazo } from "./prazo-tarefa.ts";

/**
 * Avisa quando o prazo em horas de uma tarefa estoura.
 *
 * Roda a cada navegação (no layout) e no cron. É uma consulta por índice
 * que quase sempre volta vazia, então não pesa; e rodar na navegação faz o
 * aviso chegar minutos depois do estouro, não no dia seguinte.
 *
 * Cada tarefa avisa uma vez só. O UPDATE com "overdue_notified_at IS NULL"
 * é o que garante isso quando duas telas abrem ao mesmo tempo: só uma delas
 * consegue marcar, e só quem marcou avisa.
 */
export async function avisarTarefasAtrasadas(): Promise<number> {
  const agora = now();
  const vencidas = await all<{
    id: string;
    title: string;
    client_id: string | null;
    assignee_id: string | null;
    assignee_name: string | null;
    created_by: string | null;
    sla_hours: number | null;
  }>(
    `SELECT t.id, t.title, t.client_id, t.assignee_id, a.name AS assignee_name, t.created_by, t.sla_hours
       FROM tasks t LEFT JOIN users a ON a.id = t.assignee_id
      WHERE t.deadline_at IS NOT NULL AND t.overdue_notified_at IS NULL AND t.deadline_at < ?
        AND t.status IN ('assumida','em_andamento')`,
    agora,
  );
  if (!vencidas.length) return 0;

  const admins = await all<{ id: string }>("SELECT id FROM users WHERE role = 'admin' AND active = 1");
  let avisadas = 0;

  for (const t of vencidas) {
    const marcou = await run(
      "UPDATE tasks SET overdue_notified_at = ? WHERE id = ? AND overdue_notified_at IS NULL",
      agora,
      t.id,
    );
    if (!marcou) continue;
    avisadas += 1;

    await run(
      "INSERT INTO task_events (id, task_id, user_id, type, points, meta, created_at) VALUES (?,?,?,?,?,?,?)",
      id(),
      t.id,
      t.assignee_id,
      "prazo_estourado",
      0,
      t.sla_hours ? `prazo de ${rotuloPrazo(t.sla_hours)}` : null,
      agora,
    );

    const prazo = t.sla_hours ? ` (prazo de ${rotuloPrazo(t.sla_hours)})` : "";
    // quem criou e os admins: é para eles que o atraso precisa aparecer
    await notificarVarios(
      [...admins.map((a) => a.id), t.created_by ?? ""].filter((u) => u && u !== t.assignee_id),
      {
        actorId: null,
        type: "prazo",
        title: `${t.assignee_name ?? "Alguém"} estourou o prazo de "${t.title}"${prazo}`,
        href: `/tarefas/${t.id}`,
        taskId: t.id,
        clientId: t.client_id,
      },
    );
    if (t.assignee_id) {
      await notificar({
        userId: t.assignee_id,
        actorId: null,
        type: "prazo",
        title: `O prazo de "${t.title}" estourou${prazo}`,
        body: "O gestor foi avisado. Se falta pouco, termine e envie para revisão.",
        href: `/tarefas/${t.id}`,
        taskId: t.id,
        clientId: t.client_id,
      });
    }
  }
  return avisadas;
}
