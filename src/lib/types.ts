export type Role = "admin" | "gestor" | "membro";
export type ClientStatus = "onboarding" | "ativo" | "atencao" | "pausado" | "encerrado";
export type Marketplace = "mercado_livre" | "shopee";
/**
 * Etapas do quadro.
 *
 * "concluida" passa a significar APROVADA. Uma tarefa que o funcionário
 * terminou vai para "em_revisao" e só o gestor a move para concluída.
 * Antes, concluída queria dizer duas coisas — "acabei" e "está certo" — e
 * os pontos eram liberados sem ninguém olhar.
 */
export type TaskStatus = "disponivel" | "assumida" | "em_andamento" | "em_revisao" | "concluida";
export type TaskPriority = "baixa" | "media" | "alta" | "urgente";

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  job_title: string | null;
  color: string;
  active: number;
  created_at: string;
}

/** 'cliente' é atendido pela operação; 'propria' é loja do próprio Kadu. */
export type ClientKind = "cliente" | "propria";

export interface Client {
  id: string;
  kind: ClientKind;
  name: string;
  trade_name: string | null;
  doc: string | null;
  status: ClientStatus;
  segment: string | null;
  tier: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  fee_model: string;
  monthly_fee: number;
  commission_pct: number;
  started_at: string | null;
  owner_id: string | null;
  summary: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClientMarketplace {
  id: string;
  client_id: string;
  marketplace: Marketplace;
  nickname: string | null;
  external_id: string | null;
  status: "pendente" | "conectado" | "erro" | "desativado";
  credentials: string | null;
  last_sync_at: string | null;
  /** última vez que a sincronização terminou SEM erro */
  last_success_at: string | null;
  /** até que dia o histórico diário já foi preenchido */
  daily_synced_until: string | null;
  last_error: string | null;
  created_at: string;
  /** link de autorização enviado ao lojista */
  auth_token: string | null;
  auth_expires_at: string | null;
  auth_used_at: string | null;
  authorized_at: string | null;
  authorized_ip: string | null;
  auth_created_by: string | null;
}

export interface FinanceSnapshot {
  id: string;
  client_id: string;
  marketplace: Marketplace;
  ref_month: string;
  revenue: number;
  orders: number;
  units: number;
  cogs: number;
  fees: number;
  shipping: number;
  tax: number;
  ads: number;
  profit: number;
  source: "manual" | "api";
  updated_by: string | null;
  updated_at: string;
}

export interface AdsEntry {
  id: string;
  client_id: string;
  marketplace: Marketplace;
  campaign: string | null;
  period_start: string;
  period_end: string;
  invested: number;
  revenue: number;
  clicks: number;
  orders: number;
  notes: string | null;
  /** 'api' = veio da sincronização e é reescrito a cada rodada; 'manual' = digitado. */
  source: "manual" | "api";
  external_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface ClientNote {
  id: string;
  client_id: string;
  user_id: string | null;
  kind: "nota" | "reuniao" | "alerta" | "mudanca" | "financeiro";
  body: string;
  pinned: number;
  created_at: string;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  client_id: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  due_date: string | null;
  points: number;
  created_by: string | null;
  assignee_id: string | null;
  claimed_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  /** quando o trabalho começou de fato, não quando a tarefa foi pega */
  started_at: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  review_note: string | null;
  /** o gestor exige link ou anexo antes de mandar para revisão */
  requires_evidence: number;
  /** quantas vezes voltou da revisão */
  rejections: number;
  /** a própria pessoa registrou a tarefa para si */
  self_created: number;
}

export interface TaskChecklistItem {
  id: string;
  task_id: string;
  label: string;
  required: number;
  done: number;
  done_by: string | null;
  done_at: string | null;
  position: number;
  created_at: string;
}

export interface TaskEvidence {
  id: string;
  task_id: string;
  kind: "link" | "nota";
  url: string | null;
  body: string | null;
  user_id: string | null;
  created_at: string;
}

export interface TaskComment {
  id: string;
  task_id: string;
  user_id: string | null;
  body: string;
  created_at: string;
}

/** Colunas do quadro, na ordem em que o trabalho anda. */
export const TASK_COLUMNS: { value: TaskStatus; label: string; hint: string }[] = [
  { value: "disponivel", label: "Disponíveis", hint: "sem dono, qualquer um pega" },
  { value: "assumida", label: "Assumidas", hint: "tem dono, ainda não começou" },
  { value: "em_andamento", label: "Em andamento", hint: "trabalho em curso" },
  { value: "em_revisao", label: "Em revisão", hint: "esperando o gestor aprovar" },
  { value: "concluida", label: "Concluídas", hint: "aprovadas, pontos liberados" },
];

export function taskColumnLabel(value: string): string {
  return TASK_COLUMNS.find((c) => c.value === value)?.label ?? value;
}

export const MARKETPLACES: { value: Marketplace; label: string; short: string; prep: string }[] = [
  // prep: "acesso ao Mercado Livre" x "acesso à Shopee"
  { value: "mercado_livre", label: "Mercado Livre", short: "ML", prep: "ao" },
  { value: "shopee", label: "Shopee", short: "SP", prep: "à" },
];

export const CLIENT_STATUS: { value: ClientStatus; label: string }[] = [
  { value: "onboarding", label: "Onboarding" },
  { value: "ativo", label: "Ativo" },
  { value: "atencao", label: "Atenção" },
  { value: "pausado", label: "Pausado" },
  { value: "encerrado", label: "Encerrado" },
];

export const TASK_PRIORITIES: { value: TaskPriority; label: string; points: number }[] = [
  { value: "baixa", label: "Baixa", points: 5 },
  { value: "media", label: "Média", points: 10 },
  { value: "alta", label: "Alta", points: 20 },
  { value: "urgente", label: "Urgente", points: 35 },
];

export const ROLES: { value: Role; label: string; description: string }[] = [
  { value: "admin", label: "Admin", description: "Acesso total, gerencia equipe e integrações" },
  { value: "gestor", label: "Gestor", description: "Gerencia carteira, tarefas e financeiro" },
  { value: "membro", label: "Membro", description: "Opera clientes atribuídos e pega tarefas" },
];

export function marketplaceLabel(value: string): string {
  return MARKETPLACES.find((m) => m.value === value)?.label ?? value;
}

// ---------------------------------------------------------------- financeiro da agência

export type ChargeStatus = "pendente" | "pago" | "cancelado";

export interface AgencyCharge {
  id: string;
  client_id: string;
  ref_month: string;
  fee: number;
  commission: number;
  extra: number;
  revenue_base: number;
  total: number;
  status: ChargeStatus;
  due_date: string | null;
  paid_at: string | null;
  method: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgencyExpense {
  id: string;
  ref_month: string;
  category: string;
  description: string;
  amount: number;
  recurring: number;
  paid: number;
  due_date: string | null;
  paid_at: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export const EXPENSE_CATEGORIES: { value: string; label: string }[] = [
  { value: "pessoal", label: "Pessoal e pró-labore" },
  { value: "ferramentas", label: "Ferramentas e software" },
  { value: "impostos", label: "Impostos e contabilidade" },
  { value: "marketing", label: "Marketing e comercial" },
  { value: "estrutura", label: "Estrutura e escritório" },
  { value: "terceiros", label: "Terceiros e freelas" },
  { value: "outros", label: "Outros" },
];

export const CHARGE_STATUS: { value: ChargeStatus; label: string }[] = [
  { value: "pendente", label: "A receber" },
  { value: "pago", label: "Recebido" },
  { value: "cancelado", label: "Cancelado" },
];

export function expenseCategoryLabel(value: string): string {
  return EXPENSE_CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

// ---------------------------------------------------------------- metas por cliente

/**
 * Meta de um cliente num mês. Todo campo é opcional de propósito:
 * null significa "sem meta definida", e não zero. Zero é uma meta válida
 * (por exemplo, orçamento de Ads zerado) e não pode virar sinônimo de vazio.
 */
export interface ClientGoal {
  id: string;
  client_id: string;
  ref_month: string;
  /** null = meta geral do cliente; preenchido = meta daquela loja */
  marketplace: Marketplace | null;
  revenue: number | null;
  orders: number | null;
  avg_ticket: number | null;
  min_margin: number | null;
  ads_budget: number | null;
  min_roas: number | null;
  max_acos: number | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type GoalKey = "revenue" | "orders" | "avg_ticket" | "min_margin" | "ads_budget" | "min_roas" | "max_acos";

/** Como cada meta se comporta: para cima é melhor, ou para baixo é melhor. */
export const GOAL_FIELDS: {
  key: GoalKey;
  label: string;
  /** "maior" = bater a meta é passar dela; "menor" = bater é ficar abaixo */
  direction: "maior" | "menor";
  format: "brl" | "int" | "pct" | "mult";
  hint?: string;
}[] = [
  { key: "revenue", label: "Faturamento no mês", direction: "maior", format: "brl" },
  { key: "orders", label: "Pedidos", direction: "maior", format: "int" },
  { key: "avg_ticket", label: "Ticket médio", direction: "maior", format: "brl" },
  { key: "min_margin", label: "Margem mínima", direction: "maior", format: "pct", hint: "lucro dividido pelo faturamento" },
  { key: "ads_budget", label: "Orçamento de Ads", direction: "menor", format: "brl", hint: "teto de investimento no mês" },
  { key: "min_roas", label: "ROAS mínimo", direction: "maior", format: "mult", hint: "receita de Ads dividida pelo investido" },
  { key: "max_acos", label: "ACOS máximo", direction: "menor", format: "pct", hint: "investido dividido pela receita de Ads" },
];
