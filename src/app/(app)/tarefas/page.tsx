import Link from "next/link";
import { listUsers, requireUser, visibleClientIds } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { checklistResumo, clientOptions, leaderboard, tasks, type TaskRow } from "@/lib/queries";
import { Card, Chip, Empty, Field, PageHeader, Stat } from "@/components/ui";
import { SaveBar, SubmitButton } from "@/components/submit";
import { createTaskAction } from "@/lib/actions/tasks";
import { TASK_COLUMNS, TASK_PRIORITIES, type TaskStatus } from "@/lib/types";
import { Quadro, atrasada } from "./quadro";

const ABAS = [
  { key: "quadro", label: "Quadro" },
  { key: "minhas", label: "Minhas tarefas" },
];

export default async function TarefasPage({
  searchParams,
}: {
  searchParams: Promise<{
    aba?: string;
    cliente?: string;
    resp?: string;
    prioridade?: string;
    ok?: string;
    erro?: string;
    destaque?: string;
  }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const aba = ABAS.some((a) => a.key === sp.aba) ? sp.aba! : "quadro";

  const manager = can(user, "tarefas.gerenciar");
  const clients = await clientOptions(await visibleClientIds(user));
  const team = await listUsers();

  const filtro = {
    ...(sp.cliente ? { clientId: sp.cliente } : {}),
    ...(sp.prioridade ? { priority: sp.prioridade } : {}),
  };

  const todas = await tasks(filtro);
  const visiveis = sp.resp ? todas.filter((t) => t.assignee_id === sp.resp) : todas;
  const minhas = todas.filter((t) => t.assignee_id === user.id && t.status !== "concluida");

  const porColuna = TASK_COLUMNS.reduce(
    (acc, col) => {
      acc[col.value] = visiveis.filter((t) => t.status === col.value);
      return acc;
    },
    {} as Record<TaskStatus, TaskRow[]>,
  );

  const checklists = await checklistResumo(visiveis.map((t) => t.id));
  const board = await leaderboard();
  const meusPontos = board.find((b) => b.id === user.id)?.points ?? 0;
  const atrasadas = visiveis.filter(atrasada);
  const emRevisao = porColuna.em_revisao ?? [];

  const link = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    if (sp.cliente) p.set("cliente", sp.cliente);
    if (sp.resp) p.set("resp", sp.resp);
    if (sp.prioridade) p.set("prioridade", sp.prioridade);
    p.set("aba", aba);
    for (const [k, v] of Object.entries(extra)) {
      if (v === undefined) p.delete(k);
      else p.set(k, v);
    }
    return `/tarefas?${p}`;
  };

  return (
    <>
      <PageHeader
        title="Tarefas da equipe"
        subtitle="O gestor publica; quem pega assume; o gestor aprova antes de valer ponto."
        actions={
          <nav className="flex gap-1">
            {ABAS.map((a) => (
              <Link
                key={a.key}
                href={link({ aba: a.key })}
                className={`btn btn-sm ${aba === a.key ? "btn-primary" : "btn-ghost"}`}
              >
                {a.label}
                {a.key === "minhas" && minhas.length > 0 && ` (${minhas.length})`}
              </Link>
            ))}
          </nav>
        }
      />

      {sp.ok && (
        <div className="flash mb-4 rounded-lg border border-ok/30 bg-ok-soft px-4 py-2.5 text-sm font-medium text-ok">
          Pronto.
        </div>
      )}
      {sp.erro === "indisponivel" && (
        <div className="flash mb-4 rounded-lg border border-warn/30 bg-warn-soft px-4 py-2.5 text-sm font-medium text-warn">
          Alguém pegou essa tarefa antes de você.
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Disponíveis" value={String((porColuna.disponivel ?? []).length)} tone="brand" />
        <Stat label="Minhas em aberto" value={String(minhas.length)} tone="accent" />
        <Stat
          label="Em revisão"
          value={String(emRevisao.length)}
          hint={manager ? "esperando você aprovar" : "esperando o gestor"}
          tone={emRevisao.length ? "warn" : "neutral"}
        />
        <Stat
          label="Atrasadas"
          value={String(atrasadas.length)}
          hint={`você tem ${meusPontos} pontos em 30 dias`}
          tone={atrasadas.length ? "bad" : "ok"}
        />
      </div>

      <Card className="mt-3" bodyClassName="p-4">
        <form className="grid gap-3 sm:grid-cols-4">
          <input type="hidden" name="aba" value={aba} />
          <Field label="Cliente">
            <select name="cliente" defaultValue={sp.cliente ?? ""} className="select">
              <option value="">Todos</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Responsável">
            <select name="resp" defaultValue={sp.resp ?? ""} className="select">
              <option value="">Todos</option>
              {team.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Prioridade">
            <select name="prioridade" defaultValue={sp.prioridade ?? ""} className="select">
              <option value="">Todas</option>
              {TASK_PRIORITIES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex items-end gap-2">
            <SubmitButton variant="ghost" size="sm">
              Filtrar
            </SubmitButton>
            <Link href={`/tarefas?aba=${aba}`} className="btn btn-ghost btn-sm">
              Limpar
            </Link>
          </div>
        </form>
      </Card>

      <div className="mt-3">
        {aba === "quadro" ? (
          <Quadro porColuna={porColuna} userId={user.id} manager={manager} checklists={checklists} />
        ) : (
          <Card title="Minhas tarefas" subtitle="O que está na sua mão agora" bodyClassName="p-0">
            {minhas.length ? (
              <div className="table-wrap">
                <table className="data responsiva">
                  <thead>
                    <tr>
                      <th>Tarefa</th>
                      <th>Cliente</th>
                      <th>Etapa</th>
                      <th className="num">Prazo</th>
                      <th className="num">Pontos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {minhas.map((t) => (
                      <tr key={t.id}>
                        <td data-label="Tarefa">
                          <Link href={`/tarefas/${t.id}`} className="font-medium text-ink hover:text-brand">
                            {t.title}
                          </Link>
                        </td>
                        <td className="text-xs text-muted" data-label="Cliente">{t.client_name ?? "—"}</td>
                        <td data-label="Etapa">
                          <Chip tone={t.status === "em_revisao" ? "warn" : "brand"}>
                            {TASK_COLUMNS.find((c) => c.value === t.status)?.label ?? t.status}
                          </Chip>
                        </td>
                        <td className={`num text-xs ${atrasada(t) ? "font-semibold text-bad" : "text-muted"}`} data-label="Prazo">
                          {t.due_date ?? "—"}
                        </td>
                        <td className="num text-muted" data-label="Pontos">{t.points}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-5">
                <Empty title="Nada na sua mão" hint="Pegue uma tarefa disponível no quadro." />
              </div>
            )}
          </Card>
        )}
      </div>

      <form action={createTaskAction} className="mt-3">
        <Card
          title={manager ? "Nova tarefa" : "Registrar uma demanda"}
          subtitle={
            manager
              ? "Nasce disponível, sem dono"
              : "Fica na sua mão. Os pontos só entram depois que um gestor aprovar."
          }
          bodyClassName="p-5 pb-0"
        >
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Título *">
                <input name="title" required className="input" placeholder="o que precisa ser feito" />
              </Field>
              <Field label="Cliente">
                <select name="client_id" className="select" defaultValue={sp.cliente ?? ""}>
                  <option value="">Sem cliente</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Prioridade">
                <select name="priority" className="select" defaultValue="media">
                  {TASK_PRIORITIES.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label} · {p.points} pts
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Prazo">
                <input name="due_date" type="date" className="input" />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Descrição">
                  <textarea name="description" rows={2} className="textarea" />
                </Field>
              </div>
              {manager && (
                <label className="flex items-center gap-2 text-xs text-muted sm:col-span-2">
                  <input type="checkbox" name="requires_evidence" value="1" />
                  Exigir evidência antes de mandar para revisão
                </label>
              )}
              {manager && (
                <Field label="Atribuir a" hint="Deixe em branco para publicar no mural.">
                  <select name="assignee_id" className="select" defaultValue="">
                    <option value="">Ninguém, vai para o mural</option>
                    {team.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
            </div>
            <SaveBar
              label={manager ? "Publicar tarefa" : "Registrar para mim"}
              hint={
                manager
                  ? "Qualquer pessoa da equipe pode pegar."
                  : "Você não pode atribuir tarefa para outra pessoa."
              }
            />
        </Card>
      </form>
    </>
  );
}
