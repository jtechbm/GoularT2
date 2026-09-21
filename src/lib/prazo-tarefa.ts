/**
 * Prazo de uma tarefa.
 *
 * Uma tarefa pode ter dois prazos: a data de vencimento (due_date, "até dia
 * 25") e o prazo para concluir, em horas, que o gestor define e que começa
 * a correr quando alguém pega a tarefa ou recebe a atribuição (deadline_at).
 * O limite é o que vencer primeiro. Todo lugar que pergunta "está no prazo?"
 * passa por aqui, para pontos, registro e alertas darem a mesma resposta.
 *
 * Cumprir o prazo é enviar para revisão, não ser aprovado: a demora do
 * gestor em revisar não pode contar contra quem entregou.
 */

export const OPCOES_PRAZO: { horas: number; rotulo: string }[] = [
  { horas: 4, rotulo: "4 horas" },
  { horas: 8, rotulo: "8 horas" },
  { horas: 24, rotulo: "1 dia" },
  { horas: 48, rotulo: "2 dias" },
  { horas: 72, rotulo: "3 dias" },
  { horas: 168, rotulo: "1 semana" },
];

export function rotuloPrazo(horas: number | null | undefined): string | null {
  if (!horas) return null;
  return OPCOES_PRAZO.find((o) => o.horas === horas)?.rotulo ?? duracao(horas * 3600e3);
}

/** Quando o prazo em horas vence, contando de `inicio`. */
export function calcularDeadline(inicio: string | Date, slaHoras: number | null | undefined): string | null {
  if (!slaHoras) return null;
  return new Date(new Date(inicio).getTime() + slaHoras * 3600e3).toISOString();
}

export interface PrazoDaTarefa {
  due_date: string | null;
  deadline_at?: string | null;
}

/** O limite efetivo: o que vencer primeiro. A data vale até o fim do dia, em Brasília. */
export function limiteDaTarefa(t: PrazoDaTarefa): Date | null {
  const datas = [
    t.deadline_at ? new Date(t.deadline_at) : null,
    t.due_date ? new Date(`${t.due_date}T23:59:59-03:00`) : null,
  ].filter((d): d is Date => d !== null && !Number.isNaN(d.getTime()));
  if (!datas.length) return null;
  return new Date(Math.min(...datas.map((d) => d.getTime())));
}

/** Entregou dentro do prazo? Null quando não havia prazo ou não entregou. */
export function noPrazo(t: PrazoDaTarefa & { submitted_at: string | null }): boolean | null {
  const limite = limiteDaTarefa(t);
  if (!limite || !t.submitted_at) return null;
  return new Date(t.submitted_at) <= limite;
}

export type EstadoPrazo = "sem_prazo" | "no_prazo" | "vence_logo" | "atrasada" | "entregue_no_prazo" | "entregue_atrasada";

export interface SituacaoPrazo {
  estado: EstadoPrazo;
  limite: Date | null;
  /** positivo: quanto falta; negativo: quanto passou (ou atrasou na entrega) */
  folgaMs: number | null;
}

/**
 * Onde a tarefa está em relação ao prazo agora.
 *
 * "Vence logo" é o último quarto do prazo em horas (ou as últimas 4 horas
 * de um vencimento por data): cedo o bastante para alguém ainda agir.
 */
export function situacaoPrazo(
  t: PrazoDaTarefa & {
    status: string;
    submitted_at: string | null;
    completed_at?: string | null;
    sla_hours?: number | null;
  },
  agora: Date = new Date(),
): SituacaoPrazo {
  const limite = limiteDaTarefa(t);
  if (!limite) return { estado: "sem_prazo", limite: null, folgaMs: null };

  // concluída sem passar pela revisão (fluxo antigo) conta a conclusão
  const entregue = t.submitted_at ?? (t.status === "concluida" ? (t.completed_at ?? null) : null);
  if (entregue) {
    const folga = limite.getTime() - new Date(entregue).getTime();
    return { estado: folga >= 0 ? "entregue_no_prazo" : "entregue_atrasada", limite, folgaMs: folga };
  }

  const folga = limite.getTime() - agora.getTime();
  if (folga < 0) return { estado: "atrasada", limite, folgaMs: folga };
  const aviso = t.sla_hours ? t.sla_hours * 3600e3 * 0.25 : 4 * 3600e3;
  return { estado: folga <= aviso ? "vence_logo" : "no_prazo", limite, folgaMs: folga };
}

/** "45 min", "3 h", "2 dias": curto o bastante para caber num chip. */
export function duracao(ms: number): string {
  const min = Math.round(Math.abs(ms) / 60e3);
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} h`;
  const d = Math.round(h / 24);
  return `${d} dias`;
}

export const TOM_PRAZO: Record<EstadoPrazo, "ok" | "warn" | "bad" | "neutral"> = {
  sem_prazo: "neutral",
  no_prazo: "ok",
  vence_logo: "warn",
  atrasada: "bad",
  entregue_no_prazo: "ok",
  entregue_atrasada: "bad",
};

/** Texto curto da situação: "faltam 3 h", "atrasada há 2 dias", "entregue 5 h depois". */
export function textoPrazo(s: SituacaoPrazo): string {
  if (s.estado === "sem_prazo" || s.folgaMs === null) return "sem prazo";
  const d = duracao(s.folgaMs);
  switch (s.estado) {
    case "no_prazo":
    case "vence_logo":
      return `faltam ${d}`;
    case "atrasada":
      return `atrasada há ${d}`;
    case "entregue_no_prazo":
      return "entregue no prazo";
    case "entregue_atrasada":
      return `entregue ${d} depois`;
  }
}
