import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getTask, taskDetail } from "@/lib/queries";
import { dateBR, dateTimeBR, relativeBR } from "@/lib/format";
import { Avatar, Card, Chip, Empty, Field, PageHeader, Stat } from "@/components/ui";
import { SubmitButton } from "@/components/submit";
import {
  approveTaskAction,
  rejectTaskAction,
  releaseTaskAction,
  reopenTaskAction,
  startTaskAction,
  submitTaskAction,
} from "@/lib/actions/tasks";
import {
  addChecklistItemAction,
  addEvidenceAction,
  addTaskCommentAction,
  removeChecklistItemAction,
  removeEvidenceAction,
  toggleChecklistItemAction,
  toggleEvidenceRequiredAction,
} from "@/lib/actions/task-detalhe";
import { TASK_COLUMNS } from "@/lib/types";

export default async function TarefaPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  const task = await getTask(id);
  if (!task) notFound();

  const { checklist, evidencias, comentarios, eventos } = await taskDetail(id);
  const manager = can(user, "tarefas.gerenciar");
  const meu = task.assignee_id === user.id;
  const podeEditar = meu || manager;

  const obrigatoriosPendentes = checklist.filter((c) => c.required && !c.done);
  const faltaEvidencia = task.requires_evidence === 1 && evidencias.length === 0;
  const podeEnviar = meu && task.status === "em_andamento" && !obrigatoriosPendentes.length && !faltaEvidencia;
  // quem executou não valida o próprio trabalho
  const podeRevisar = manager && task.status === "em_revisao" && task.assignee_id !== user.id;

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/tarefas" className="hover:text-brand">
            Tarefas
          </Link>
        }
        title={task.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Chip tone={task.status === "concluida" ? "ok" : task.status === "em_revisao" ? "warn" : "brand"}>
              {TASK_COLUMNS.find((c) => c.value === task.status)?.label ?? task.status}
            </Chip>
            <Chip tone="neutral">{task.priority}</Chip>
            <Chip tone="neutral">{task.points} pts</Chip>
            {task.self_created === 1 && <Chip tone="info">registrada pelo executor</Chip>}
            {task.client_name && (
              <Link href={`/clientes/${task.client_id}`} className="text-xs text-muted hover:text-brand">
                {task.client_name}
              </Link>
            )}
            {task.due_date && <span className="text-xs text-dim">prazo {dateBR(task.due_date)}</span>}
          </span>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Responsável"
          value={task.assignee_name ?? "sem dono"}
          tone={task.assignee_name ? "brand" : "warn"}
        />
        <Stat
          label="Checklist"
          value={checklist.length ? `${checklist.filter((c) => c.done).length}/${checklist.length}` : "—"}
          hint={obrigatoriosPendentes.length ? `${obrigatoriosPendentes.length} obrigatórios abertos` : "sem pendência"}
          tone={obrigatoriosPendentes.length ? "warn" : "ok"}
        />
        <Stat
          label="Evidências"
          value={String(evidencias.length)}
          hint={task.requires_evidence ? "exigida nesta tarefa" : "opcional"}
          tone={faltaEvidencia ? "bad" : "neutral"}
        />
        <Stat
          label="Voltas na revisão"
          value={String(task.rejections)}
          hint={task.rejections ? "retrabalho" : "nenhuma"}
          tone={task.rejections ? "warn" : "ok"}
        />
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          {task.description && (
            <Card title="Descrição">
              <p className="whitespace-pre-wrap text-sm text-muted">{task.description}</p>
            </Card>
          )}

          {task.status === "em_revisao" && (
            <Card
              title="Revisão"
              subtitle={
                task.submitted_at ? `Enviada ${relativeBR(task.submitted_at)}` : "Aguardando o gestor"
              }
              actions={<Chip tone="warn">esperando decisão</Chip>}
            >
              {task.self_created === 1 && (
                <p className="mb-3 rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">
                  Esta tarefa foi registrada pela própria pessoa que a executou. Confira se o escopo e a pontuação
                  fazem sentido antes de aprovar.
                </p>
              )}
              {podeRevisar ? (
                <div className="space-y-3">
                  <form action={approveTaskAction} className="space-y-2">
                    <input type="hidden" name="task_id" value={task.id} />
                    <Field label="Comentário da aprovação (opcional)">
                      <input name="nota" className="input" placeholder="ficou bom, seguir assim" />
                    </Field>
                    <SubmitButton variant="primary" size="sm" pendingLabel="Aprovando…">
                      Aprovar e liberar {task.points} pontos
                    </SubmitButton>
                  </form>

                  <form action={rejectTaskAction} className="space-y-2 border-t border-line pt-3">
                    <input type="hidden" name="task_id" value={task.id} />
                    <Field label="O que precisa mudar *" hint="Obrigatório. Volta para o executor com este texto.">
                      <textarea name="nota" rows={2} required className="textarea" />
                    </Field>
                    <SubmitButton variant="danger" size="sm" pendingLabel="Devolvendo…">
                      Pedir ajuste
                    </SubmitButton>
                  </form>
                </div>
              ) : (
                <p className="text-sm text-muted">
                  {task.assignee_id === user.id
                    ? "Você executou esta tarefa, então não pode aprová-la. Peça a um gestor."
                    : "Somente gestores e admins revisam."}
                </p>
              )}
            </Card>
          )}

          {task.review_note && task.status !== "em_revisao" && (
            <Card title="Último retorno da revisão">
              <p className="text-sm text-muted">{task.review_note}</p>
              {task.reviewed_at && (
                <p className="mt-1 text-[0.7rem] text-dim">{dateTimeBR(task.reviewed_at)}</p>
              )}
            </Card>
          )}

          <Card
            title="Checklist"
            subtitle="O que precisa estar feito antes de mandar para revisão"
            actions={
              manager && (
                <form action={toggleEvidenceRequiredAction}>
                  <input type="hidden" name="task_id" value={task.id} />
                  <SubmitButton variant="ghost" size="sm">
                    {task.requires_evidence ? "Não exigir evidência" : "Exigir evidência"}
                  </SubmitButton>
                </form>
              )
            }
          >
            {checklist.length ? (
              <ul className="space-y-1.5">
                {checklist.map((c) => (
                  <li key={c.id} className="flex items-start gap-2">
                    <form action={toggleChecklistItemAction}>
                      <input type="hidden" name="task_id" value={task.id} />
                      <input type="hidden" name="item_id" value={c.id} />
                      <SubmitButton variant="ghost" size="sm">
                        {c.done ? "✓" : "○"}
                      </SubmitButton>
                    </form>
                    <span className="min-w-0 flex-1 pt-1.5">
                      <span className={`text-sm ${c.done ? "text-dim line-through" : "text-ink"}`}>{c.label}</span>
                      {c.required === 1 && <Chip tone="warn">obrigatório</Chip>}
                      {c.done && c.done_by_name && (
                        <span className="block text-[0.65rem] text-dim">
                          {c.done_by_name}
                          {c.done_at && ` · ${relativeBR(c.done_at)}`}
                        </span>
                      )}
                    </span>
                    {podeEditar && (
                      <form action={removeChecklistItemAction}>
                        <input type="hidden" name="task_id" value={task.id} />
                        <input type="hidden" name="item_id" value={c.id} />
                        <SubmitButton variant="ghost" size="sm">
                          ✕
                        </SubmitButton>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <Empty title="Sem checklist" hint="Quebre a tarefa em passos para não esquecer nada." />
            )}

            {podeEditar && (
              <form action={addChecklistItemAction} className="mt-3 flex flex-wrap items-end gap-2 border-t border-line pt-3">
                <input type="hidden" name="task_id" value={task.id} />
                <div className="min-w-40 flex-1">
                  <Field label="Novo item">
                    <input name="label" required className="input" placeholder="ex: conferir margem" />
                  </Field>
                </div>
                <label className="flex items-center gap-1.5 pb-2 text-xs text-muted">
                  <input type="checkbox" name="required" value="1" />
                  obrigatório
                </label>
                <SubmitButton variant="ghost" size="sm" className="mb-1">
                  Adicionar
                </SubmitButton>
              </form>
            )}
          </Card>

          <Card
            title="Evidências"
            subtitle="Link para o que comprova o trabalho"
            actions={task.requires_evidence ? <Chip tone="warn">exigida</Chip> : null}
          >
            {evidencias.length ? (
              <ul className="space-y-2">
                {evidencias.map((e) => (
                  <li key={e.id} className="flex items-start justify-between gap-2 rounded-lg border border-line px-3 py-2">
                    <span className="min-w-0">
                      {e.url ? (
                        <a
                          href={e.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block truncate text-sm text-brand hover:underline"
                        >
                          {e.url}
                        </a>
                      ) : (
                        <span className="block text-sm text-ink">{e.body}</span>
                      )}
                      <span className="text-[0.65rem] text-dim">
                        {e.user_name ?? "equipe"} · {relativeBR(e.created_at)}
                      </span>
                    </span>
                    {podeEditar && (
                      <form action={removeEvidenceAction}>
                        <input type="hidden" name="task_id" value={task.id} />
                        <input type="hidden" name="evidence_id" value={e.id} />
                        <SubmitButton variant="ghost" size="sm">
                          ✕
                        </SubmitButton>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <Empty
                title="Nenhuma evidência"
                hint="Cole o link do print, da planilha ou do painel do marketplace."
              />
            )}

            {podeEditar && (
              <form action={addEvidenceAction} className="mt-3 space-y-2 border-t border-line pt-3">
                <input type="hidden" name="task_id" value={task.id} />
                <Field label="Link" hint="O sistema não guarda arquivo, guarda o endereço dele.">
                  <input name="url" type="url" className="input" placeholder="https://" />
                </Field>
                <Field label="Ou uma nota">
                  <input name="body" className="input" placeholder="o que foi feito" />
                </Field>
                <SubmitButton variant="ghost" size="sm">
                  Anexar
                </SubmitButton>
              </form>
            )}
          </Card>

          <Card title="Comentários">
            {comentarios.length ? (
              <ul className="space-y-3">
                {comentarios.map((c) => (
                  <li key={c.id} className="flex gap-2.5">
                    <Avatar name={c.user_name ?? "?"} color={c.user_color} size={28} />
                    <span className="min-w-0 flex-1">
                      <span className="text-xs font-medium text-ink">{c.user_name ?? "equipe"}</span>
                      <span className="ml-1.5 text-[0.65rem] text-dim">{relativeBR(c.created_at)}</span>
                      <span className="block whitespace-pre-wrap text-sm text-muted">{c.body}</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-dim">Nenhum comentário ainda.</p>
            )}

            <form action={addTaskCommentAction} className="mt-3 space-y-2 border-t border-line pt-3">
              <input type="hidden" name="task_id" value={task.id} />
              <textarea name="body" rows={2} required className="textarea" placeholder="escreva um comentário" />
              <SubmitButton variant="ghost" size="sm">
                Comentar
              </SubmitButton>
            </form>
          </Card>
        </div>

        <div className="space-y-3">
          <Card title="Ações">
            <div className="space-y-2">
              {task.status === "assumida" && meu && (
                <form action={startTaskAction}>
                  <input type="hidden" name="task_id" value={task.id} />
                  <SubmitButton variant="accent" size="sm">
                    Começar o trabalho
                  </SubmitButton>
                </form>
              )}

              {task.status === "em_andamento" && meu && (
                <form action={submitTaskAction}>
                  <input type="hidden" name="task_id" value={task.id} />
                  <SubmitButton
                    variant="primary"
                    size="sm"
                    disabled={!podeEnviar}
                    pendingLabel="Enviando…"
                    title={
                      obrigatoriosPendentes.length
                        ? `Faltam: ${obrigatoriosPendentes.map((c) => c.label).join(", ")}`
                        : faltaEvidencia
                          ? "Esta tarefa exige evidência"
                          : undefined
                    }
                  >
                    Enviar para revisão
                  </SubmitButton>
                  {!podeEnviar && (
                    <p className="mt-2 text-[0.7rem] text-warn">
                      {obrigatoriosPendentes.length
                        ? `Faltam ${obrigatoriosPendentes.length} itens obrigatórios do checklist.`
                        : "Anexe pelo menos uma evidência."}
                    </p>
                  )}
                </form>
              )}

              {meu && task.status !== "concluida" && (
                <form action={releaseTaskAction}>
                  <input type="hidden" name="task_id" value={task.id} />
                  <SubmitButton variant="ghost" size="sm" confirm="Devolver a tarefa para o mural?">
                    Devolver ao mural
                  </SubmitButton>
                </form>
              )}

              {manager && task.status === "concluida" && (
                <form action={reopenTaskAction}>
                  <input type="hidden" name="task_id" value={task.id} />
                  <SubmitButton variant="ghost" size="sm" confirm="Reabrir esta tarefa?">
                    Reabrir
                  </SubmitButton>
                </form>
              )}
            </div>
          </Card>

          <Card title="Histórico" subtitle="Tudo que aconteceu com esta tarefa">
            {eventos.length ? (
              <ul className="space-y-2">
                {eventos.map((e) => (
                  <li key={e.id} className="text-xs">
                    <span className="text-ink">{e.type.replace(/_/g, " ")}</span>
                    {e.points > 0 && <Chip tone="ok">+{e.points}</Chip>}
                    <span className="block text-[0.65rem] text-dim">
                      {e.user_name ?? "sistema"} · {relativeBR(e.created_at)}
                    </span>
                    {e.meta && <span className="block text-[0.65rem] text-muted">{e.meta}</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-dim">Sem histórico.</p>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
