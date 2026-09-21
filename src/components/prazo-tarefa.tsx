import { dateTimeBR } from "@/lib/format";
import { rotuloPrazo, situacaoPrazo, textoPrazo, TOM_PRAZO } from "@/lib/prazo-tarefa";
import type { Task } from "@/lib/types";
import { Chip } from "./ui";

type TarefaComPrazo = Pick<
  Task,
  "status" | "due_date" | "deadline_at" | "sla_hours" | "submitted_at" | "completed_at"
>;

/** Atrasada agora (aberta e com o limite vencido). */
export function atrasada(t: TarefaComPrazo): boolean {
  return situacaoPrazo(t).estado === "atrasada";
}

/**
 * Onde a tarefa está em relação ao prazo, num chip.
 *
 * Tarefa no mural ainda não tem relógio correndo: mostra o prazo que vai
 * valer quando alguém pegar, para a pessoa saber antes de pegar.
 */
export function PrazoChip({ t }: { t: TarefaComPrazo }) {
  if (t.status === "disponivel" && t.sla_hours && !t.due_date) {
    return <Chip tone="neutral">{rotuloPrazo(t.sla_hours)} ao pegar</Chip>;
  }
  const s = situacaoPrazo(t);
  if (s.estado === "sem_prazo") return <span className="text-[0.7rem] text-dim">sem prazo</span>;
  return (
    <span title={s.limite ? `prazo: ${dateTimeBR(s.limite.toISOString())}` : undefined}>
      <Chip tone={TOM_PRAZO[s.estado]}>{textoPrazo(s)}</Chip>
    </span>
  );
}
