import { compararMetas, type Realizado } from "./metas.ts";
import type { OnboardingResultado } from "./onboarding.ts";
import type { ClientGoal } from "./types.ts";

/**
 * Alertas operacionais.
 *
 * Eles são calculados na hora, a partir do estado atual, e não gravados.
 * Uma tabela de alertas envelhece mal: some o motivo e a linha continua
 * lá, ou o problema volta e ninguém reabre nada. Recalcular garante que o
 * que está na tela existe agora.
 *
 * O que fica gravado é só o que a equipe FEZ: marcar como resolvido. Para
 * isso cada alerta tem uma chave estável, montada com o tipo, o cliente e
 * o mês. Se o mesmo problema aparecer no mês seguinte, a chave muda e ele
 * volta a aparecer, que é o comportamento certo.
 */
export type NivelAlerta = "critico" | "atencao" | "informativo";

export interface Alerta {
  /** identidade estável do alerta, usada para marcar como resolvido */
  key: string;
  kind: string;
  nivel: NivelAlerta;
  titulo: string;
  detalhe: string;
  clientId: string | null;
  clientName: string | null;
  refMonth: string | null;
  href: string;
  /** título sugerido quando alguém transformar o alerta em tarefa */
  tarefaSugerida: string;
}

export const TIPOS_ALERTA: { kind: string; label: string }[] = [
  { kind: "queda_faturamento", label: "Queda de faturamento" },
  { kind: "acos_alto", label: "ACOS acima da meta" },
  { kind: "roas_baixo", label: "ROAS abaixo da meta" },
  { kind: "loja_parada", label: "Loja sem sincronização" },
  { kind: "sem_responsavel", label: "Cliente sem responsável" },
  { kind: "tarefa_atrasada", label: "Tarefa crítica atrasada" },
  { kind: "onboarding_incompleto", label: "Onboarding incompleto" },
  { kind: "contrato_sem_valor", label: "Contrato sem valores" },
  { kind: "cobranca_vencida", label: "Cobrança vencida" },
];

export const NIVEL_TOM: Record<NivelAlerta, "bad" | "warn" | "info"> = {
  critico: "bad",
  atencao: "warn",
  informativo: "info",
};

export const NIVEL_LABEL: Record<NivelAlerta, string> = {
  critico: "Crítico",
  atencao: "Atenção",
  informativo: "Informativo",
};

export interface ClienteParaAlerta {
  id: string;
  name: string;
  status: string;
  owner_id: string | null;
  monthly_fee: number;
  commission_pct: number;
  revenue: number;
  prev_revenue: number;
  profit: number;
  orders: number;
  goal: ClientGoal | null | undefined;
  realizado: Realizado;
  onboarding: OnboardingResultado;
  contasParadas: { marketplace: string; desde: string | null }[];
  tarefasCriticasAtrasadas: { id: string; title: string; due_date: string | null }[];
  cobrancasVencidas: { id: string; total: number; due_date: string | null }[];
}

export function alertasDoCliente(c: ClienteParaAlerta, refMonth: string): Alerta[] {
  const saida: Alerta[] = [];
  const base = `/clientes/${c.id}`;
  const add = (a: Omit<Alerta, "clientId" | "clientName" | "refMonth" | "key"> & { key: string }) =>
    saida.push({ ...a, clientId: c.id, clientName: c.name, refMonth });

  // --- queda de faturamento
  if (c.prev_revenue > 0) {
    const variacao = (c.revenue - c.prev_revenue) / c.prev_revenue;
    if (variacao <= -0.15) {
      add({
        key: `queda_faturamento:${c.id}:${refMonth}`,
        kind: "queda_faturamento",
        nivel: variacao <= -0.3 ? "critico" : "atencao",
        titulo: `Faturamento caiu ${Math.round(-variacao * 100)}%`,
        detalhe: `De ${c.prev_revenue.toFixed(2)} para ${c.revenue.toFixed(2)} contra o mês anterior.`,
        href: `${base}?mes=${refMonth}`,
        tarefaSugerida: `Investigar queda de faturamento de ${c.name}`,
      });
    }
  }

  // --- metas de Ads
  const progresso = compararMetas(c.goal, c.realizado);
  const acos = progresso.find((p) => p.key === "max_acos");
  if (acos && !acos.bom) {
    add({
      key: `acos_alto:${c.id}:${refMonth}`,
      kind: "acos_alto",
      nivel: acos.pct >= 1.5 ? "critico" : "atencao",
      titulo: `ACOS em ${(acos.realized * 100).toFixed(1)}%, meta é ${(acos.goal * 100).toFixed(1)}%`,
      detalhe: "O investimento em Ads está consumindo mais da receita do que o combinado.",
      href: `${base}?tab=ads&mes=${refMonth}`,
      tarefaSugerida: `Revisar campanhas de ${c.name} para baixar o ACOS`,
    });
  }
  const roas = progresso.find((p) => p.key === "min_roas");
  if (roas && !roas.bom) {
    add({
      key: `roas_baixo:${c.id}:${refMonth}`,
      kind: "roas_baixo",
      nivel: roas.pct <= 0.5 ? "critico" : "atencao",
      titulo: `ROAS em ${roas.realized.toFixed(2)}x, meta é ${roas.goal.toFixed(2)}x`,
      detalhe: "Cada real investido está voltando menos do que o combinado.",
      href: `${base}?tab=ads&mes=${refMonth}`,
      tarefaSugerida: `Revisar campanhas de ${c.name} para subir o ROAS`,
    });
  }

  // --- integrações paradas
  for (const conta of c.contasParadas) {
    add({
      key: `loja_parada:${c.id}:${conta.marketplace}`,
      kind: "loja_parada",
      nivel: "critico",
      titulo: `${conta.marketplace === "shopee" ? "Shopee" : "Mercado Livre"} sem atualizar`,
      detalhe: conta.desde
        ? `A última sincronização foi em ${conta.desde.slice(0, 10)}. Os números estão congelados desde então.`
        : "A loja nunca sincronizou.",
      href: `${base}?tab=marketplaces`,
      tarefaSugerida: `Reconectar a loja de ${c.name}`,
    });
  }

  // --- operação
  if (!c.owner_id && c.status !== "encerrado") {
    add({
      key: `sem_responsavel:${c.id}`,
      kind: "sem_responsavel",
      nivel: "atencao",
      titulo: "Sem responsável definido",
      detalhe: "Ninguém responde por este cliente hoje.",
      href: `${base}?tab=equipe`,
      tarefaSugerida: `Definir responsável por ${c.name}`,
    });
  }

  for (const t of c.tarefasCriticasAtrasadas) {
    add({
      key: `tarefa_atrasada:${t.id}`,
      kind: "tarefa_atrasada",
      nivel: "critico",
      titulo: `Tarefa atrasada: ${t.title}`,
      detalhe: t.due_date ? `O prazo era ${t.due_date}.` : "Sem prazo definido.",
      href: `/tarefas?cliente=${c.id}`,
      tarefaSugerida: t.title,
    });
  }

  if (c.status === "onboarding" && !c.onboarding.completo) {
    add({
      key: `onboarding_incompleto:${c.id}`,
      kind: "onboarding_incompleto",
      nivel: c.onboarding.progresso < 0.5 ? "atencao" : "informativo",
      titulo: `Onboarding em ${Math.round(c.onboarding.progresso * 100)}%`,
      detalhe: `Faltam: ${c.onboarding.pendentesObrigatorios.map((i) => i.label.toLowerCase()).join(", ")}.`,
      href: base,
      tarefaSugerida: `Concluir onboarding de ${c.name}`,
    });
  }

  if (c.monthly_fee === 0 && c.commission_pct === 0 && c.status !== "encerrado") {
    add({
      key: `contrato_sem_valor:${c.id}`,
      kind: "contrato_sem_valor",
      nivel: "atencao",
      titulo: "Contrato sem valores",
      detalhe: "Sem mensalidade nem comissão, este cliente nunca entra na cobrança.",
      href: `${base}?tab=dados`,
      tarefaSugerida: `Definir o contrato de ${c.name}`,
    });
  }

  for (const cob of c.cobrancasVencidas) {
    add({
      key: `cobranca_vencida:${cob.id}`,
      kind: "cobranca_vencida",
      nivel: "critico",
      titulo: `Cobrança vencida de ${cob.total.toFixed(2)}`,
      detalhe: cob.due_date ? `Venceu em ${cob.due_date}.` : "Sem data de vencimento.",
      href: "/financeiro",
      tarefaSugerida: `Cobrar ${c.name}`,
    });
  }

  return saida;
}

export function ordenarAlertas(alertas: Alerta[]): Alerta[] {
  const ordem: Record<NivelAlerta, number> = { critico: 0, atencao: 1, informativo: 2 };
  return [...alertas].sort(
    (a, b) => ordem[a.nivel] - ordem[b.nivel] || (a.clientName ?? "").localeCompare(b.clientName ?? ""),
  );
}
