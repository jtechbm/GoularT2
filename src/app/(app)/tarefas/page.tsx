import Link from "next/link";
import { Suspense } from "react";
import { listUsers, requireUser, visibleClientIds } from "@/lib/auth";
import { can } from "@/lib/permissions";
import {
  checklistResumo,
  clientOptions,
  leaderboard,
  registroTarefas,
  tasks,
  type LinhaRegistro,
  type TaskRow,
} from "@/lib/queries";
import { Card, Chip, Empty, Field, PageHeader, Stat } from "@/components/ui";
import { SaveBar, SubmitButton } from "@/components/submit";
import { createTaskAction } from "@/lib/actions/tasks";
import { TASK_COLUMNS, TASK_PRIORITIES, type TaskStatus } from "@/lib/types";
import { Quadro } from "./quadro";
import { atrasada, PrazoChip } from "@/components/prazo-tarefa";
import { MonthPicker } from "@/components/month-picker";
import { currentMonth, dateTimeBR, lastMonths, monthLabel, pct } from "@/lib/format";
import { duracao, OPCOES_PRAZO, rotuloPrazo, situacaoPrazo } from "@/lib/prazo-tarefa";

const ABAS = [
  { key: "quadro", label: "Quadro" },
  { key: "minhas", label: "Minhas tarefas" },
  { key: "registro", label: "Registro" },
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
    mes?: string;
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

  // registro: quem não gerencia vê só o próprio histórico
  const meses = lastMonths(12);
  const mesRegistro = sp.mes && meses.includes(sp.mes) ? sp.mes : currentMonth();
  const [anoReg, mesReg] = mesRegistro.split("-").map(Number);
  const registro =
    aba === "registro"
      ? await registroTarefas({
          inicio: `${mesRegistro}-01`,
          fim: new Date(Date.UTC(anoReg, mesReg, 0)).toISOString().slice(0, 10),
          userId: manager ? sp.resp : user.id,
        })
      : [];

  const link = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    if (sp.cliente) p.set("cliente", sp.cliente);
    if (sp.resp) p.set("resp", sp.resp);
    if (sp.prioridade) p.set("prioridade", sp.prioridade);
    if (sp.mes) p.set("mes", sp.mes);
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
          {sp.mes && <input type="hidden" name="mes" value={sp.mes} />}
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
        {aba === "registro" ? (
          <Registro linhas={registro} mes={mesRegistro} meses={meses} manager={manager} />
        ) : aba === "quadro" ? (
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
                        <td className="num text-xs" data-label="Prazo">
                          <PrazoChip t={t} />
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
              {manager && (
                <Field label="Prazo para concluir" hint="Conta de quando a pessoa pega ou recebe a tarefa.">
                  <select name="sla_hours" className="select" defaultValue="">
                    <option value="">Sem prazo em horas</option>
                    {OPCOES_PRAZO.map((o) => (
                      <option key={o.horas} value={o.horas}>
                        {o.rotulo}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              <Field label="Data limite" hint="Opcional. Vale o que vencer primeiro.">
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

/**
 * Registro de tarefas: o histórico de quem ficou com o quê e se cumpriu o
 * prazo. Em cima, o resumo por pessoa; embaixo, tarefa por tarefa.
 */
function Registro({
  linhas,
  mes,
  meses,
  manager,
}: {
  linhas: LinhaRegistro[];
  mes: string;
  meses: string[];
  manager: boolean;
}) {
  const comSituacao = linhas.map((t) => ({ t, s: situacaoPrazo(t) }));
  const atrasadasAgora = comSituacao.filter((x) => x.s.estado === "atrasada");

  const porPessoa = new Map<
    string,
    { nome: string; total: number; noPrazo: number; foraDoPrazo: number; atrasadas: number; atrasoMs: number }
  >();
  for (const { t, s } of comSituacao) {
    const chave = t.assignee_id ?? "";
    const p = porPessoa.get(chave) ?? {
      nome: t.assignee_name ?? "—",
      total: 0,
      noPrazo: 0,
      foraDoPrazo: 0,
      atrasadas: 0,
      atrasoMs: 0,
    };
    p.total += 1;
    if (s.estado === "entregue_no_prazo") p.noPrazo += 1;
    if (s.estado === "entregue_atrasada") {
      p.foraDoPrazo += 1;
      p.atrasoMs += -(s.folgaMs ?? 0);
    }
    if (s.estado === "atrasada") p.atrasadas += 1;
    porPessoa.set(chave, p);
  }
  const pessoas = [...porPessoa.values()].sort((a, b) => b.atrasadas - a.atrasadas || b.total - a.total);

  return (
    <div className="space-y-3">
      <Card
        title="Registro de tarefas"
        subtitle={`Pegas ou atribuídas em ${monthLabel(mes)}, mais as que seguem atrasadas de antes`}
        actions={
          <Suspense fallback={null}>
            <MonthPicker months={meses} value={mes} />
          </Suspense>
        }
        bodyClassName="p-0"
      >
        {pessoas.length ? (
          <div className="table-wrap">
            <table className="data responsiva">
              <thead>
                <tr>
                  <th>Pessoa</th>
                  <th className="num">Tarefas</th>
                  <th className="num">Entregues no prazo</th>
                  <th className="num">Entregues atrasadas</th>
                  <th className="num">Atrasadas agora</th>
                  <th className="num">Pontualidade</th>
                  <th className="num">Atraso médio</th>
                </tr>
              </thead>
              <tbody>
                {pessoas.map((p) => {
                  const entregues = p.noPrazo + p.foraDoPrazo;
                  return (
                    <tr key={p.nome}>
                      <td className="font-medium text-ink" data-label="Pessoa">
                        {p.nome}
                      </td>
                      <td className="num" data-label="Tarefas">
                        {p.total}
                      </td>
                      <td className="num text-ok" data-label="No prazo">
                        {p.noPrazo || "—"}
                      </td>
                      <td className={`num ${p.foraDoPrazo ? "text-bad" : "text-dim"}`} data-label="Entregues atrasadas">
                        {p.foraDoPrazo || "—"}
                      </td>
                      <td className="num" data-label="Atrasadas agora">
                        {p.atrasadas ? <Chip tone="bad">{p.atrasadas}</Chip> : <span className="text-dim">—</span>}
                      </td>
                      <td className="num" data-label="Pontualidade">
                        {entregues ? pct(p.noPrazo / entregues, 0) : "—"}
                      </td>
                      <td className="num text-muted" data-label="Atraso médio">
                        {p.foraDoPrazo ? duracao(p.atrasoMs / p.foraDoPrazo) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-5">
            <Empty title="Nada no período" hint="Nenhuma tarefa foi pega ou atribuída neste mês." />
          </div>
        )}
      </Card>

      {atrasadasAgora.length > 0 && (
        <Card
          title="Atrasadas agora"
          subtitle={manager ? "O prazo estourou e ninguém enviou para revisão" : "Termine e envie para revisão"}
          bodyClassName="p-0"
        >
          <ul className="divide-y divide-line">
            {atrasadasAgora.map(({ t }) => (
              <li key={t.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                <Link href={`/tarefas/${t.id}`} className="text-sm font-medium text-ink hover:text-brand">
                  {t.title}
                </Link>
                <span className="text-xs text-muted">{t.assignee_name}</span>
                {t.client_name && <span className="text-xs text-dim">{t.client_name}</span>}
                <span className="ml-auto">
                  <PrazoChip t={t} />
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {linhas.length > 0 && (
        <Card title="Tarefa por tarefa" bodyClassName="p-0">
          <div className="table-wrap">
            <table className="data responsiva">
              <thead>
                <tr>
                  <th>Tarefa</th>
                  <th>Pessoa</th>
                  <th>Como</th>
                  <th>Quando</th>
                  <th>Prazo</th>
                  <th>Entregue</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {comSituacao.map(({ t }) => (
                  <tr key={t.id}>
                    <td data-label="Tarefa">
                      <Link href={`/tarefas/${t.id}`} className="font-medium text-ink hover:text-brand">
                        {t.title}
                      </Link>
                      {t.client_name && <span className="block text-[0.7rem] text-dim">{t.client_name}</span>}
                    </td>
                    <td className="text-xs text-muted" data-label="Pessoa">
                      {t.assignee_name ?? "—"}
                    </td>
                    <td className="text-xs text-muted" data-label="Como">
                      {t.como === "atribuida"
                        ? `atribuída por ${t.creator_name?.split(" ")[0] ?? "gestor"}`
                        : "pegou do mural"}
                    </td>
                    <td className="text-xs text-muted" data-label="Quando">
                      {dateTimeBR(t.claimed_at)}
                    </td>
                    <td className="text-xs text-muted" data-label="Prazo">
                      {[rotuloPrazo(t.sla_hours), t.due_date ? `até ${t.due_date.split("-").reverse().join("/")}` : null]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </td>
                    <td className="text-xs text-muted" data-label="Entregue">
                      {t.submitted_at ? dateTimeBR(t.submitted_at) : "—"}
                    </td>
                    <td data-label="Situação">
                      <PrazoChip t={t} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
