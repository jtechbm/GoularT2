import "server-only";
import { all, one } from "./db";
import { addMonths, currentMonth, lastMonths } from "./format";
import type { AdsEntry, Client, ClientMarketplace, ClientNote, FinanceSnapshot, Task, User } from "./types";

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

export function totalsForMonth(refMonth: string): Totals {
  return one<Totals>(`SELECT ${SUM} FROM finance_snapshots WHERE ref_month = ?`, refMonth) ?? EMPTY;
}

export function totalsForClient(clientId: string, refMonth: string): Totals {
  return (
    one<Totals>(`SELECT ${SUM} FROM finance_snapshots WHERE client_id = ? AND ref_month = ?`, clientId, refMonth) ??
    EMPTY
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

export function clientRows(refMonth = currentMonth()): ClientRow[] {
  const prev = addMonths(refMonth, -1);
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
       LEFT JOIN (SELECT client_id, GROUP_CONCAT(DISTINCT marketplace) list
                    FROM client_marketplaces WHERE status != 'desativado' GROUP BY client_id) m ON m.client_id = c.id
       LEFT JOIN (SELECT client_id, COUNT(*) n FROM client_team GROUP BY client_id) t ON t.client_id = c.id
       LEFT JOIN (SELECT client_id, COUNT(*) n FROM tasks
                   WHERE status != 'concluida' AND client_id IS NOT NULL GROUP BY client_id) k ON k.client_id = c.id
       LEFT JOIN (SELECT client_id, MAX(created_at) last_note_at FROM client_notes GROUP BY client_id) n
              ON n.client_id = c.id
      ORDER BY (CASE c.status WHEN 'atencao' THEN 0 WHEN 'ativo' THEN 1 WHEN 'onboarding' THEN 2
                              WHEN 'pausado' THEN 3 ELSE 4 END), revenue DESC, c.name COLLATE NOCASE`,
    refMonth,
    prev,
  );
}

export interface MonthPoint extends Totals {
  ref_month: string;
}

export function monthlySeries(months: number, clientId?: string): MonthPoint[] {
  const refs = lastMonths(months);
  const where = clientId ? "WHERE client_id = ? AND ref_month >= ?" : "WHERE ref_month >= ?";
  const params = clientId ? [clientId, refs[0]] : [refs[0]];
  const rows = all<MonthPoint>(
    `SELECT ref_month, ${SUM} FROM finance_snapshots ${where} GROUP BY ref_month`,
    ...params,
  );
  const map = new Map(rows.map((r) => [r.ref_month, r]));
  return refs.map((ref) => map.get(ref) ?? { ref_month: ref, ...EMPTY });
}

export function marketplaceBreakdown(refMonth: string, clientId?: string) {
  const where = clientId ? "WHERE ref_month = ? AND client_id = ?" : "WHERE ref_month = ?";
  const params = clientId ? [refMonth, clientId] : [refMonth];
  return all<Totals & { marketplace: string }>(
    `SELECT marketplace, ${SUM} FROM finance_snapshots ${where} GROUP BY marketplace ORDER BY revenue DESC`,
    ...params,
  );
}

export function getClient(clientId: string): Client | null {
  return one<Client>("SELECT * FROM clients WHERE id = ?", clientId);
}

export function clientTeam(clientId: string) {
  return all<User & { team_role: string }>(
    `SELECT u.id, u.name, u.email, u.role, u.job_title, u.color, u.active, u.created_at, ct.role AS team_role FROM client_team ct
       JOIN users u ON u.id = ct.user_id
      WHERE ct.client_id = ? ORDER BY u.name COLLATE NOCASE`,
    clientId,
  );
}

export function clientMarketplaces(clientId: string): ClientMarketplace[] {
  return all<ClientMarketplace>(
    "SELECT * FROM client_marketplaces WHERE client_id = ? ORDER BY marketplace",
    clientId,
  );
}

export function clientSnapshots(clientId: string, months = 6): FinanceSnapshot[] {
  const refs = lastMonths(months);
  return all<FinanceSnapshot>(
    "SELECT * FROM finance_snapshots WHERE client_id = ? AND ref_month >= ? ORDER BY ref_month DESC, marketplace",
    clientId,
    refs[0],
  );
}

export function clientNotes(clientId: string, limit = 50) {
  return all<ClientNote & { user_name: string | null; user_color: string | null }>(
    `SELECT n.*, u.name AS user_name, u.color AS user_color
       FROM client_notes n LEFT JOIN users u ON u.id = n.user_id
      WHERE n.client_id = ?
      ORDER BY n.pinned DESC, n.created_at DESC LIMIT ?`,
    clientId,
    limit,
  );
}

export function clientAds(clientId: string, limit = 50) {
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

export function tasks(filter: { status?: string; assignee?: string; clientId?: string } = {}): TaskRow[] {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.status) {
    where.push("t.status = ?");
    params.push(filter.status);
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

export function getTask(taskId: string): TaskRow | null {
  return one<TaskRow>(`${TASK_SELECT} WHERE t.id = ?`, taskId);
}

/** Placar de pontos — base para a gamificação futura. */
export function leaderboard(sinceIso?: string) {
  const since = sinceIso ?? new Date(Date.now() - 30 * 864e5).toISOString();
  return all<{ id: string; name: string; color: string; points: number; done: number }>(
    `SELECT u.id, u.name, u.color,
            COALESCE(SUM(e.points),0) AS points,
            COUNT(e.id) AS done
       FROM users u
       LEFT JOIN task_events e
              ON e.user_id = u.id AND e.type = 'concluida' AND e.created_at >= ?
      WHERE u.active = 1
      GROUP BY u.id ORDER BY points DESC, done DESC, u.name COLLATE NOCASE`,
    since,
  );
}

export function channels() {
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
      ORDER BY (m.last_at IS NULL), m.last_at DESC, ch.name COLLATE NOCASE`,
  );
}

export function messages(channelId: string, limit = 200) {
  const rows = all<{
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

export function adsRows(filter: { refMonth?: string; clientId?: string; marketplace?: string } = {}) {
  const where: string[] = [];
  const params: unknown[] = [];
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
      ORDER BY a.period_start DESC, c.name COLLATE NOCASE`,
    ...params,
  );
}

export function clientOptions() {
  return all<{ id: string; name: string; status: string }>(
    "SELECT id, name, status FROM clients ORDER BY name COLLATE NOCASE",
  );
}

export function syncLogs(limit = 20) {
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
