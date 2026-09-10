import { compararMetas, type GoalProgress, type Realizado } from "./metas.ts";
import type { Alerta } from "./alertas.ts";
import type { ClientGoal } from "./types.ts";

/**
 * Relatório mensal do cliente.
 *
 * O relatório é montado a partir do que já existe no sistema, sem campo
 * novo para alguém preencher. Um relatório que depende de digitação vira
 * relatório que ninguém emite.
 *
 * A regra que guia o texto: nada de superlativo automático. "Faturamento
 * subiu 12%" é fato; "excelente resultado" é opinião que o sistema não tem
 * como sustentar e que estraga a credibilidade quando o mês foi ruim.
 */
export interface DadosRelatorio {
  cliente: { id: string; name: string };
  refMonth: string;
  atual: { revenue: number; orders: number; profit: number; tax: number; ads: number; units: number };
  anterior: { revenue: number; orders: number; profit: number };
  porMarketplace: { marketplace: string; revenue: number; orders: number; profit: number }[];
  ads: { invested: number; revenue: number; clicks: number; orders: number };
  goal: ClientGoal | null | undefined;
  realizado: Realizado;
  alertas: Alerta[];
  tarefasConcluidas: { title: string; completed_at: string | null }[];
  proximasAcoes: { title: string; due_date: string | null }[];
  anotacoes: { body: string; created_at: string }[];
}

export interface Evolucao {
  texto: string;
  variacao: number;
  bom: boolean;
}

function variar(atual: number, anterior: number): number {
  if (!anterior) return atual > 0 ? 1 : 0;
  return (atual - anterior) / anterior;
}

/** As mudanças que valem ser ditas, com o número junto. */
export function evolucoes(d: DadosRelatorio): Evolucao[] {
  const saida: Evolucao[] = [];
  const pct = (v: number) => `${v > 0 ? "+" : ""}${Math.round(v * 100)}%`;

  const rev = variar(d.atual.revenue, d.anterior.revenue);
  if (d.anterior.revenue > 0 && Math.abs(rev) >= 0.03) {
    saida.push({
      texto: `Faturamento ${rev > 0 ? "subiu" : "caiu"} ${pct(Math.abs(rev))} contra o mês anterior`,
      variacao: rev,
      bom: rev > 0,
    });
  }

  const ped = variar(d.atual.orders, d.anterior.orders);
  if (d.anterior.orders > 0 && Math.abs(ped) >= 0.05) {
    saida.push({
      texto: `Pedidos ${ped > 0 ? "subiram" : "caíram"} ${pct(Math.abs(ped))}`,
      variacao: ped,
      bom: ped > 0,
    });
  }

  const margemAtual = d.atual.revenue ? d.atual.profit / d.atual.revenue : 0;
  const margemAntes = d.anterior.revenue ? d.anterior.profit / d.anterior.revenue : 0;
  if (margemAntes && Math.abs(margemAtual - margemAntes) >= 0.02) {
    const dif = margemAtual - margemAntes;
    saida.push({
      texto: `Margem ${dif > 0 ? "melhorou" : "apertou"} ${Math.abs(Math.round(dif * 100))} pontos, de ${Math.round(margemAntes * 100)}% para ${Math.round(margemAtual * 100)}%`,
      variacao: dif,
      bom: dif > 0,
    });
  }

  const ticketAtual = d.atual.orders ? d.atual.revenue / d.atual.orders : 0;
  const ticketAntes = d.anterior.orders ? d.anterior.revenue / d.anterior.orders : 0;
  const tk = variar(ticketAtual, ticketAntes);
  if (ticketAntes > 0 && Math.abs(tk) >= 0.05) {
    saida.push({
      texto: `Ticket médio ${tk > 0 ? "subiu" : "caiu"} ${pct(Math.abs(tk))}`,
      variacao: tk,
      bom: tk > 0,
    });
  }

  if (d.ads.invested > 0) {
    const roas = d.ads.revenue / d.ads.invested;
    saida.push({
      texto: `Ads devolveu ${roas.toFixed(2)}x o investido`,
      variacao: roas - 1,
      bom: roas >= 3,
    });
  }

  return saida;
}

export function metasDoRelatorio(d: DadosRelatorio): GoalProgress[] {
  return compararMetas(d.goal, d.realizado);
}

/**
 * Resumo curto para colar no WhatsApp.
 *
 * Texto puro, sem markdown e sem emoji de enfeite. O que vai por WhatsApp
 * precisa caber em uma tela de celular e ser lido em voz alta numa
 * ligação sem parecer estranho.
 */
export function resumoWhatsApp(d: DadosRelatorio): string {
  const brl = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  const [ano, mes] = d.refMonth.split("-");
  const nomeMes = [
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
  ][Number(mes) - 1];

  const linhas: string[] = [];
  linhas.push(`${d.cliente.name} — resultado de ${nomeMes} de ${ano}`);
  linhas.push("");
  linhas.push(`Faturamento: ${brl(d.atual.revenue)}`);
  linhas.push(`Pedidos: ${d.atual.orders}`);

  if (d.anterior.revenue > 0) {
    const v = variar(d.atual.revenue, d.anterior.revenue);
    linhas.push(`Contra o mês anterior: ${v > 0 ? "+" : ""}${Math.round(v * 100)}%`);
  }

  if (d.ads.invested > 0) {
    const roas = d.ads.revenue / d.ads.invested;
    linhas.push(`Ads: ${brl(d.ads.invested)} investido, retorno de ${roas.toFixed(2)}x`);
  }

  const metas = metasDoRelatorio(d);
  if (metas.length) {
    const batidas = metas.filter((m) => m.bom).length;
    linhas.push(`Metas: ${batidas} de ${metas.length} cumpridas`);
  }

  const feitas = d.tarefasConcluidas.length;
  if (feitas) linhas.push(`Entregas no mês: ${feitas}`);

  const criticos = d.alertas.filter((a) => a.nivel === "critico");
  if (criticos.length) {
    linhas.push("");
    linhas.push("Pontos de atenção:");
    for (const a of criticos.slice(0, 3)) linhas.push(`- ${a.titulo}`);
  }

  if (d.proximasAcoes.length) {
    linhas.push("");
    linhas.push("Próximos passos:");
    for (const t of d.proximasAcoes.slice(0, 3)) linhas.push(`- ${t.title}`);
  }

  return linhas.join("\n");
}
