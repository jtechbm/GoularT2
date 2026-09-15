/**
 * Regras puras de penalidade, sem banco nem rede, para dar para testar.
 */

/** Níveis de reputação do Mercado Livre, do pior para o melhor. */
export const NIVEIS_ML = ["1_red", "2_orange", "3_yellow", "4_light_green", "5_green"] as const;

export const NIVEL_LABEL: Record<string, string> = {
  "1_red": "vermelha",
  "2_orange": "laranja",
  "3_yellow": "amarela",
  "4_light_green": "verde-clara",
  "5_green": "verde",
};

/** Posição do nível: 1 é vermelho, 5 é verde. null quando a conta não tem cor. */
export function posicaoNivel(level: string | null | undefined): number | null {
  if (!level) return null;
  const n = Number(level.split("_")[0]);
  return Number.isFinite(n) && n >= 1 && n <= 5 ? n : null;
}

/**
 * O nível que vale para julgar a conta.
 *
 * Durante a proteção do programa Decola, o Mercado Livre mostra uma cor e
 * guarda a verdadeira em real_level. Olhar só a cor exibida esconderia
 * exatamente o vendedor que está afundando: ele aparece verde e está
 * vermelho por baixo, e a proteção acaba numa data.
 */
export function nivelEfetivo(r: { level_id?: string | null; real_level?: string | null }): string | null {
  return r.real_level ?? r.level_id ?? null;
}

export type Severidade = "critico" | "atencao" | "informativo";

export function severidadeDoNivel(level: string | null): Severidade {
  const p = posicaoNivel(level);
  if (p === null) return "informativo";
  if (p <= 2) return "critico";
  if (p === 3) return "atencao";
  return "informativo";
}

export interface MudancaReputacao {
  tipo: "piorou" | "melhorou" | "igual" | "primeira_leitura_ruim" | "primeira_leitura_ok" | "sem_cor";
  de: string | null;
  para: string | null;
}

/**
 * Compara a leitura atual com a anterior.
 *
 * Na primeira leitura não existe "antes", mas uma conta que já chega
 * amarela ou pior é penalidade em curso e precisa aparecer: esperar ela
 * piorar mais para avisar seria avisar tarde.
 */
export function compararReputacao(anterior: string | null, atual: string | null): MudancaReputacao {
  const pa = posicaoNivel(anterior);
  const pb = posicaoNivel(atual);

  if (pb === null) return { tipo: "sem_cor", de: anterior, para: atual };
  if (pa === null) {
    return { tipo: pb <= 3 ? "primeira_leitura_ruim" : "primeira_leitura_ok", de: null, para: atual };
  }
  if (pb < pa) return { tipo: "piorou", de: anterior, para: atual };
  if (pb > pa) return { tipo: "melhorou", de: anterior, para: atual };
  return { tipo: "igual", de: anterior, para: atual };
}

/**
 * Aviso oficial que conta como alerta de penalidade.
 *
 * A documentação separa os avisos em novidades, alertas, lançamentos,
 * treinamentos e publicidade, mas a conta real só mostrou a categoria
 * "NEW" até agora. Sem um exemplo de alerta verdadeiro, a regra olha dois
 * sinais: a categoria conter "ALERT", ou a subcategoria ou o título falar
 * de bloqueio, restrição, suspensão, infração ou regularização.
 *
 * Todos os avisos ficam gravados com a categoria bruta, então quando o
 * primeiro alerta real aparecer dá para conferir e ajustar esta regra.
 */
const PALAVRAS_ALERTA =
  /bloque|restri|suspen|infra[çc]|regulariz|penal|inabilit|moder|pausad|reputa[çc][ãa]o (caiu|baix|pior)/i;

export function avisoEhAlerta(n: { category?: string | null; sub_category?: string | null; title?: string | null }): boolean {
  if ((n.category ?? "").toUpperCase().includes("ALERT")) return true;
  const texto = `${n.sub_category ?? ""} ${n.title ?? ""}`;
  // o aviso de greve dos Correios diz que atrasos NÃO vão afetar a
  // reputação: negação explícita não é alerta
  if (/n[ãa]o (v[ãa]o |vai )?afetar/i.test(texto)) return false;
  return PALAVRAS_ALERTA.test(texto);
}

/** Tira HTML do corpo do aviso para caber numa notificação. */
export function textoPlano(html: string | null | undefined): string {
  return (html ?? "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
