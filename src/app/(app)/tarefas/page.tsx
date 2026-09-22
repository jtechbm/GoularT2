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
import { claimTaskAction, createTaskAction, startTaskAction } from "@/lib/actions/tasks";
import { TASK_COLUMNS, TASK_PRIORITIES, type TaskStatus } from "@/lib/types";
import { Quadro } from "./quadro";
import { atrasada, PrazoChip } from "@/components/prazo-tarefa";
import { MonthPicker } from "@/components/month-picker";
import { currentMonth, dateTimeBR, lastMonths, monthLabel, pct } from "@/lib/format";
import { duracao, limiteDaTarefa, OPCOES_PRAZO, rotuloPrazo, situacaoPrazo } from "@/lib/prazo-tarefa";

const TOM_PRIORIDADE: Record<string, "bad" | "warn" | "brand" | "neutral"> = {
  urgente: "bad",
  alta: "warn",
  media: "brand",
  baixa: "neutral",
};

/** A etapa de uma tarefa, no singular: "Assumidas" é nome de coluna, não de tarefa. */
const ETAPA: Record<string, { rotulo: string; tom: "brand" | "info" | "warn" | "ok" | "neutral" }> = {
  disponivel: { rotulo: "no mural", tom: "neutral" },
  assumida: { rotulo: "a começar", tom: "brand" },
  em_andamento: { rotulo: "em andamento", tom: "info" },
  em_revisao: { rotulo: "esperando revisão", tom: "warn" },
  concluida: { rotulo: "concluída", tom: "ok" },
};

/** Revisão por último; entre as outras, o prazo que vence primeiro. */
function porPrazo(a: TaskRow, b: TaskRow): number {
  const revisao = Number(a.status === "em_revisao") - Number(b.status === "em_revisao");
  if (revisao) return revisao;
  const la = limiteDaTarefa(a)?.getTime() ?? Infinity;
  const lb = limiteDaTarefa(b)?.getTime() ?? Infinity;
  return la - lb;
}

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
  const manager = can(user, "tarefas.gerenciar");
  // quem não distribui tarefa quer saber o que está com ele: abre ali
  const aba = ABAS.some((a) => a.key === sp.aba) ? sp.aba! : manager ? "quadro" : "minhas";
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

  // o que a aba "minhas" e os números do topo usam
  const naMao = minhas.filter((t) => t.status !== "em_revisao");
  const minhasEmRevisao = minhas.filter((t) => t.status === "em_revisao");
  const minhasAtrasadas = naMao.filter(atrasada);
  const mural = porColuna.disponivel ?? [];

  return (
    <>
      <PageHeader
        title={manager ? "Tarefas da equipe" : "Suas tarefas"}
        subtitle={
          manager
            ? "O gestor publica; quem pega assume; o gestor aprova antes de valer ponto."
            : "Pegue, faça e envie para revisão. Os pontos entram quando o gestor aprova."
        }
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
      {minhasAtrasadas.length > 0 && (
        <div className="mb-3 rounded-[12px] border border-bad/30 bg-bad-soft px-4 py-3 text-sm text-bad">
          {minhasAtrasadas.length === 1
            ? `"${minhasAtrasadas[0].title}" passou do prazo. Termine e envie para revisão.`
            : `${minhasAtrasadas.length} tarefas suas passaram do prazo. Termine e envie para revisão.`}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Na sua mão"
          value={String(naMao.length)}
          hint={naMao.length ? `valem ${naMao.reduce((s, t) => s + t.points, 0)} pontos` : "nada agora"}
          tone="brand"
          href={link({ aba: "minhas" })}
        />
        <Stat
          label="Esperando revisão"
          value={String(manager ? emRevisao.length : minhasEmRevisao.length)}
          hint={manager ? "esperando você aprovar" : "o gestor ainda vai aprovar"}
          tone={(manager ? emRevisao.length : minhasEmRevisao.length) ? "warn" : "neutral"}
        />
        <Stat
          label="No mural"
          value={String(mural.length)}
          hint={mural.length ? "quem pega primeiro leva" : "nada disponível"}
          tone="accent"
          href={link({ aba: "quadro" })}
        />
        {manager ? (
          <Stat
            label="Atrasadas na equipe"
            value={String(atrasadas.length)}
            hint={atrasadas.length ? "ver no registro" : "tudo no prazo"}
            tone={atrasadas.length ? "bad" : "ok"}
            href={link({ aba: "registro" })}
          />
        ) : (
          <Stat label="Seus pontos" value={String(meusPontos)} hint="nos últimos 30 dias" tone="ok" href="/" />
        )}
      </div>

      {/* criar fica recolhido: é o que menos se faz nesta tela */}
      <details className="mt-3 rounded-[var(--radius-card)] border border-line bg-surface">
        <summary className="cursor-pointer px-5 py-3.5 text-sm font-medium text-brand">
          {manager ? "+ Nova tarefa" : "+ Registrar uma demanda para mim"}
          <span className="ml-2 text-xs font-normal text-dim">
            {manager
              ? "nasce no mural, ou já atribuída"
              : "fica na sua mão; os pontos entram depois que um gestor aprovar"}
          </span>
        </summary>
        <form action={createTaskAction} className="border-t border-line px-5 pt-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Título *">
              <input name="title" required className="input" placeholder="o que precisa ser feito" />
            </Field>
            {clients.length > 0 && (
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
            )}
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
            {manager && (
              <Field label="Atribuir a" hint="Em branco: vai para o mural.">
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
          </div>
          <SaveBar
            label={manager ? "Publicar tarefa" : "Registrar para mim"}
            hint={manager ? "Sem responsável, qualquer pessoa da equipe pode pegar." : ""}
          />
        </form>
      </details>

      {/* filtro só serve para quem olha a equipe inteira */}
      {manager && aba !== "minhas" && (
        <form className="mt-3 flex flex-wrap items-center gap-2">
          <input type="hidden" name="aba" value={aba} />
          {sp.mes && <input type="hidden" name="mes" value={sp.mes} />}
          <select name="cliente" defaultValue={sp.cliente ?? ""} className="select w-44" aria-label="Cliente">
            <option value="">Todos os clientes</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select name="resp" defaultValue={sp.resp ?? ""} className="select w-44" aria-label="Responsável">
            <option value="">Todas as pessoas</option>
            {team.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          <select name="prioridade" defaultValue={sp.prioridade ?? ""} className="select w-40" aria-label="Prioridade">
            <option value="">Toda prioridade</option>
            {TASK_PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
          <button type="submit" className="btn btn-ghost btn-sm">
            Filtrar
          </button>
          {(sp.cliente || sp.resp || sp.prioridade) && (
            <Link href={`/tarefas?aba=${aba}`} className="text-xs text-dim hover:text-brand">
              limpar
            </Link>
          )}
        </form>
      )}

      <div className="mt-3">
        {aba === "registro" ? (
          <Registro linhas={registro} mes={mesRegistro} meses={meses} manager={manager} />
        ) : aba === "quadro" ? (
          <Quadro porColuna={porColuna} userId={user.id} manager={manager} checklists={checklists} />
        ) : (
          <div className="space-y-3">
            <Card
              title="Na sua mão"
              subtitle={minhas.length ? "Da que vence primeiro para a última" : undefined}
              bodyClassName="p-0"
            >
              {minhas.length ? (
                <ul className="divide-y divide-line">
                  {[...minhas].sort(porPrazo).map((t) => (
                    <li key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5">
                      <div className="min-w-0 flex-1">
                        <Link href={`/tarefas/${t.id}`} className="block truncate text-sm font-semibold text-ink hover:text-brand">
                          {t.title}
                        </Link>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <Chip tone={ETAPA[t.status]?.tom ?? "neutral"}>{ETAPA[t.status]?.rotulo ?? t.status}</Chip>
                          {t.status !== "em_revisao" && <PrazoChip t={t} />}
                          {t.client_name && <span className="text-[0.7rem] text-dim">{t.client_name}</span>}
                        </div>
                      </div>
                      <span className="shrink-0 rounded-full bg-brand-soft px-2.5 py-1 text-xs font-bold text-brand">
                        +{t.points} pts
                      </span>
                      {t.status === "assumida" ? (
                        <form action={startTaskAction}>
                          <input type="hidden" name="task_id" value={t.id} />
                          <SubmitButton size="sm" pendingLabel="Começando…">
                            Começar
                          </SubmitButton>
                        </form>
                      ) : t.status === "em_andamento" ? (
                        <Link href={`/tarefas/${t.id}`} className="btn btn-primary btn-sm">
                          Abrir e enviar
                        </Link>
                      ) : (
                        <Link href={`/tarefas/${t.id}`} className="btn btn-ghost btn-sm">
                          Ver
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="p-5">
                  <Empty title="Nada na sua mão" hint="Pegue uma tarefa do mural logo abaixo." />
                </div>
              )}
            </Card>

            <Card
              title="No mural"
              subtitle={mural.length ? "Quem pega primeiro fica com ela" : undefined}
              bodyClassName="p-0"
            >
              {mural.length ? (
                <ul className="divide-y divide-line">
                  {mural.map((t) => (
                    <li key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <Link href={`/tarefas/${t.id}`} className="block truncate text-sm font-medium text-ink hover:text-brand">
                          {t.title}
                        </Link>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <Chip tone={TOM_PRIORIDADE[t.priority] ?? "neutral"}>{t.priority}</Chip>
                          <PrazoChip t={t} />
                          {t.client_name && <span className="text-[0.7rem] text-dim">{t.client_name}</span>}
                        </div>
                      </div>
                      <span className="shrink-0 text-xs font-bold text-brand">+{t.points} pts</span>
                      <form action={claimTaskAction}>
                        <input type="hidden" name="task_id" value={t.id} />
                        <SubmitButton size="sm" pendingLabel="Pegando…">
                          Pegar
                        </SubmitButton>
                      </form>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="p-5 text-sm text-dim">Nada no mural agora. Quando o gestor publicar, aparece aqui.</p>
              )}
            </Card>
          </div>
        )}
      </div>
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
