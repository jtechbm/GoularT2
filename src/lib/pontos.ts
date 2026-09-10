import { TASK_PRIORITIES, type TaskPriority } from "./types.ts";

/**
 * Como uma tarefa vira pontos.
 *
 * O problema do modelo anterior: pontos fixos por prioridade, liberados na
 * conclusão. Isso premiava quantidade. Dez tarefas pequenas rendiam mais
 * que uma difícil bem feita, e nada distinguia entrega no prazo de entrega
 * atrasada.
 *
 * Agora a nota tem três partes, e todas passam pela aprovação:
 *
 *   base       complexidade combinada quando a tarefa foi criada
 *   prazo      bônus por entregar dentro do prazo
 *   qualidade  bônus quando passa na revisão de primeira
 *
 * O desconto por retrabalho é proporcional e limitado: voltar da revisão
 * uma vez custa parte do bônus, não a tarefa inteira. Zerar a pontuação de
 * quem errou uma vez ensina a esconder erro, não a evitá-lo.
 */
export interface Pontuacao {
  base: number;
  prazo: number;
  qualidade: number;
  retrabalho: number;
  total: number;
  motivos: { texto: string; valor: number }[];
}

/** Bônus por entregar dentro do prazo, em fração da base. */
const BONUS_PRAZO = 0.3;
/** Bônus por passar na revisão sem nenhuma volta. */
const BONUS_QUALIDADE = 0.2;
/** Quanto cada volta na revisão custa, em fração da base. */
const CUSTO_VOLTA = 0.15;
/** Piso: nem a pior execução tira todo o valor do trabalho entregue. */
const PISO = 0.4;

export interface EntradaPontos {
  priority: TaskPriority | string;
  /** pontos definidos à mão na criação, quando houver */
  pointsOverride?: number | null;
  due_date: string | null;
  submitted_at: string | null;
  rejections: number;
  self_created: number;
}

export function pontosBase(priority: string, override?: number | null): number {
  if (override && override > 0) return override;
  return TASK_PRIORITIES.find((p) => p.value === priority)?.points ?? 10;
}

export function calcularPontos(t: EntradaPontos): Pontuacao {
  const base = pontosBase(t.priority, t.pointsOverride);
  const motivos: { texto: string; valor: number }[] = [{ texto: "Complexidade combinada", valor: base }];

  // no prazo = entregou para revisão até o fim do dia do vencimento.
  // Sem prazo definido, ninguém prometeu nada, então não há bônus nem
  // punição: dar o bônus faria toda tarefa sem prazo valer mais.
  let prazo = 0;
  if (t.due_date && t.submitted_at) {
    const limite = new Date(`${t.due_date}T23:59:59`);
    if (new Date(t.submitted_at) <= limite) {
      prazo = Math.round(base * BONUS_PRAZO);
      motivos.push({ texto: "Entregue no prazo", valor: prazo });
    } else {
      motivos.push({ texto: "Entregue fora do prazo", valor: 0 });
    }
  }

  const qualidade = t.rejections === 0 ? Math.round(base * BONUS_QUALIDADE) : 0;
  if (qualidade) motivos.push({ texto: "Aprovada de primeira", valor: qualidade });

  const bruto = base + prazo + qualidade;
  const desconto = Math.min(
    Math.round(base * CUSTO_VOLTA) * t.rejections,
    Math.round(bruto * (1 - PISO)),
  );
  if (desconto) {
    motivos.push({
      texto: t.rejections === 1 ? "Voltou uma vez da revisão" : `Voltou ${t.rejections} vezes da revisão`,
      valor: -desconto,
    });
  }

  return {
    base,
    prazo,
    qualidade,
    retrabalho: -desconto,
    total: Math.max(1, bruto - desconto),
    motivos,
  };
}

/** Entregou dentro do prazo? Usado na taxa de pontualidade do ranking. */
export function noPrazo(due_date: string | null, submitted_at: string | null): boolean | null {
  if (!due_date || !submitted_at) return null;
  return new Date(submitted_at) <= new Date(`${due_date}T23:59:59`);
}
