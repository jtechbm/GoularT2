import "server-only";
import { all, one } from "./db";
import { addMonths, currentMonth, lastMonths, monthLabel } from "./format";
import { avaliarOnboarding } from "./onboarding";
import { calcularScore, type Score } from "./score";
import { alertasDoCliente, ordenarAlertas, type Alerta } from "./alertas";
import type {
  AdsEntry,
  AgencyCharge,
  AgencyExpense,
  Client,
  ClientMarketplace,
  ClientGoal,
  ClientNote,
  TaskChecklistItem,
  TaskComment,
  TaskEvidence,
  FinanceSnapshot,
  Task,
  User,
} from "./types";

export interface Totals {
  revenue: number;
  profit: number;
  tax: number;
  ads: number;
  fees: number;
  shipping: number;
  cogs: number;
  orders: number;
}

const EMPTY: Totals = { revenue: 0, profit: 0, tax: 0, ads: 0, fees: 0, shipping: 0, cogs: 0, orders: 0 };

const SUM = `
  COALESCE(SUM(revenue),0)  AS revenue,
  COALESCE(SUM(profit),0)   AS profit,
  COALESCE(SUM(tax),0)      AS tax,
  COALESCE(SUM(ads),0)      AS ads,
  COALESCE(SUM(fees),0)     AS fees,
  COALESCE(SUM(shipping),0) AS shipping,
  COALESCE(SUM(cogs),0)     AS cogs,
  COALESCE(SUM(orders),0)   AS orders`;

/**
 * Lista de clientes que a pessoa enxerga, vinda de visibleClientIds().
 * `null` ou `undefined` = a carteira inteira, sem restrição.
 */
export type Scope = string[] | null | undefined;

/**
 * Fragmento SQL que limita a consulta ao escopo.
 *
 * Escopo vazio precisa virar uma condição falsa, e não sumir: um membro
 * sem cliente atribuído tem que ver zero, nunca tudo.
 */
function scoped(scope: Scope, column = "client_id"): { sql: string; params: string[] } {
  if (!scope) return { sql: "", params: [] };
  if (!scope.length) return { sql: " AND 1 = 0", params: [] };
  return { sql: ` AND ${column} IN (${scope.map(() => "?").join(",")})`, params: scope };
}

export async function totalsForMonth(refMonth: string, scope?: Scope): Promise<Totals> {
  const s = scoped(scope);
  return (
    (await one<Totals>(`SELECT ${SUM} FROM finance_snapshots WHERE ref_month = ?${s.sql}`, refMonth, ...s.params)) ??
    EMPTY
  );
}

export async function totalsForClient(clientId: string, refMonth: string): Promise<Totals> {
  return (
    (await one<Totals>(
      `SELECT ${SUM} FROM finance_snapshots WHERE client_id = ? AND ref_month = ?`,
      clientId,
      refMonth,
    )) ?? EMPTY
  );
}

export interface ClientRow extends Client {
  owner_name: string | null;
  owner_color: string | null;
  revenue: number;
  profit: number;
  tax: number;
  ads: number;
  orders: number;
  prev_revenue: number;
  prev_profit: number;
  marketplaces: string;
  team_size: number;
  open_tasks: number;
  last_note_at: string | null;
}

export async function clientRows(
  refMonth = currentMonth(),
  /** 'cliente' traz só a carteira; 'propria' só as lojas do Kadu; undefined traz tudo */
  kind?: "cliente" | "propria",
  scope?: Scope,
): Promise<ClientRow[]> {
  const prev = addMonths(refMonth, -1);
  const s = scoped(scope, "c.id");
  return all<ClientRow>(
    `SELECT c.*,
            u.name  AS owner_name,
            u.color AS owner_color,
            COALESCE(f.revenue,0)  AS revenue,
            COALESCE(f.profit,0)   AS profit,
            COALESCE(f.tax,0)      AS tax,
            COALESCE(f.ads,0)      AS ads,
            COALESCE(f.orders,0)   AS orders,
            COALESCE(p.revenue,0)  AS prev_revenue,
            COALESCE(p.profit,0)   AS prev_profit,
            COALESCE(m.list,'')    AS marketplaces,
            COALESCE(t.n,0)        AS team_size,
            COALESCE(k.n,0)        AS open_tasks,
            n.last_note_at
       FROM clients c
       LEFT JOIN users u ON u.id = c.owner_id
       LEFT JOIN (SELECT client_id, SUM(revenue) revenue, SUM(profit) profit, SUM(tax) tax,
                         SUM(ads) ads, SUM(orders) orders
                    FROM finance_snapshots WHERE ref_month = ? GROUP BY client_id) f ON f.client_id = c.id
       LEFT JOIN (SELECT client_id, SUM(revenue) revenue, SUM(profit) profit
                    FROM finance_snapshots WHERE ref_month = ? GROUP BY client_id) p ON p.client_id = c.id
       LEFT JOIN (SELECT client_id, string_agg(DISTINCT marketplace, ',') list
                    FROM client_marketplaces WHERE status <> 'desativado' GROUP BY client_id) m ON m.client_id = c.id
       LEFT JOIN (SELECT client_id, COUNT(*) n FROM client_team GROUP BY client_id) t ON t.client_id = c.id
       LEFT JOIN (SELECT client_id, COUNT(*) n FROM tasks
                   WHERE status <> 'concluida' AND client_id IS NOT NULL GROUP BY client_id) k ON k.client_id = c.id
       LEFT JOIN (SELECT client_id, MAX(created_at) last_note_at FROM client_notes GROUP BY client_id) n
              ON n.client_id = c.id
      WHERE 1 = 1 ${kind ? "AND c.kind = ?" : ""}${s.sql}
      ORDER BY (CASE c.status WHEN 'atencao' THEN 0 WHEN 'ativo' THEN 1 WHEN 'onboarding' THEN 2
                              WHEN 'pausado' THEN 3 ELSE 4 END),
               COALESCE(f.revenue,0) DESC, lower(c.name)`,
    refMonth,
    prev,
    ...(kind ? [kind] : []),
    ...s.params,
  );
}

export interface MonthPoint extends Totals {
  ref_month: string;
}

export async function monthlySeries(months: number, clientId?: string, scope?: Scope): Promise<MonthPoint[]> {
  const refs = lastMonths(months);
  const s = scoped(scope);
  const where = clientId ? "WHERE client_id = ? AND ref_month >= ?" : "WHERE ref_month >= ?";
  const params = clientId ? [clientId, refs[0]] : [refs[0]];
  const rows = await all<MonthPoint>(
    `SELECT ref_month, ${SUM} FROM finance_snapshots ${where}${s.sql} GROUP BY ref_month`,
    ...params,
    ...s.params,
  );
  const map = new Map(rows.map((r) => [r.ref_month, r]));
  return refs.map((ref) => map.get(ref) ?? { ref_month: ref, ...EMPTY });
}

export async function marketplaceBreakdown(refMonth: string, clientId?: string, scope?: Scope) {
  const s = scoped(scope);
  const where = clientId ? "WHERE ref_month = ? AND client_id = ?" : "WHERE ref_month = ?";
  const params = clientId ? [refMonth, clientId] : [refMonth];
  return all<Totals & { marketplace: string }>(
    `SELECT marketplace, ${SUM} FROM finance_snapshots ${where}${s.sql} GROUP BY marketplace ORDER BY revenue DESC`,
    ...params,
    ...s.params,
  );
}

/** Totais das lojas do próprio Kadu, separados da carteira. */
export async function ownStoreTotals(refMonth: string): Promise<Totals & { stores: number }> {
  const row = await one<Totals & { stores: number }>(
    `SELECT ${SUM}, COUNT(DISTINCT f.client_id) AS stores
       FROM finance_snapshots f
       JOIN clients c ON c.id = f.client_id
      WHERE f.ref_month = ? AND c.kind = 'propria'`,
    refMonth,
  );
  return row ?? { ...EMPTY, stores: 0 };
}

/** Faturamento e lucro das lojas próprias, mês a mês. */
export async function ownStoreSeries(months: number): Promise<MonthPoint[]> {
  const refs = lastMonths(months);
  const rows = await all<MonthPoint>(
    `SELECT f.ref_month, ${SUM}
       FROM finance_snapshots f
       JOIN clients c ON c.id = f.client_id
      WHERE f.ref_month >= ? AND c.kind = 'propria'
      GROUP BY f.ref_month`,
    refs[0],
  );
  const map = new Map(rows.map((r) => [r.ref_month, r]));
  return refs.map((ref) => map.get(ref) ?? { ref_month: ref, ...EMPTY });
}

export async function getClient(clientId: string): Promise<Client | null> {
  return one<Client>("SELECT * FROM clients WHERE id = ?", clientId);
}

export async function clientTeam(clientId: string) {
  return all<User & { team_role: string }>(
    `SELECT u.id, u.name, u.email, u.role, u.job_title, u.color, u.active, u.created_at,
            ct.role AS team_role
       FROM client_team ct
       JOIN users u ON u.id = ct.user_id
      WHERE ct.client_id = ? ORDER BY lower(u.name)`,
    clientId,
  );
}

export async function clientMarketplaces(clientId: string): Promise<ClientMarketplace[]> {
  return all<ClientMarketplace>(
    "SELECT * FROM client_marketplaces WHERE client_id = ? ORDER BY marketplace",
    clientId,
  );
}

export async function clientSnapshots(clientId: string, months = 6): Promise<FinanceSnapshot[]> {
  const refs = lastMonths(months);
  return all<FinanceSnapshot>(
    "SELECT * FROM finance_snapshots WHERE client_id = ? AND ref_month >= ? ORDER BY ref_month DESC, marketplace",
    clientId,
    refs[0],
  );
}

export async function clientNotes(clientId: string, limit = 50) {
  return all<ClientNote & { user_name: string | null; user_color: string | null }>(
    `SELECT n.*, u.name AS user_name, u.color AS user_color
       FROM client_notes n LEFT JOIN users u ON u.id = n.user_id
      WHERE n.client_id = ?
      ORDER BY n.pinned DESC, n.created_at DESC LIMIT ?`,
    clientId,
    limit,
  );
}

export async function clientAds(clientId: string, limit = 50) {
  return all<AdsEntry & { author: string | null }>(
    `SELECT a.*, u.name AS author FROM ads_entries a
       LEFT JOIN users u ON u.id = a.created_by
      WHERE a.client_id = ? ORDER BY a.period_start DESC, a.created_at DESC LIMIT ?`,
    clientId,
    limit,
  );
}

export interface TaskRow extends Task {
  client_name: string | null;
  assignee_name: string | null;
  assignee_color: string | null;
  creator_name: string | null;
}

const TASK_SELECT = `
  SELECT t.*, c.name AS client_name,
         a.name AS assignee_name, a.color AS assignee_color,
         cr.name AS creator_name
    FROM tasks t
    LEFT JOIN clients c ON c.id = t.client_id
    LEFT JOIN users a   ON a.id = t.assignee_id
    LEFT JOIN users cr  ON cr.id = t.created_by`;

export async function tasks(
  filter: {
    status?: string;
    /** várias etapas de uma vez; útil depois que o fluxo ganhou colunas */
    statuses?: string[];
    assignee?: string;
    clientId?: string;
    priority?: string;
  } = {},
): Promise<TaskRow[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.status) {
    where.push("t.status = ?");
    params.push(filter.status);
  }
  if (filter.statuses?.length) {
    where.push(`t.status IN (${filter.statuses.map(() => "?").join(",")})`);
    params.push(...filter.statuses);
  }
  if (filter.priority) {
    where.push("t.priority = ?");
    params.push(filter.priority);
  }
  if (filter.assignee) {
    where.push("t.assignee_id = ?");
    params.push(filter.assignee);
  }
  if (filter.clientId) {
    where.push("t.client_id = ?");
    params.push(filter.clientId);
  }
  return all<TaskRow>(
    `${TASK_SELECT} ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY (CASE t.priority WHEN 'urgente' THEN 0 WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END),
              (t.due_date IS NULL), t.due_date, t.created_at DESC`,
    ...params,
  );
}

export async function getTask(taskId: string): Promise<TaskRow | null> {
  return one<TaskRow>(`${TASK_SELECT} WHERE t.id = ?`, taskId);
}

/** Placar de pontos — base para a gamificação futura. */
export async function leaderboard(sinceIso?: string) {
  const since = sinceIso ?? new Date(Date.now() - 30 * 864e5).toISOString();
  return all<{ id: string; name: string; color: string; points: number; done: number }>(
    `SELECT u.id, u.name, u.color,
            COALESCE(SUM(e.points),0) AS points,
            COUNT(e.id) AS done
       FROM users u
       LEFT JOIN task_events e
              -- 'concluida' é o nome antigo, de quando concluir e pontuar
              -- eram a mesma ação. Fica aqui para o histórico não zerar.
              ON e.user_id = u.id AND e.type IN ('aprovada', 'concluida') AND e.created_at >= ?
      WHERE u.active = 1
      GROUP BY u.id, u.name, u.color
      ORDER BY points DESC, done DESC, lower(u.name)`,
    since,
  );
}

export async function channels() {
  return all<{
    id: string;
    slug: string;
    name: string;
    description: string | null;
    kind: string;
    client_id: string | null;
    client_name: string | null;
    messages: number;
    last_at: string | null;
  }>(
    `SELECT ch.*, c.name AS client_name,
            COALESCE(m.n,0) AS messages, m.last_at
       FROM chat_channels ch
       LEFT JOIN clients c ON c.id = ch.client_id
       LEFT JOIN (SELECT channel_id, COUNT(*) n, MAX(created_at) last_at
                    FROM chat_messages GROUP BY channel_id) m ON m.channel_id = ch.id
      ORDER BY (m.last_at IS NULL), m.last_at DESC, lower(ch.name)`,
  );
}

export async function messages(channelId: string, limit = 200) {
  const rows = await all<{
    id: string;
    body: string;
    created_at: string;
    user_id: string | null;
    user_name: string | null;
    user_color: string | null;
  }>(
    `SELECT m.id, m.body, m.created_at, m.user_id, u.name AS user_name, u.color AS user_color
       FROM chat_messages m LEFT JOIN users u ON u.id = m.user_id
      WHERE m.channel_id = ? ORDER BY m.created_at DESC LIMIT ?`,
    channelId,
    limit,
  );
  return rows.reverse();
}

export async function adsRows(
  filter: { refMonth?: string; clientId?: string; marketplace?: string; scope?: Scope } = {},
) {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.scope) {
    // escopo vazio tem que zerar o resultado, não liberá-lo
    where.push(filter.scope.length ? `a.client_id IN (${filter.scope.map(() => "?").join(",")})` : "1 = 0");
    params.push(...filter.scope);
  }
  if (filter.refMonth) {
    where.push("substr(a.period_start,1,7) <= ? AND substr(a.period_end,1,7) >= ?");
    params.push(filter.refMonth, filter.refMonth);
  }
  if (filter.clientId) {
    where.push("a.client_id = ?");
    params.push(filter.clientId);
  }
  if (filter.marketplace) {
    where.push("a.marketplace = ?");
    params.push(filter.marketplace);
  }
  return all<AdsEntry & { client_name: string; author: string | null }>(
    `SELECT a.*, c.name AS client_name, u.name AS author
       FROM ads_entries a
       JOIN clients c ON c.id = a.client_id
       LEFT JOIN users u ON u.id = a.created_by
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY a.period_start DESC, lower(c.name)`,
    ...params,
  );
}

export async function clientOptions(scope?: Scope) {
  const s = scoped(scope, "id");
  return all<{ id: string; name: string; status: string }>(
    `SELECT id, name, status FROM clients WHERE 1 = 1${s.sql} ORDER BY lower(name)`,
    ...s.params,
  );
}

/** Saúde das integrações: o que está quebrado ou parado de atualizar. */
export async function integrationHealth(scope?: Scope) {
  const esc = scoped(scope, "cm.client_id");
  const contas = await all<{
    id: string;
    client_id: string;
    client_name: string;
    marketplace: string;
    status: string;
    last_error: string | null;
    last_sync_at: string | null;
  }>(
    `SELECT cm.id, cm.client_id, cl.name AS client_name, cm.marketplace, cm.status,
            cm.last_error, cm.last_sync_at
       FROM client_marketplaces cm
       JOIN clients cl ON cl.id = cm.client_id
      WHERE cm.status IN ('conectado', 'erro')${esc.sql}
      ORDER BY cm.last_sync_at ASC NULLS FIRST`,
    ...esc.params,
  );

  const limite = Date.now() - 3 * 864e5;
  const comErro = contas.filter((c) => c.status === "erro");
  const paradas = contas.filter(
    (c) => c.status === "conectado" && (!c.last_sync_at || new Date(c.last_sync_at).getTime() < limite),
  );

  const ultimoCron = await one<{ created_at: string; status: string; message: string | null }>(
    "SELECT created_at, status, message FROM sync_logs WHERE marketplace = 'cron' ORDER BY created_at DESC LIMIT 1",
  );

  return { conectadas: contas.length - comErro.length, comErro, paradas, ultimoCron };
}

export async function syncLogs(limit = 20) {
  return all<{
    id: string;
    marketplace: string;
    ref_month: string | null;
    status: string;
    message: string | null;
    created_at: string;
    client_name: string | null;
  }>(
    `SELECT s.*, c.name AS client_name
       FROM sync_logs s
       LEFT JOIN client_marketplaces cm ON cm.id = s.client_marketplace_id
       LEFT JOIN clients c ON c.id = cm.client_id
      ORDER BY s.created_at DESC LIMIT ?`,
    limit,
  );
}

// ---------------------------------------------------------------- financeiro da agência

export interface ChargeRow extends AgencyCharge {
  client_name: string;
  client_status: string;
  fee_model: string;
}

/** Cobranças do mês, já com o cliente. Inclui clientes sem cobrança gerada ainda. */
export async function chargesForMonth(refMonth: string): Promise<ChargeRow[]> {
  return all<ChargeRow>(
    `SELECT ch.*, c.name AS client_name, c.status AS client_status, c.fee_model
       FROM agency_charges ch
       JOIN clients c ON c.id = ch.client_id
      WHERE ch.ref_month = ?
      ORDER BY (ch.status = 'pago'), ch.total DESC, lower(c.name)`,
    refMonth,
  );
}

/** Clientes ativos que ainda não têm cobrança no mês. */
export async function clientsWithoutCharge(refMonth: string) {
  return all<{ id: string; name: string; fee_model: string; monthly_fee: number; commission_pct: number }>(
    `SELECT c.id, c.name, c.fee_model, c.monthly_fee, c.commission_pct
       FROM clients c
      WHERE c.status NOT IN ('encerrado', 'pausado')
        AND c.kind = 'cliente'
        AND NOT EXISTS (SELECT 1 FROM agency_charges ch WHERE ch.client_id = c.id AND ch.ref_month = ?)
      ORDER BY lower(c.name)`,
    refMonth,
  );
}

export async function expensesForMonth(refMonth: string) {
  return all<AgencyExpense & { author: string | null }>(
    `SELECT e.*, u.name AS author
       FROM agency_expenses e LEFT JOIN users u ON u.id = e.created_by
      WHERE e.ref_month = ?
      ORDER BY e.paid, e.due_date NULLS LAST, e.amount DESC`,
    refMonth,
  );
}

export interface AgencyMonth {
  ref_month: string;
  billed: number;
  received: number;
  pending: number;
  expenses: number;
  expenses_paid: number;
}

const AGENCY_EMPTY = { billed: 0, received: 0, pending: 0, expenses: 0, expenses_paid: 0 };

export async function agencyTotals(refMonth: string): Promise<AgencyMonth> {
  const charges = await one<{ billed: number; received: number; pending: number }>(
    `SELECT COALESCE(SUM(total) FILTER (WHERE status <> 'cancelado'),0)  AS billed,
            COALESCE(SUM(total) FILTER (WHERE status = 'pago'),0)        AS received,
            COALESCE(SUM(total) FILTER (WHERE status = 'pendente'),0)    AS pending
       FROM agency_charges WHERE ref_month = ?`,
    refMonth,
  );
  const expenses = await one<{ expenses: number; expenses_paid: number }>(
    `SELECT COALESCE(SUM(amount),0) AS expenses,
            COALESCE(SUM(amount) FILTER (WHERE paid = 1),0) AS expenses_paid
       FROM agency_expenses WHERE ref_month = ?`,
    refMonth,
  );
  return { ref_month: refMonth, ...AGENCY_EMPTY, ...charges, ...expenses };
}

/** Série de receita e despesa da agência para o gráfico. */
export async function agencySeries(months: number): Promise<AgencyMonth[]> {
  const refs = lastMonths(months);
  const rows = await all<AgencyMonth>(
    `SELECT m.ref_month,
            COALESCE(c.billed,0)        AS billed,
            COALESCE(c.received,0)      AS received,
            COALESCE(c.pending,0)       AS pending,
            COALESCE(e.expenses,0)      AS expenses,
            COALESCE(e.expenses_paid,0) AS expenses_paid
       FROM (SELECT ref_month FROM agency_charges WHERE ref_month >= ?
             UNION SELECT ref_month FROM agency_expenses WHERE ref_month >= ?) m
       LEFT JOIN (SELECT ref_month,
                         SUM(total) FILTER (WHERE status <> 'cancelado') billed,
                         SUM(total) FILTER (WHERE status = 'pago')       received,
                         SUM(total) FILTER (WHERE status = 'pendente')   pending
                    FROM agency_charges GROUP BY ref_month) c ON c.ref_month = m.ref_month
       LEFT JOIN (SELECT ref_month, SUM(amount) expenses,
                         SUM(amount) FILTER (WHERE paid = 1) expenses_paid
                    FROM agency_expenses GROUP BY ref_month) e ON e.ref_month = m.ref_month`,
    refs[0],
    refs[0],
  );
  const map = new Map(rows.map((r) => [r.ref_month, r]));
  return refs.map((ref) => map.get(ref) ?? { ref_month: ref, ...AGENCY_EMPTY });
}

/** Quebra das despesas por categoria no mês. */
export async function expensesByCategory(refMonth: string) {
  return all<{ category: string; amount: number }>(
    `SELECT category, COALESCE(SUM(amount),0) AS amount
       FROM agency_expenses WHERE ref_month = ?
      GROUP BY category ORDER BY amount DESC`,
    refMonth,
  );
}

// ---------------------------------------------------------------- procedencia dos numeros

export interface ProcedenciaInfo {
  origem: "api" | "manual" | "misto" | "vazio";
  /** ultima vez que o DADO mudou, nunca a data de edicao do cadastro */
  atualizadoEm: string | null;
  /** contas de loja conectadas no recorte */
  contas: number;
  /** dessas contas, quantas ja trouxeram numero no mes */
  comDados: number;
}

function origemDe(api: number, manual: number): ProcedenciaInfo["origem"] {
  if (api && manual) return "misto";
  if (api) return "api";
  if (manual) return "manual";
  return "vazio";
}

/**
 * De onde vieram os numeros do mes e quando chegaram.
 *
 * O rodape do cliente mostrava clients.updated_at, que muda quando alguem
 * corrige um telefone. Quem lia achava que o faturamento era daquele dia.
 * Aqui a data vem de finance_snapshots.updated_at e de
 * client_marketplaces.last_sync_at, que sao os campos que realmente mudam
 * quando o numero muda.
 */
export async function procedenciaDoMes(
  refMonth: string,
  opcoes: { clientId?: string; scope?: Scope } = {},
): Promise<ProcedenciaInfo> {
  const esc = scoped(opcoes.scope, "client_id");
  const cli = opcoes.clientId ? " AND client_id = ?" : "";
  const pCli = opcoes.clientId ? [opcoes.clientId] : [];

  const snap = await one<{ api: number; manual: number; ultimo: string | null }>(
    `SELECT COUNT(*) FILTER (WHERE source = 'api')    AS api,
            COUNT(*) FILTER (WHERE source <> 'api')   AS manual,
            MAX(updated_at)                           AS ultimo
       FROM finance_snapshots
      WHERE ref_month = ?${cli}${esc.sql}`,
    refMonth,
    ...pCli,
    ...esc.params,
  );

  const contas = await one<{ total: number; ultimo: string | null }>(
    `SELECT COUNT(*) AS total, MAX(last_sync_at) AS ultimo
       FROM client_marketplaces
      WHERE status = 'conectado'${cli}${esc.sql}`,
    ...pCli,
    ...esc.params,
  );

  const api = snap?.api ?? 0;
  const manual = snap?.manual ?? 0;
  // a mais recente entre a gravacao do numero e a ultima sincronizacao
  const datas = [snap?.ultimo, contas?.ultimo].filter(Boolean) as string[];

  return {
    origem: origemDe(api, manual),
    atualizadoEm: datas.length ? datas.sort().at(-1)! : null,
    contas: contas?.total ?? 0,
    comDados: api + manual,
  };
}

// ---------------------------------------------------------------- metas

/** Meta geral do cliente no mês (marketplace IS NULL) e as metas por loja. */
export async function clientGoals(clientId: string, refMonth: string) {
  return all<ClientGoal>(
    "SELECT * FROM client_goals WHERE client_id = ? AND ref_month = ? ORDER BY marketplace NULLS FIRST",
    clientId,
    refMonth,
  );
}

/** Histórico das metas gerais, para ver se elas sobem ou ficam paradas. */
export async function goalHistory(clientId: string, months = 12) {
  return all<ClientGoal>(
    `SELECT * FROM client_goals
      WHERE client_id = ? AND marketplace IS NULL
      ORDER BY ref_month DESC LIMIT ?`,
    clientId,
    months,
  );
}

/** Investido e receita atribuída de Ads no mês, base do ROAS e do ACOS. */
export async function adsTotals(clientId: string, refMonth: string) {
  const row = await one<{ invested: number; revenue: number }>(
    `SELECT COALESCE(SUM(invested),0) AS invested, COALESCE(SUM(revenue),0) AS revenue
       FROM ads_entries
      WHERE client_id = ? AND substr(period_start,1,7) <= ? AND substr(period_end,1,7) >= ?`,
    clientId,
    refMonth,
    refMonth,
  );
  return row ?? { invested: 0, revenue: 0 };
}

/** Metas gerais de vários clientes de uma vez, para as listas. */
export async function goalsForMonth(refMonth: string, scope?: Scope) {
  const s = scoped(scope, "client_id");
  return all<ClientGoal>(
    `SELECT * FROM client_goals WHERE ref_month = ? AND marketplace IS NULL${s.sql}`,
    refMonth,
    ...s.params,
  );
}

// ---------------------------------------------------------------- onboarding

/**
 * Junta tudo que o checklist de onboarding precisa e devolve o resultado.
 *
 * Fica aqui, e não no componente, porque a ação de ativar o cliente precisa
 * refazer a mesma conta no servidor. Duas implementações divergiriam na
 * primeira mudança de regra.
 */
export async function avaliarOnboardingDoCliente(clientId: string, refMonth = currentMonth()) {
  const client = await getClient(clientId);
  if (!client) throw new Error("Cliente não encontrado.");

  const [accounts, team, metas, notas, custos] = await Promise.all([
    clientMarketplaces(clientId),
    all<{ user_id: string }>("SELECT user_id FROM client_team WHERE client_id = ?", clientId),
    all<ClientGoal>(
      "SELECT * FROM client_goals WHERE client_id = ? AND ref_month = ? AND marketplace IS NULL",
      clientId,
      refMonth,
    ),
    all<{ kind: string; body: string }>(
      "SELECT kind, body FROM client_notes WHERE client_id = ?",
      clientId,
    ),
    one<{ n: number }>(
      "SELECT COUNT(*) AS n FROM finance_snapshots WHERE client_id = ? AND cogs > 0",
      clientId,
    ),
  ]);

  return avaliarOnboarding({
    client,
    accounts,
    team,
    goal: metas[0],
    notes: notas,
    temCustos: (custos?.n ?? 0) > 0,
  });
}

/**
 * Onboarding de vários clientes de uma vez.
 *
 * Chamar avaliarOnboardingDoCliente num laço daria cinco consultas por
 * cliente. Aqui são cinco no total: carrega as tabelas inteiras do recorte
 * e agrupa na memória. Para uma agência com dezenas de clientes isso é
 * mais rápido do que a ida e volta repetida ao banco.
 */
export async function avaliarOnboardingEmLote(
  clients: Client[],
  refMonth = currentMonth(),
): Promise<Map<string, ReturnType<typeof avaliarOnboarding>>> {
  const saida = new Map<string, ReturnType<typeof avaliarOnboarding>>();
  if (!clients.length) return saida;

  const ids = clients.map((c) => c.id);
  const marcas = ids.map(() => "?").join(",");

  const [contas, times, metas, notas, custos] = await Promise.all([
    all<ClientMarketplace>(`SELECT * FROM client_marketplaces WHERE client_id IN (${marcas})`, ...ids),
    all<{ client_id: string; user_id: string }>(
      `SELECT client_id, user_id FROM client_team WHERE client_id IN (${marcas})`,
      ...ids,
    ),
    all<ClientGoal>(
      `SELECT * FROM client_goals WHERE ref_month = ? AND marketplace IS NULL AND client_id IN (${marcas})`,
      refMonth,
      ...ids,
    ),
    all<{ client_id: string; kind: string; body: string }>(
      `SELECT client_id, kind, body FROM client_notes WHERE client_id IN (${marcas})`,
      ...ids,
    ),
    all<{ client_id: string }>(
      `SELECT DISTINCT client_id FROM finance_snapshots WHERE cogs > 0 AND client_id IN (${marcas})`,
      ...ids,
    ),
  ]);

  const comCusto = new Set(custos.map((c) => c.client_id));

  for (const client of clients) {
    saida.set(
      client.id,
      avaliarOnboarding({
        client,
        accounts: contas.filter((a) => a.client_id === client.id),
        team: times.filter((t) => t.client_id === client.id),
        goal: metas.find((m) => m.client_id === client.id),
        notes: notas.filter((n) => n.client_id === client.id),
        temCustos: comCusto.has(client.id),
      }),
    );
  }

  return saida;
}

// ---------------------------------------------------------------- score de saude

/**
 * Score de todos os clientes de uma lista, em poucas consultas.
 *
 * Reaproveita o que clientRows já trouxe (faturamento, lucro, mês anterior,
 * responsável) e busca só o que falta: metas, Ads, tarefas atrasadas e
 * saúde das contas.
 */
export async function scoresEmLote(rows: ClientRow[], refMonth = currentMonth()): Promise<Map<string, Score>> {
  const saida = new Map<string, Score>();
  if (!rows.length) return saida;

  const ids = rows.map((r) => r.id);
  const marcas = ids.map(() => "?").join(",");
  const paradoDesde = new Date(Date.now() - 3 * 864e5).toISOString();
  const hoje = new Date().toISOString().slice(0, 10);

  const [metas, onboardings, ads, atrasadas, contas] = await Promise.all([
    goalsForMonth(refMonth, ids),
    avaliarOnboardingEmLote(rows, refMonth),
    all<{ client_id: string; invested: number; revenue: number }>(
      `SELECT client_id, COALESCE(SUM(invested),0) AS invested, COALESCE(SUM(revenue),0) AS revenue
         FROM ads_entries
        WHERE substr(period_start,1,7) <= ? AND substr(period_end,1,7) >= ? AND client_id IN (${marcas})
        GROUP BY client_id`,
      refMonth,
      refMonth,
      ...ids,
    ),
    all<{ client_id: string; n: number }>(
      `SELECT client_id, COUNT(*) AS n FROM tasks
        WHERE status <> 'concluida' AND due_date IS NOT NULL AND due_date < ?
          AND client_id IN (${marcas})
        GROUP BY client_id`,
      hoje,
      ...ids,
    ),
    all<{ client_id: string; conectadas: number; problema: number }>(
      `SELECT client_id,
              COUNT(*) FILTER (WHERE status = 'conectado') AS conectadas,
              COUNT(*) FILTER (WHERE status = 'erro'
                            OR (status = 'conectado' AND (last_sync_at IS NULL OR last_sync_at < ?))) AS problema
         FROM client_marketplaces
        WHERE status IN ('conectado','erro') AND client_id IN (${marcas})
        GROUP BY client_id`,
      paradoDesde,
      ...ids,
    ),
  ]);

  for (const row of rows) {
    const a = ads.find((x) => x.client_id === row.id);
    const c = contas.find((x) => x.client_id === row.id);
    const onboarding = onboardings.get(row.id)!;

    saida.set(
      row.id,
      calcularScore({
        revenue: row.revenue,
        prevRevenue: row.prev_revenue,
        profit: row.profit,
        goal: metas.find((m) => m.client_id === row.id),
        realizado: {
          revenue: row.revenue,
          orders: row.orders,
          profit: row.profit,
          ads: a?.invested ?? 0,
          adsRevenue: a?.revenue ?? 0,
        },
        onboarding,
        status: row.status,
        temResponsavel: Boolean(row.owner_id),
        contasComProblema: c?.problema ?? 0,
        contasConectadas: c?.conectadas ?? 0,
        tarefasAtrasadas: atrasadas.find((x) => x.client_id === row.id)?.n ?? 0,
      }),
    );
  }

  return saida;
}

// ---------------------------------------------------------------- alertas

export interface AlertaComResolucao extends Alerta {
  resolvido: boolean;
  resolvidoPor: string | null;
  resolvidoEm: string | null;
  resolvidoNota: string | null;
}

/**
 * Recalcula todos os alertas do recorte e cola neles o que já foi resolvido.
 *
 * Nada de alerta gravado: se o problema sumiu, ele não aparece. O que fica
 * no banco é só a marcação de "já cuidei disso", ligada por uma chave
 * estável que inclui o mês.
 */
export async function alertasDaCarteira(
  refMonth = currentMonth(),
  scope?: Scope,
): Promise<AlertaComResolucao[]> {
  const rows = await clientRows(refMonth, "cliente", scope);
  if (!rows.length) return [];

  const ids = rows.map((r) => r.id);
  const marcas = ids.map(() => "?").join(",");
  const paradoDesde = new Date(Date.now() - 3 * 864e5).toISOString();
  const hoje = new Date().toISOString().slice(0, 10);

  const [metas, onboardings, ads, contas, tarefas, cobrancas, resolucoes] = await Promise.all([
    goalsForMonth(refMonth, ids),
    avaliarOnboardingEmLote(rows, refMonth),
    all<{ client_id: string; invested: number; revenue: number }>(
      `SELECT client_id, COALESCE(SUM(invested),0) AS invested, COALESCE(SUM(revenue),0) AS revenue
         FROM ads_entries
        WHERE substr(period_start,1,7) <= ? AND substr(period_end,1,7) >= ? AND client_id IN (${marcas})
        GROUP BY client_id`,
      refMonth, refMonth, ...ids,
    ),
    all<{ client_id: string; marketplace: string; last_sync_at: string | null }>(
      `SELECT client_id, marketplace, last_sync_at FROM client_marketplaces
        WHERE client_id IN (${marcas})
          AND (status = 'erro' OR (status = 'conectado' AND (last_sync_at IS NULL OR last_sync_at < ?)))`,
      ...ids, paradoDesde,
    ),
    all<{ id: string; client_id: string; title: string; due_date: string | null }>(
      `SELECT id, client_id, title, due_date FROM tasks
        WHERE status <> 'concluida' AND due_date IS NOT NULL AND due_date < ?
          AND priority IN ('alta','urgente') AND client_id IN (${marcas})`,
      hoje, ...ids,
    ),
    all<{ id: string; client_id: string; total: number; due_date: string | null }>(
      `SELECT id, client_id, total, due_date FROM agency_charges
        WHERE status = 'pendente' AND due_date IS NOT NULL AND due_date < ?
          AND client_id IN (${marcas})`,
      hoje, ...ids,
    ),
    all<{ alert_key: string; resolved_at: string; note: string | null; nome: string | null }>(
      `SELECT a.alert_key, a.resolved_at, a.note, u.name AS nome
         FROM alert_resolutions a LEFT JOIN users u ON u.id = a.resolved_by`,
    ),
  ]);

  // campanhas do mês e do anterior: os alertas mais úteis são sobre
  // mudança, e mudança precisa de dois pontos no tempo
  const anterior = addMonths(refMonth, -1);
  const campanhasMes = await all<AdsEntry & { client_id: string }>(
    `SELECT * FROM ads_entries
      WHERE substr(period_start,1,7) <= ? AND substr(period_end,1,7) >= ? AND client_id IN (${marcas})`,
    refMonth, refMonth, ...ids,
  );
  const campanhasAntes = await all<AdsEntry & { client_id: string }>(
    `SELECT * FROM ads_entries
      WHERE substr(period_start,1,7) <= ? AND substr(period_end,1,7) >= ? AND client_id IN (${marcas})`,
    anterior, anterior, ...ids,
  );

  const porChave = new Map(resolucoes.map((r) => [r.alert_key, r]));

  const brutos = rows.flatMap((row) => {
    const a = ads.find((x) => x.client_id === row.id);
    return alertasDoCliente(
      {
        id: row.id,
        name: row.name,
        status: row.status,
        owner_id: row.owner_id,
        monthly_fee: row.monthly_fee,
        commission_pct: row.commission_pct,
        revenue: row.revenue,
        prev_revenue: row.prev_revenue,
        profit: row.profit,
        orders: row.orders,
        goal: metas.find((m) => m.client_id === row.id),
        realizado: {
          revenue: row.revenue,
          orders: row.orders,
          profit: row.profit,
          ads: a?.invested ?? 0,
          adsRevenue: a?.revenue ?? 0,
        },
        onboarding: onboardings.get(row.id)!,
        contasParadas: contas
          .filter((x) => x.client_id === row.id)
          .map((x) => ({ marketplace: x.marketplace, desde: x.last_sync_at })),
        tarefasCriticasAtrasadas: tarefas.filter((x) => x.client_id === row.id),
        cobrancasVencidas: cobrancas.filter((x) => x.client_id === row.id),
        campanhas: campanhasMes
          .filter((x) => x.client_id === row.id)
          .map((camp) => {
            // casa pelo id da campanha no marketplace; lançamento manual
            // não tem esse id e simplesmente não ganha comparação
            const antes = camp.external_id
              ? campanhasAntes.find((z) => z.client_id === row.id && z.external_id === camp.external_id)
              : undefined;
            return {
              id: camp.id,
              nome: camp.campaign ?? "sem nome",
              marketplace: camp.marketplace,
              invested: camp.invested,
              revenue: camp.revenue,
              clicks: camp.clicks,
              orders: camp.orders,
              budget: metas.find((m) => m.client_id === row.id)?.ads_budget ?? null,
              conversaoAnterior: antes && antes.clicks > 0 ? antes.orders / antes.clicks : null,
            };
          }),
      },
      refMonth,
    );
  });

  return ordenarAlertas(brutos).map((a) => {
    const r = porChave.get(a.key);
    return {
      ...a,
      resolvido: Boolean(r),
      resolvidoPor: r?.nome ?? null,
      resolvidoEm: r?.resolved_at ?? null,
      resolvidoNota: r?.note ?? null,
    };
  });
}

/** Investido e receita atribuída de Ads na carteira inteira, para o ROAS. */
export async function adsTotalsCarteira(refMonth: string, scope?: Scope) {
  const s = scoped(scope, "client_id");
  const row = await one<{ invested: number; revenue: number }>(
    `SELECT COALESCE(SUM(invested),0) AS invested, COALESCE(SUM(revenue),0) AS revenue
       FROM ads_entries
      WHERE substr(period_start,1,7) <= ? AND substr(period_end,1,7) >= ?${s.sql}`,
    refMonth,
    refMonth,
    ...s.params,
  );
  return row ?? { invested: 0, revenue: 0 };
}


/** Checklist, evidências e comentários de uma tarefa. */
export async function taskDetail(taskId: string) {
  const [checklist, evidencias, comentarios, eventos] = await Promise.all([
    all<TaskChecklistItem & { done_by_name: string | null }>(
      `SELECT k.*, u.name AS done_by_name FROM task_checklist k
         LEFT JOIN users u ON u.id = k.done_by
        WHERE k.task_id = ? ORDER BY k.position, k.created_at`,
      taskId,
    ),
    all<TaskEvidence & { user_name: string | null }>(
      `SELECT e.*, u.name AS user_name FROM task_evidence e
         LEFT JOIN users u ON u.id = e.user_id
        WHERE e.task_id = ? ORDER BY e.created_at DESC`,
      taskId,
    ),
    all<TaskComment & { user_name: string | null; user_color: string | null }>(
      `SELECT c.*, u.name AS user_name, u.color AS user_color FROM task_comments c
         LEFT JOIN users u ON u.id = c.user_id
        WHERE c.task_id = ? ORDER BY c.created_at`,
      taskId,
    ),
    all<{ id: string; type: string; points: number; meta: string | null; created_at: string; user_name: string | null }>(
      `SELECT e.id, e.type, e.points, e.meta, e.created_at, u.name AS user_name
         FROM task_events e LEFT JOIN users u ON u.id = e.user_id
        WHERE e.task_id = ? ORDER BY e.created_at DESC`,
      taskId,
    ),
  ]);
  return { checklist, evidencias, comentarios, eventos };
}

/** Contagem de itens de checklist por tarefa, para o cartão do quadro. */
export async function checklistResumo(taskIds: string[]) {
  if (!taskIds.length) return new Map<string, { total: number; feitos: number; obrigatoriosPendentes: number }>();
  const marcas = taskIds.map(() => "?").join(",");
  const rows = await all<{ task_id: string; total: number; feitos: number; pendentes: number }>(
    `SELECT task_id,
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE done = 1) AS feitos,
            COUNT(*) FILTER (WHERE required = 1 AND done = 0) AS pendentes
       FROM task_checklist WHERE task_id IN (${marcas}) GROUP BY task_id`,
    ...taskIds,
  );
  return new Map(
    rows.map((r) => [r.task_id, { total: r.total, feitos: r.feitos, obrigatoriosPendentes: r.pendentes }]),
  );
}


/**
 * Ranking do mês: pontos, entregas e pontualidade.
 *
 * Conta só eventos de aprovação com pontos maiores que zero. Reaprovação
 * de tarefa reaberta grava evento com zero, então não infla o ranking.
 */
export async function rankingMensal(refMonth = currentMonth()) {
  const inicio = `${refMonth}-01`;
  const fim = `${addMonths(refMonth, 1)}-01`;

  const linhas = await all<{
    id: string;
    name: string;
    color: string;
    points: number;
    concluidas: number;
    no_prazo: number;
    com_prazo: number;
    retrabalho: number;
  }>(
    `SELECT u.id, u.name, u.color,
            COALESCE(SUM(e.points), 0)                                  AS points,
            COUNT(e.id)                                                 AS concluidas,
            COUNT(*) FILTER (WHERE t.due_date IS NOT NULL
                               AND t.submitted_at IS NOT NULL
                               AND t.submitted_at <= t.due_date || 'T23:59:59') AS no_prazo,
            COUNT(*) FILTER (WHERE t.due_date IS NOT NULL AND e.id IS NOT NULL) AS com_prazo,
            COALESCE(SUM(t.rejections), 0)                              AS retrabalho
       FROM users u
       LEFT JOIN task_events e
              ON e.user_id = u.id AND e.type IN ('aprovada', 'concluida')
             AND e.points > 0 AND e.created_at >= ? AND e.created_at < ?
       LEFT JOIN tasks t ON t.id = e.task_id
      WHERE u.active = 1
      GROUP BY u.id, u.name, u.color
      ORDER BY points DESC, concluidas DESC, lower(u.name)`,
    inicio,
    fim,
  );

  return linhas.map((l) => ({
    ...l,
    // sem tarefa com prazo no mês, pontualidade não existe; null é mais
    // honesto do que 0%, que pareceria mau desempenho
    pontualidade: l.com_prazo ? l.no_prazo / l.com_prazo : null,
  }));
}


// ---------------------------------------------------------------- historico diario

export interface DiaFinanceiro {
  day: string;
  revenue: number;
  orders: number;
  units: number;
  fees: number;
  shipping: number;
  tax: number;
  ads: number;
  ads_revenue: number;
  clicks: number;
  prints: number;
}

/** Traduz o atalho da tela em um intervalo de datas fechado. */
export function periodoDe(
  atalho: string,
  refMonth = currentMonth(),
  de?: string,
  ate?: string,
): { inicio: string; fim: string; label: string } {
  const hoje = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  if (atalho === "personalizado" && de && ate) {
    return { inicio: de, fim: ate, label: "período escolhido" };
  }
  if (atalho === "7d") {
    return { inicio: iso(new Date(hoje.getTime() - 6 * 864e5)), fim: iso(hoje), label: "últimos 7 dias" };
  }
  if (atalho === "30d") {
    return { inicio: iso(new Date(hoje.getTime() - 29 * 864e5)), fim: iso(hoje), label: "últimos 30 dias" };
  }
  // padrão: o mês de referência inteiro
  const [y, m] = refMonth.split("-").map(Number);
  const fimMes = new Date(Date.UTC(y, m, 0));
  return { inicio: `${refMonth}-01`, fim: iso(fimMes), label: monthLabel(refMonth) };
}

/**
 * Série diária do período, já somando as lojas.
 *
 * Devolve um ponto por dia do intervalo, inclusive os dias sem venda. Um
 * gráfico que pula os dias zerados mente sobre a constância da operação.
 */
export async function serieDiaria(
  inicio: string,
  fim: string,
  opcoes: { clientId?: string; marketplace?: string; scope?: Scope } = {},
): Promise<DiaFinanceiro[]> {
  const cond: string[] = ["day >= ?", "day <= ?"];
  const params: unknown[] = [inicio, fim];
  if (opcoes.clientId) {
    cond.push("client_id = ?");
    params.push(opcoes.clientId);
  }
  if (opcoes.marketplace) {
    cond.push("marketplace = ?");
    params.push(opcoes.marketplace);
  }
  const esc = scoped(opcoes.scope, "client_id");

  const linhas = await all<DiaFinanceiro>(
    `SELECT day,
            COALESCE(SUM(revenue),0)     AS revenue,
            COALESCE(SUM(orders),0)      AS orders,
            COALESCE(SUM(units),0)       AS units,
            COALESCE(SUM(fees),0)        AS fees,
            COALESCE(SUM(shipping),0)    AS shipping,
            COALESCE(SUM(tax),0)         AS tax,
            COALESCE(SUM(ads),0)         AS ads,
            COALESCE(SUM(ads_revenue),0) AS ads_revenue,
            COALESCE(SUM(clicks),0)      AS clicks,
            COALESCE(SUM(prints),0)      AS prints
       FROM finance_daily
      WHERE ${cond.join(" AND ")}${esc.sql}
      GROUP BY day ORDER BY day`,
    ...params,
    ...esc.params,
  );

  const mapa = new Map(linhas.map((l) => [l.day, l]));
  const saida: DiaFinanceiro[] = [];
  for (let d = new Date(`${inicio}T00:00:00Z`); d <= new Date(`${fim}T00:00:00Z`); d = new Date(d.getTime() + 864e5)) {
    const dia = d.toISOString().slice(0, 10);
    saida.push(
      mapa.get(dia) ?? {
        day: dia,
        revenue: 0,
        orders: 0,
        units: 0,
        fees: 0,
        shipping: 0,
        tax: 0,
        ads: 0,
        ads_revenue: 0,
        clicks: 0,
        prints: 0,
      },
    );
  }
  return saida;
}

/** Soma do período, para os cartões acima do gráfico. */
export function somarPeriodo(dias: DiaFinanceiro[]) {
  return dias.reduce(
    (a, d) => ({
      revenue: a.revenue + d.revenue,
      orders: a.orders + d.orders,
      units: a.units + d.units,
      fees: a.fees + d.fees,
      shipping: a.shipping + d.shipping,
      tax: a.tax + d.tax,
      ads: a.ads + d.ads,
      ads_revenue: a.ads_revenue + d.ads_revenue,
      clicks: a.clicks + d.clicks,
      prints: a.prints + d.prints,
    }),
    {
      revenue: 0, orders: 0, units: 0, fees: 0, shipping: 0,
      tax: 0, ads: 0, ads_revenue: 0, clicks: 0, prints: 0,
    },
  );
}

/** Últimas rodadas de sincronização, com quem disparou. */
export async function sincronizacoes(limit = 20, accountId?: string) {
  const cond = accountId ? "WHERE r.client_marketplace_id = ?" : "";
  return all<{
    id: string;
    marketplace: string | null;
    trigger: string;
    started_at: string;
    finished_at: string | null;
    status: string;
    days_written: number;
    message: string | null;
    error: string | null;
    client_name: string | null;
    started_by_name: string | null;
  }>(
    `SELECT r.*, c.name AS client_name, u.name AS started_by_name
       FROM sync_runs r
       LEFT JOIN client_marketplaces cm ON cm.id = r.client_marketplace_id
       LEFT JOIN clients c ON c.id = cm.client_id
       LEFT JOIN users u ON u.id = r.started_by
       ${cond}
      ORDER BY r.started_at DESC LIMIT ?`,
    ...(accountId ? [accountId] : []),
    limit,
  );
}


/**
 * Retrato da carteira de cobranças.
 *
 * Inadimplência conta o que venceu e não entrou, não o que está em aberto:
 * cobrança com vencimento no dia 10 não é calote no dia 3.
 */
export async function carteiraCobrancas(refMonth: string) {
  const hoje = new Date().toISOString().slice(0, 10);

  const linha = await one<{
    faturado: number;
    recebido: number;
    aberto: number;
    vencido: number;
    vencidas: number;
    cancelado: number;
  }>(
    `SELECT COALESCE(SUM(total) FILTER (WHERE status <> 'cancelado'), 0)                 AS faturado,
            COALESCE(SUM(total) FILTER (WHERE status = 'pago'), 0)                       AS recebido,
            COALESCE(SUM(total) FILTER (WHERE status = 'pendente'), 0)                   AS aberto,
            COALESCE(SUM(total) FILTER (WHERE status = 'pendente'
                                          AND due_date IS NOT NULL AND due_date < ?), 0) AS vencido,
            COUNT(*) FILTER (WHERE status = 'pendente'
                               AND due_date IS NOT NULL AND due_date < ?)                AS vencidas,
            COALESCE(SUM(total) FILTER (WHERE status = 'cancelado'), 0)                  AS cancelado
       FROM agency_charges WHERE ref_month = ?`,
    hoje,
    hoje,
    refMonth,
  );

  // receita recorrente prevista: o que os contratos ativos rendem por mês,
  // independente de ter cobrança gerada
  const recorrente = await one<{ fee: number; clientes: number }>(
    `SELECT COALESCE(SUM(monthly_fee), 0) AS fee, COUNT(*) AS clientes
       FROM clients
      WHERE kind = 'cliente' AND status NOT IN ('encerrado', 'pausado') AND monthly_fee > 0`,
  );

  const base = linha ?? { faturado: 0, recebido: 0, aberto: 0, vencido: 0, vencidas: 0, cancelado: 0 };

  return {
    ...base,
    inadimplencia: base.faturado ? base.vencido / base.faturado : 0,
    recorrente: recorrente?.fee ?? 0,
    contratos: recorrente?.clientes ?? 0,
  };
}

/** Ajustes e eventos de uma cobrança, para a tela de detalhe. */
export async function historicoCobranca(chargeId: string) {
  const [ajustes, eventos] = await Promise.all([
    all<{ id: string; amount: number; reason: string; created_at: string; autor: string | null }>(
      `SELECT a.id, a.amount, a.reason, a.created_at, u.name AS autor
         FROM charge_adjustments a LEFT JOIN users u ON u.id = a.created_by
        WHERE a.charge_id = ? ORDER BY a.created_at`,
      chargeId,
    ),
    all<{ id: string; type: string; detail: string | null; created_at: string; autor: string | null }>(
      `SELECT e.id, e.type, e.detail, e.created_at, u.name AS autor
         FROM charge_events e LEFT JOIN users u ON u.id = e.actor_id
        WHERE e.charge_id = ? ORDER BY e.created_at DESC`,
      chargeId,
    ),
  ]);
  return { ajustes, eventos };
}
