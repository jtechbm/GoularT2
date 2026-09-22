/**
 * O jogo em cima das tarefas: nível, sequência e conquistas.
 *
 * Tudo sai dos pontos que a aprovação já dá (pontos.ts). Nada aqui cria
 * ponto novo: é só a forma de mostrar o que a pessoa já fez, para a tela do
 * membro ter o que perseguir além de uma lista de tarefas.
 */

/** Pontos acumulados para chegar a cada nível. */
export const NIVEIS: { minimo: number; nome: string }[] = [
  { minimo: 0, nome: "Iniciante" },
  { minimo: 100, nome: "Aprendiz" },
  { minimo: 250, nome: "Operador" },
  { minimo: 500, nome: "Especialista" },
  { minimo: 1000, nome: "Veterano" },
  { minimo: 2000, nome: "Mestre" },
  { minimo: 4000, nome: "Lenda" },
];

export interface Nivel {
  numero: number;
  nome: string;
  /** pontos que faltam para o próximo; null no último nível */
  faltam: number | null;
  proximoNome: string | null;
  /** 0 a 1, dentro do nível atual */
  progresso: number;
}

export function nivelDe(pontos: number): Nivel {
  let i = 0;
  while (i + 1 < NIVEIS.length && pontos >= NIVEIS[i + 1].minimo) i += 1;
  const atual = NIVEIS[i];
  const proximo = NIVEIS[i + 1] ?? null;
  return {
    numero: i + 1,
    nome: atual.nome,
    faltam: proximo ? proximo.minimo - pontos : null,
    proximoNome: proximo?.nome ?? null,
    progresso: proximo ? (pontos - atual.minimo) / (proximo.minimo - atual.minimo) : 1,
  };
}

/**
 * Dias seguidos com entrega, contando de hoje (ou de ontem, para a sequência
 * não zerar de manhã antes da primeira entrega do dia). `dias` são datas
 * AAAA-MM-DD em que a pessoa enviou ou teve tarefa aprovada.
 */
export function sequenciaDeDias(dias: string[], hoje: string): number {
  const feitos = new Set(dias);
  const menos = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) - n * 864e5).toISOString().slice(0, 10);
  let inicio = feitos.has(hoje) ? hoje : menos(hoje, 1);
  if (!feitos.has(inicio)) return 0;
  let n = 0;
  while (feitos.has(inicio)) {
    n += 1;
    inicio = menos(inicio, 1);
  }
  return n;
}

export interface Conquista {
  chave: string;
  emoji: string;
  nome: string;
  como: string;
  ganhou: boolean;
}

/** Conquistas do mês, a partir do desempenho que o ranking já calcula. */
export function conquistasDoMes(m: {
  aprovadas: number;
  noPrazo: number;
  comPrazo: number;
  retrabalho: number;
  posicao: number | null;
  sequencia: number;
}): Conquista[] {
  return [
    {
      chave: "primeira",
      emoji: "🎯",
      nome: "Primeira do mês",
      como: "Ter uma tarefa aprovada no mês",
      ganhou: m.aprovadas >= 1,
    },
    {
      chave: "pontual",
      emoji: "⏱️",
      nome: "Pontual",
      como: "90% ou mais entregue no prazo (mínimo 3 com prazo)",
      ganhou: m.comPrazo >= 3 && m.noPrazo / m.comPrazo >= 0.9,
    },
    {
      chave: "de_primeira",
      emoji: "✨",
      nome: "De primeira",
      como: "3 ou mais aprovadas sem nenhuma voltar da revisão",
      ganhou: m.aprovadas >= 3 && m.retrabalho === 0,
    },
    {
      chave: "maratona",
      emoji: "🏃",
      nome: "Maratonista",
      como: "10 tarefas aprovadas no mês",
      ganhou: m.aprovadas >= 10,
    },
    {
      chave: "sequencia",
      emoji: "🔥",
      nome: "Em chamas",
      como: "5 dias seguidos entregando",
      ganhou: m.sequencia >= 5,
    },
    {
      chave: "topo",
      emoji: "🏆",
      nome: "Topo do ranking",
      como: "Estar em 1º no ranking do mês",
      ganhou: m.posicao === 1 && m.aprovadas > 0,
    },
  ];
}
