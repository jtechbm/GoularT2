import type { Client, ClientGoal, ClientMarketplace } from "./types.ts";

/**
 * Onboarding como processo, não como rótulo.
 *
 * O status "Onboarding" era só uma palavra no cadastro: ninguém sabia o
 * que faltava nem quando o cliente podia virar Ativo. Aqui cada item é
 * derivado do que já existe no sistema, então não há checklist para
 * ninguém marcar à mão e esquecer de atualizar. A única exceção são os
 * dois itens de trabalho (primeira análise e estratégia), que dependem de
 * alguém ter registrado a anotação.
 */
export interface OnboardingItem {
  key: string;
  label: string;
  /** obrigatório trava a virada para Ativo; opcional só informa */
  obrigatorio: boolean;
  feito: boolean;
  /** para onde mandar quem quiser resolver */
  href?: string;
  hint?: string;
}

export interface OnboardingEntrada {
  client: Client;
  accounts: ClientMarketplace[];
  team: { user_id: string }[];
  goal: ClientGoal | null | undefined;
  /** anotações do cliente, usadas para os dois itens de trabalho */
  notes: { kind: string; body: string }[];
  /** custo de produto lançado em algum snapshot do mês */
  temCustos: boolean;
}

export interface OnboardingResultado {
  itens: OnboardingItem[];
  /** 0 a 1, contando obrigatórios e opcionais */
  progresso: number;
  pendentesObrigatorios: OnboardingItem[];
  /** pode virar Ativo */
  completo: boolean;
}

export function avaliarOnboarding(e: OnboardingEntrada): OnboardingResultado {
  const base = `/clientes/${e.client.id}`;
  const conectada = (m: string) => e.accounts.some((a) => a.marketplace === m && a.status === "conectado");
  const cadastrada = (m: string) => e.accounts.some((a) => a.marketplace === m);

  const itens: OnboardingItem[] = [
    {
      key: "dados",
      label: "Dados cadastrais preenchidos",
      obrigatorio: true,
      feito: Boolean(e.client.doc && e.client.contact_name && e.client.contact_phone),
      href: `${base}?tab=dados`,
      hint: "documento, contato e telefone",
    },
    {
      key: "contrato",
      label: "Contrato configurado",
      obrigatorio: true,
      feito: e.client.monthly_fee > 0 || e.client.commission_pct > 0,
      href: `${base}?tab=dados`,
      hint: "mensalidade ou comissão",
    },
    {
      key: "responsavel",
      label: "Responsável definido",
      obrigatorio: true,
      feito: Boolean(e.client.owner_id),
      href: `${base}?tab=equipe`,
    },
    {
      key: "equipe",
      label: "Equipe definida",
      obrigatorio: false,
      feito: e.team.length > 0,
      href: `${base}?tab=equipe`,
      hint: "quem opera o dia a dia",
    },
    {
      key: "ml",
      label: "Mercado Livre conectado",
      obrigatorio: true,
      feito: conectada("mercado_livre"),
      href: `${base}?tab=marketplaces`,
    },
    {
      // só cobra Shopee de quem opera Shopee: exigir de todo mundo
      // deixaria metade da carteira eternamente incompleta
      key: "shopee",
      label: "Shopee conectada",
      obrigatorio: false,
      feito: conectada("shopee"),
      href: `${base}?tab=marketplaces`,
      hint: cadastrada("shopee") ? "conta cadastrada, falta autorizar" : "não se aplica a quem não usa",
    },
    {
      key: "metas",
      label: "Metas definidas",
      obrigatorio: true,
      feito: Boolean(e.goal),
      href: `${base}?tab=metas`,
    },
    {
      key: "custos",
      label: "Custos informados",
      obrigatorio: false,
      feito: e.temCustos,
      href: `${base}?tab=financeiro`,
      hint: "custo de produto, para o lucro sair certo",
    },
    {
      key: "analise",
      label: "Primeira análise concluída",
      obrigatorio: true,
      feito: e.notes.some((n) => n.kind === "reuniao" || /an[áa]lise/i.test(n.body)),
      href: `${base}?tab=historico`,
      hint: "registre como anotação de reunião",
    },
    {
      key: "estrategia",
      label: "Estratégia inicial registrada",
      obrigatorio: false,
      feito: Boolean(e.client.summary?.trim()) || e.notes.some((n) => /estrat[ée]gia/i.test(n.body)),
      href: `${base}?tab=dados`,
      hint: "o resumo do cliente serve",
    },
  ];

  const pendentesObrigatorios = itens.filter((i) => i.obrigatorio && !i.feito);

  return {
    itens,
    progresso: itens.filter((i) => i.feito).length / itens.length,
    pendentesObrigatorios,
    completo: pendentesObrigatorios.length === 0,
  };
}
