import { GOAL_FIELDS, type ClientGoal, type GoalKey } from "./types.ts";

/**
 * Comparação entre o que foi combinado e o que aconteceu.
 *
 * Duas decisões que evitam leitura errada:
 *
 * 1. "abaixo", "dentro" e "acima" descrevem só a POSIÇÃO do realizado em
 *    relação à meta. Se isso é bom ou ruim depende do sentido da meta, e
 *    quem responde isso é o campo `bom`. Gastar menos que o orçamento de
 *    Ads fica "abaixo" e é ótimo; faturar abaixo da meta é ruim. Misturar
 *    as duas coisas num rótulo só faria o ACOS parecer excelente quando
 *    está estourado.
 *
 * 2. `pct` é sempre realizado dividido pela meta, sem inverter para metas
 *    de teto. 80% do orçamento de Ads quer dizer que sobrou 20%.
 */
export interface GoalProgress {
  key: GoalKey;
  label: string;
  hint?: string;
  format: "brl" | "int" | "pct" | "mult";
  direction: "maior" | "menor";
  goal: number;
  realized: number;
  /** realizado ÷ meta. 1 = em cima da meta. */
  pct: number;
  position: "abaixo" | "dentro" | "acima";
  /** se a posição é a desejada para o sentido desta meta */
  bom: boolean;
}

/** Faixa de tolerância em volta da meta que ainda conta como "dentro". */
const TOLERANCIA = 0.05;

export interface Realizado {
  revenue: number;
  orders: number;
  profit: number;
  ads: number;
  adsRevenue: number;
}

/** Traduz os números do mês para a mesma chave que a meta usa. */
export function realizadoPorMeta(r: Realizado): Record<GoalKey, number> {
  return {
    revenue: r.revenue,
    orders: r.orders,
    avg_ticket: r.orders ? r.revenue / r.orders : 0,
    min_margin: r.revenue ? r.profit / r.revenue : 0,
    ads_budget: r.ads,
    min_roas: r.ads ? r.adsRevenue / r.ads : 0,
    max_acos: r.adsRevenue ? r.ads / r.adsRevenue : 0,
  };
}

export function compararMetas(goal: ClientGoal | null | undefined, realizado: Realizado): GoalProgress[] {
  if (!goal) return [];
  const valores = realizadoPorMeta(realizado);

  return GOAL_FIELDS.flatMap((campo) => {
    const meta = goal[campo.key];
    // null é ausência de meta; zero é meta de verdade e precisa ser avaliado
    if (meta === null || meta === undefined) return [];

    const real = valores[campo.key];
    const pct = meta === 0 ? (real === 0 ? 1 : Infinity) : real / meta;

    const position: GoalProgress["position"] =
      pct > 1 + TOLERANCIA ? "acima" : pct < 1 - TOLERANCIA ? "abaixo" : "dentro";

    const bom =
      position === "dentro" ||
      (campo.direction === "maior" ? position === "acima" : position === "abaixo");

    return [
      {
        key: campo.key,
        label: campo.label,
        hint: campo.hint,
        format: campo.format,
        direction: campo.direction,
        goal: meta,
        realized: real,
        pct,
        position,
        bom,
      },
    ];
  });
}

/** Quanto das metas definidas está sendo cumprido, de 0 a 1. */
export function aproveitamento(progresso: GoalProgress[]): number {
  if (!progresso.length) return 0;
  return progresso.filter((p) => p.bom).length / progresso.length;
}
