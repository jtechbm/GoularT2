import { compararMetas, type Realizado } from "./metas.ts";
import type { OnboardingResultado } from "./onboarding.ts";
import type { ClientGoal } from "./types.ts";

/**
 * Score de saúde do cliente, de 0 a 100.
 *
 * A regra que guia tudo aqui: o score só pode descontar por coisa que
 * alguém consegue explicar. Por isso cada critério devolve o motivo junto
 * com o peso, e a tela mostra a lista. Um número sozinho, sem o porquê,
 * vira superstição — a equipe começa a discutir o número em vez de
 * resolver o problema que ele aponta.
 *
 * Começa em 100 e desconta. Assim um cliente novo, sem histórico e sem
 * problema conhecido, nasce saudável em vez de nascer crítico só por
 * falta de dados.
 */
export interface Motivo {
  texto: string;
  /** negativo desconta, positivo devolve ponto */
  peso: number;
}

export interface Score {
  valor: number;
  classe: "saudavel" | "atencao" | "critico";
  motivos: Motivo[];
  /** o que mais pesou contra, para a tela mostrar em uma linha */
  principal: string | null;
}

export interface EntradaScore {
  revenue: number;
  prevRevenue: number;
  profit: number;
  goal: ClientGoal | null | undefined;
  realizado: Realizado;
  onboarding: OnboardingResultado;
  status: string;
  temResponsavel: boolean;
  /** contas conectadas que estão com erro ou paradas há dias */
  contasComProblema: number;
  contasConectadas: number;
  tarefasAtrasadas: number;
}

const LIMITE_ATENCAO = 70;
const LIMITE_CRITICO = 45;

export function calcularScore(e: EntradaScore): Score {
  const motivos: Motivo[] = [];
  const desconta = (texto: string, peso: number) => motivos.push({ texto, peso: -Math.abs(peso) });

  // --- evolução das vendas
  if (e.prevRevenue > 0) {
    const variacao = (e.revenue - e.prevRevenue) / e.prevRevenue;
    if (variacao <= -0.3) desconta(`Faturamento caiu ${Math.round(-variacao * 100)}% contra o mês anterior`, 25);
    else if (variacao <= -0.15) desconta(`Faturamento caiu ${Math.round(-variacao * 100)}%`, 15);
    else if (variacao <= -0.05) desconta(`Faturamento caiu ${Math.round(-variacao * 100)}%`, 6);
    else if (variacao >= 0.15) motivos.push({ texto: `Faturamento cresceu ${Math.round(variacao * 100)}%`, peso: 5 });
  } else if (e.revenue === 0 && e.status === "ativo") {
    desconta("Cliente ativo sem faturamento no mês", 20);
  }

  // --- margem
  if (e.revenue > 0) {
    const margem = e.profit / e.revenue;
    if (margem < 0) desconta("Operando no prejuízo", 25);
    else if (margem < 0.05) desconta(`Margem de apenas ${Math.round(margem * 100)}%`, 12);
  }

  // --- metas combinadas
  const progresso = compararMetas(e.goal, e.realizado);
  if (progresso.length) {
    const furadas = progresso.filter((p) => !p.bom);
    if (furadas.length) {
      // uma meta furada de sete não pode pesar o mesmo que cinco de sete
      const proporcao = furadas.length / progresso.length;
      desconta(
        `${furadas.length} de ${progresso.length} metas fora: ${furadas.map((f) => f.label.toLowerCase()).join(", ")}`,
        Math.round(20 * proporcao),
      );
    } else {
      motivos.push({ texto: "Todas as metas do mês sendo cumpridas", peso: 5 });
    }
  } else if (e.status === "ativo") {
    desconta("Sem metas definidas para o mês", 8);
  }

  // --- integrações
  if (e.contasComProblema > 0) {
    desconta(
      e.contasComProblema === 1 ? "Uma loja parou de atualizar" : `${e.contasComProblema} lojas pararam de atualizar`,
      15,
    );
  } else if (e.contasConectadas === 0 && e.status === "ativo") {
    desconta("Nenhuma loja conectada, os números entram à mão", 12);
  }

  // --- operação
  if (!e.temResponsavel) desconta("Sem responsável definido", 10);
  if (e.tarefasAtrasadas > 0) {
    desconta(
      e.tarefasAtrasadas === 1 ? "Uma tarefa atrasada" : `${e.tarefasAtrasadas} tarefas atrasadas`,
      Math.min(15, 5 * e.tarefasAtrasadas),
    );
  }

  // --- onboarding
  if (e.status === "onboarding" && !e.onboarding.completo) {
    desconta(
      `Onboarding em ${Math.round(e.onboarding.progresso * 100)}%, faltam ${e.onboarding.pendentesObrigatorios.length} itens obrigatórios`,
      Math.round(15 * (1 - e.onboarding.progresso)),
    );
  }

  const valor = Math.max(0, Math.min(100, 100 + motivos.reduce((s, m) => s + m.peso, 0)));
  const pior = [...motivos].sort((a, b) => a.peso - b.peso)[0];

  return {
    valor,
    classe: valor >= LIMITE_ATENCAO ? "saudavel" : valor >= LIMITE_CRITICO ? "atencao" : "critico",
    motivos: motivos.sort((a, b) => a.peso - b.peso),
    principal: pior && pior.peso < 0 ? pior.texto : null,
  };
}

export const SCORE_LABEL: Record<Score["classe"], string> = {
  saudavel: "Saudável",
  atencao: "Atenção",
  critico: "Crítico",
};

export const SCORE_TONE: Record<Score["classe"], "ok" | "warn" | "bad"> = {
  saudavel: "ok",
  atencao: "warn",
  critico: "bad",
};
