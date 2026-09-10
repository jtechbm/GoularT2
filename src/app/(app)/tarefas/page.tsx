import Link from "next/link";
import { listUsers, requireUser, visibleClientIds } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { clientOptions, leaderboard, tasks, type TaskRow } from "@/lib/queries";
import { dateBR, relativeBR } from "@/lib/format";
import { Avatar, Card, Chip, Empty, Field, PageHeader, Stat, StatusChip } from "@/components/ui";
import { SaveBar, SubmitButton } from "@/components/submit";
import {
  claimTaskAction,
  completeTaskAction,
  createTaskAction,
  deleteTaskAction,
  releaseTaskAction,
  reopenTaskAction,
} from "@/lib/actions/tasks";
import { TASK_PRIORITIES } from "@/lib/types";

const ABAS = [
  { key: "disponiveis", label: "Disponíveis" },
  { key: "minhas", label: "Minhas tarefas" },
  { key: "concluidas", label: "Concluídas" },
  { key: "todas", label: "Todas" },
];

function isLate(t: TaskRow): boolean {
  return Boolean(t.due_date && t.status !== "concluida" && new Date(`${t.due_date}T23:59:59`) < new Date());
}

export default async function TarefasPage({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string; cliente?: string; ok?: string; erro?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const aba = ABAS.some((a) => a.key === sp.aba) ? sp.aba! : "disponiveis";
  const clientFilter = sp.cliente;

  const manager = can(user, "tarefas.gerenciar");
  const clients = await clientOptions(await visibleClientIds(user));
  const team = await listUsers();

  const filter = clientFilter ? { clientId: clientFilter } : {};
  const available = await tasks({ ...filter, status: "disponivel" });
  const mine = await tasks({ ...filter, status: "em_andamento", assignee: user.id });
  const inProgress = await tasks({ ...filter, status: "em_andamento" });
  const done = await tasks({ ...filter, status: "concluida" });
  const all = await tasks(filter);

  const list = aba === "disponiveis" ? available : aba === "minhas" ? mine : aba === "concluidas" ? done : all;
  const board = await leaderboard();
  const myPoints = board.find((b) => b.id === user.id)?.points ?? 0;

  const tabHref = (key: string) => `/tarefas?aba=${key}${clientFilter ? `&cliente=${clientFilter}` : ""}`;

  return (
    <>
      <PageHeader
        title="Tarefas da equipe"
        subtitle="O gestor publica no mural; quem pega a tarefa fica responsável por ela."
        actions={
          clientFilter && (
            <Link href="/tarefas" className="btn btn-ghost">
              Limpar filtro de cliente
            </Link>
          )
        }
      />

      {sp.erro === "indisponivel" && (
        <div className="flash mb-4 rounded-lg border border-warn/30 bg-warn-soft px-4 py-2.5 text-sm text-warn">
          Alguém pegou essa tarefa antes de você.
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="No mural" value={String(available.length)} hint="aguardando alguém" tone="info" />
        <Stat label="Em andamento" value={String(inProgress.length)} hint={`${mine.length} comigo`} tone="accent" />
        <Stat label="Concluídas" value={String(done.length)} tone="ok" />
        <Stat label="Meus pontos (30d)" value={String(myPoints)} hint="base da gamificação" tone="brand" />
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <nav className="flex flex-wrap gap-1 border-b border-line">
            {ABAS.map((a) => {
              const count =
                a.key === "disponiveis"
                  ? available.length
                  : a.key === "minhas"
                    ? mine.length
                    : a.key === "concluidas"
                      ? done.length
                      : all.length;
              return (
                <Link
                  key={a.key}
                  href={tabHref(a.key)}
                  className={`-mb-px flex items-center gap-1.5 border-b-2 px-3.5 py-2 text-sm font-medium transition-colors ${
                    aba === a.key
                      ? "border-accent text-ink"
                      : "border-transparent text-dim hover:border-line-strong hover:text-muted"
                  }`}
                >
                  {a.label}
                  <span className="rounded-full bg-surface-2 px-1.5 text-[0.65rem] text-dim">{count}</span>
                </Link>
              );
            })}
          </nav>

          {list.length ? (
            <ul className="space-y-2.5">
              {list.map((t) => (
                <li key={t.id} className="card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                        <StatusChip value={t.priority} />
                        <StatusChip value={t.status} />
                        {t.client_name && (
                          <Link href={`/clientes/${t.client_id}`} className="chip bg-brand-soft text-brand">
                            {t.client_name}
                          </Link>
                        )}
                        {isLate(t) && <Chip tone="bad">atrasada</Chip>}
                        <Chip tone="neutral">{t.points} pts</Chip>
                      </div>
                      <h3 className={`text-sm font-semibold ${t.status === "concluida" ? "text-dim line-through" : "text-ink"}`}>
                        {t.title}
                      </h3>
                      {t.description && (
                        <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-muted">{t.description}</p>
                      )}
                      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                        <span>criada por {t.creator_name ?? "—"} · {relativeBR(t.created_at)}</span>
                        {t.due_date && <span className={isLate(t) ? "text-bad" : ""}>prazo {dateBR(t.due_date)}</span>}
                        {t.completed_at && <span>concluída {relativeBR(t.completed_at)}</span>}
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-2">
                      {t.assignee_name && (
                        <span className="flex items-center gap-1.5">
                          <Avatar name={t.assignee_name} color={t.assignee_color} size={24} />
                          <span className="text-xs text-muted">{t.assignee_name.split(" ")[0]}</span>
                        </span>
                      )}

                      <div className="flex flex-wrap justify-end gap-1.5">
                        {t.status === "disponivel" && (
                          <form action={claimTaskAction}>
                            <input type="hidden" name="task_id" value={t.id} />
                            <SubmitButton variant="primary" size="sm" pendingLabel="Pegando…">
                              Pegar tarefa
                            </SubmitButton>
                          </form>
                        )}
                        {t.status === "em_andamento" && (t.assignee_id === user.id || manager) && (
                          <>
                            <form action={completeTaskAction}>
                              <input type="hidden" name="task_id" value={t.id} />
                              <SubmitButton variant="accent" size="sm">
                                Concluir
                              </SubmitButton>
                            </form>
                            <form action={releaseTaskAction}>
                              <input type="hidden" name="task_id" value={t.id} />
                              <SubmitButton variant="ghost" size="sm">
                                Devolver
                              </SubmitButton>
                            </form>
                          </>
                        )}
                        {t.status === "concluida" && manager && (
                          <form action={reopenTaskAction}>
                            <input type="hidden" name="task_id" value={t.id} />
                            <SubmitButton variant="ghost" size="sm">
                              Reabrir
                            </SubmitButton>
                          </form>
                        )}
                        {manager && (
                          <form action={deleteTaskAction}>
                            <input type="hidden" name="task_id" value={t.id} />
                            <SubmitButton variant="ghost" size="sm" confirm="Excluir esta tarefa?">
                              ✕
                            </SubmitButton>
                          </form>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <Card>
              <Empty
                title={
                  aba === "disponiveis"
                    ? "Mural vazio"
                    : aba === "minhas"
                      ? "Você não tem tarefas em andamento"
                      : "Nada por aqui"
                }
                hint={
                  aba === "disponiveis"
                    ? "Nenhuma tarefa aguardando alguém pegar."
                    : aba === "minhas"
                      ? "Pegue uma tarefa no mural para começar."
                      : undefined
                }
              />
            </Card>
          )}
        </div>

        <div className="space-y-3">
          {manager && (
            <form action={createTaskAction}>
              <Card title="Nova tarefa" subtitle="Vai para o mural da equipe" bodyClassName="p-5 pb-0">
                <div className="space-y-3">
                  <Field label="Título *">
                    <input name="title" required className="input" placeholder="o que precisa ser feito" />
                  </Field>
                  <Field label="Descrição">
                    <textarea name="description" rows={3} className="textarea" />
                  </Field>
                  <Field label="Cliente">
                    <select name="client_id" className="select" defaultValue={clientFilter ?? ""}>
                      <option value="">Sem cliente específico</option>
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Prioridade">
                      <select name="priority" defaultValue="media" className="select">
                        {TASK_PRIORITIES.map((p) => (
                          <option key={p.value} value={p.value}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Prazo">
                      <input name="due_date" type="date" className="input" />
                    </Field>
                  </div>
                  <Field label="Atribuir direto a" hint="Em branco, a tarefa fica no mural para quem quiser pegar.">
                    <select name="assignee_id" className="select" defaultValue="">
                      <option value="">Deixar no mural</option>
                      {team.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Pontos" hint="Em branco usa o padrão da prioridade.">
                    <input name="points" inputMode="numeric" className="input" placeholder="auto" />
                  </Field>
                </div>
                <SaveBar label="Publicar tarefa" hint="" />
              </Card>
            </form>
          )}

          <Card title="Filtrar por cliente" bodyClassName="p-5">
            <form action="/tarefas" method="get" className="space-y-3">
              <input type="hidden" name="aba" value={aba} />
              <select name="cliente" defaultValue={clientFilter ?? ""} className="select">
                <option value="">Todos os clientes</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <button type="submit" className="btn btn-ghost w-full">
                Aplicar filtro
              </button>
            </form>
          </Card>

          <Card title="Ranking de pontos" subtitle="Últimos 30 dias · estrutura pronta para gamificação">
            <ul className="space-y-2">
              {board.slice(0, 6).map((b, i) => (
                <li key={b.id} className="flex items-center gap-2.5">
                  <span className="w-4 text-xs font-bold text-dim">{i + 1}</span>
                  <Avatar name={b.name} color={b.color} size={26} />
                  <span className="min-w-0 flex-1 truncate text-xs text-muted">{b.name}</span>
                  <span className="text-xs text-muted">{b.done} tarefas</span>
                  <span className="text-xs font-bold text-accent">{b.points}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
