export type Role = "admin" | "gestor" | "membro";
export type ClientStatus = "onboarding" | "ativo" | "atencao" | "pausado" | "encerrado";
export type Marketplace = "mercado_livre" | "shopee";
export type TaskStatus = "disponivel" | "em_andamento" | "concluida";
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
  created_by: string | null;
  created_at: string;
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
