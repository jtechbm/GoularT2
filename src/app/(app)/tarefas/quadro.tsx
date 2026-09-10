import Link from "next/link";
import { Avatar, Chip, MarketplaceChip } from "@/components/ui";
import { SubmitButton } from "@/components/submit";
import { claimTaskAction, moveTaskAction, startTaskAction, submitTaskAction } from "@/lib/actions/tasks";
import { dateBR } from "@/lib/format";
import { TASK_COLUMNS, type TaskStatus } from "@/lib/types";
import type { TaskRow } from "@/lib/queries";

const TOM_PRIORIDADE: Record<string, "bad" | "warn" | "brand" | "neutral"> = {
  urgente: "bad",
  alta: "warn",
  media: "brand",
  baixa: "neutral",
};

export function atrasada(t: TaskRow): boolean {
  return Boolean(t.due_date && t.status !== "concluida" && new Date(`${t.due_date}T23:59:59`) < new Date());
}

/**
 * Cartão do quadro.
 *
 * O movimento entre etapas é por botão, não por arrastar. Arrastar exige
 * JavaScript no cliente e some no celular; e as duas transições que
 * importam de verdade, enviar para revisão e aprovar, precisam de
 * validação no servidor de qualquer jeito.
 */
function Cartao({
  t,
  userId,
  manager,
  checklist,
}: {
  t: TaskRow;
  userId: string;
  manager: boolean;
  checklist?: { total: number; feitos: number; obrigatoriosPendentes: number };
}) {
  const meu = t.assignee_id === userId;
  const late = atrasada(t);

  return (
    <div
      className={`rounded-[10px] border bg-surface px-3 py-2.5 ${
        late ? "border-bad/40" : "border-line"
      }`}
    >
      <Link href={`/tarefas/${t.id}`} className="block text-sm font-medium text-ink hover:text-brand">
        {t.title}
      </Link>

      {t.client_name && (
        <Link href={`/clientes/${t.client_id}`} className="mt-1 block text-[0.7rem] text-muted hover:text-brand">
          {t.client_name}
        </Link>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Chip tone={TOM_PRIORIDADE[t.priority] ?? "neutral"}>{t.priority}</Chip>
        <Chip tone="neutral">{t.points} pts</Chip>
        {checklist && checklist.total > 0 && (
          <Chip tone={checklist.obrigatoriosPendentes ? "warn" : "ok"}>
            {checklist.feitos}/{checklist.total}
          </Chip>
        )}
        {t.rejections > 0 && <Chip tone="bad">voltou {t.rejections}x</Chip>}
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <span className={`text-[0.7rem] ${late ? "font-semibold text-bad" : "text-dim"}`}>
          {t.due_date ? (late ? `atrasada desde ${dateBR(t.due_date)}` : dateBR(t.due_date)) : "sem prazo"}
        </span>
        {t.assignee_name && <Avatar name={t.assignee_name} color={t.assignee_color} size={22} />}
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5 border-t border-line pt-2">
        {t.status === "disponivel" && (
          <form action={claimTaskAction}>
            <input type="hidden" name="task_id" value={t.id} />
            <SubmitButton variant="primary" size="sm" pendingLabel="Pegando…">
              Pegar
            </SubmitButton>
          </form>
        )}

        {t.status === "assumida" && meu && (
          <form action={startTaskAction}>
            <input type="hidden" name="task_id" value={t.id} />
            <SubmitButton variant="accent" size="sm">
              Começar
            </SubmitButton>
          </form>
        )}

        {t.status === "em_andamento" && meu && (
          <form action={submitTaskAction}>
            <input type="hidden" name="task_id" value={t.id} />
            <SubmitButton variant="accent" size="sm" pendingLabel="Enviando…">
              Enviar para revisão
            </SubmitButton>
          </form>
        )}

        {t.status === "em_revisao" && manager && (
          <Link href={`/tarefas/${t.id}`} className="btn btn-primary btn-sm">
            Revisar
          </Link>
        )}

        {manager && t.status !== "disponivel" && t.status !== "concluida" && t.status !== "em_revisao" && (
          <form action={moveTaskAction}>
            <input type="hidden" name="task_id" value={t.id} />
            <input type="hidden" name="status" value="disponivel" />
            <SubmitButton variant="ghost" size="sm" confirm="Devolver a tarefa para o mural?">
              Devolver
            </SubmitButton>
          </form>
        )}
      </div>
    </div>
  );
}

export function Quadro({
  porColuna,
  userId,
  manager,
  checklists,
}: {
  porColuna: Record<TaskStatus, TaskRow[]>;
  userId: string;
  manager: boolean;
  checklists: Map<string, { total: number; feitos: number; obrigatoriosPendentes: number }>;
}) {
  return (
    <div className="table-wrap">
      <div className="flex min-w-max gap-3 pb-2">
        {TASK_COLUMNS.map((col) => {
          const lista = porColuna[col.value] ?? [];
          return (
            <section key={col.value} className="w-72 shrink-0">
              <header className="mb-2 flex items-center justify-between gap-2 px-1">
                <span className="text-sm font-semibold text-ink">{col.label}</span>
                <Chip tone="neutral">{lista.length}</Chip>
              </header>
              <p className="mb-2 px-1 text-[0.65rem] text-dim">{col.hint}</p>

              <div className="space-y-2 rounded-[12px] bg-surface-2 p-2">
                {lista.length ? (
                  lista.map((t) => (
                    <Cartao
                      key={t.id}
                      t={t}
                      userId={userId}
                      manager={manager}
                      checklist={checklists.get(t.id)}
                    />
                  ))
                ) : (
                  <p className="py-6 text-center text-xs text-dim">vazio</p>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

export { MarketplaceChip };
