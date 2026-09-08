import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import path from "node:path";
import fs from "node:fs";

const DB_PATH = process.env.GOULART_DB_PATH ?? path.join(process.cwd(), "data", "goulart.db");

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'membro',
  job_title     TEXT,
  color         TEXT NOT NULL DEFAULT '#7c3aed',
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS clients (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  trade_name     TEXT,
  doc            TEXT,
  status         TEXT NOT NULL DEFAULT 'ativo',
  segment        TEXT,
  tier           TEXT NOT NULL DEFAULT 'standard',
  contact_name   TEXT,
  contact_email  TEXT,
  contact_phone  TEXT,
  fee_model      TEXT NOT NULL DEFAULT 'fixo',
  monthly_fee    REAL NOT NULL DEFAULT 0,
  commission_pct REAL NOT NULL DEFAULT 0,
  started_at     TEXT,
  owner_id       TEXT REFERENCES users(id) ON DELETE SET NULL,
  summary        TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS client_team (
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role      TEXT NOT NULL DEFAULT 'analista',
  PRIMARY KEY (client_id, user_id)
);

CREATE TABLE IF NOT EXISTS client_marketplaces (
  id           TEXT PRIMARY KEY,
  client_id    TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  marketplace  TEXT NOT NULL,
  nickname     TEXT,
  external_id  TEXT,
  status       TEXT NOT NULL DEFAULT 'pendente',
  credentials  TEXT,
  last_sync_at TEXT,
  last_error   TEXT,
  created_at   TEXT NOT NULL,
  UNIQUE (client_id, marketplace, external_id)
);

CREATE TABLE IF NOT EXISTS finance_snapshots (
  id          TEXT PRIMARY KEY,
  client_id   TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  marketplace TEXT NOT NULL,
  ref_month   TEXT NOT NULL,
  revenue     REAL NOT NULL DEFAULT 0,
  orders      INTEGER NOT NULL DEFAULT 0,
  units       INTEGER NOT NULL DEFAULT 0,
  cogs        REAL NOT NULL DEFAULT 0,
  fees        REAL NOT NULL DEFAULT 0,
  shipping    REAL NOT NULL DEFAULT 0,
  tax         REAL NOT NULL DEFAULT 0,
  ads         REAL NOT NULL DEFAULT 0,
  profit      REAL NOT NULL DEFAULT 0,
  source      TEXT NOT NULL DEFAULT 'manual',
  updated_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at  TEXT NOT NULL,
  UNIQUE (client_id, marketplace, ref_month)
);

CREATE TABLE IF NOT EXISTS ads_entries (
  id           TEXT PRIMARY KEY,
  client_id    TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  marketplace  TEXT NOT NULL,
  campaign     TEXT,
  period_start TEXT NOT NULL,
  period_end   TEXT NOT NULL,
  invested     REAL NOT NULL DEFAULT 0,
  revenue      REAL NOT NULL DEFAULT 0,
  clicks       INTEGER NOT NULL DEFAULT 0,
  orders       INTEGER NOT NULL DEFAULT 0,
  notes        TEXT,
  created_by   TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS client_notes (
  id         TEXT PRIMARY KEY,
  client_id  TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
  kind       TEXT NOT NULL DEFAULT 'nota',
  body       TEXT NOT NULL,
  pinned     INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id           TEXT PRIMARY KEY,
  title        TEXT NOT NULL,
  description  TEXT,
  client_id    TEXT REFERENCES clients(id) ON DELETE SET NULL,
  priority     TEXT NOT NULL DEFAULT 'media',
  status       TEXT NOT NULL DEFAULT 'disponivel',
  due_date     TEXT,
  points       INTEGER NOT NULL DEFAULT 10,
  created_by   TEXT REFERENCES users(id) ON DELETE SET NULL,
  assignee_id  TEXT REFERENCES users(id) ON DELETE SET NULL,
  claimed_at   TEXT,
  completed_at TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS task_events (
  id         TEXT PRIMARY KEY,
  task_id    TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
  type       TEXT NOT NULL,
  points     INTEGER NOT NULL DEFAULT 0,
  meta       TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_channels (
  id          TEXT PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  description TEXT,
  kind        TEXT NOT NULL DEFAULT 'equipe',
  client_id   TEXT REFERENCES clients(id) ON DELETE CASCADE,
  created_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id         TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
  user_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_reads (
  channel_id   TEXT NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_at TEXT NOT NULL,
  PRIMARY KEY (channel_id, user_id)
);

CREATE TABLE IF NOT EXISTS sync_logs (
  id                    TEXT PRIMARY KEY,
  client_marketplace_id TEXT REFERENCES client_marketplaces(id) ON DELETE CASCADE,
  marketplace           TEXT NOT NULL,
  ref_month             TEXT,
  status                TEXT NOT NULL,
  message               TEXT,
  created_at            TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_fin_client   ON finance_snapshots(client_id, ref_month);
CREATE INDEX IF NOT EXISTS idx_ads_client   ON ads_entries(client_id, period_start);
CREATE INDEX IF NOT EXISTS idx_notes_client ON client_notes(client_id, created_at);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status, priority);
CREATE INDEX IF NOT EXISTS idx_msgs_channel ON chat_messages(channel_id, created_at);
`;

declare global {
  // eslint-disable-next-line no-var
  var __goulartDb: DatabaseSync | undefined;
}

function open(): DatabaseSync {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const database = new DatabaseSync(DB_PATH);
  database.exec(SCHEMA);
  return database;
}

export const db: DatabaseSync = globalThis.__goulartDb ?? (globalThis.__goulartDb = open());

type Row = Record<string, unknown>;

/**
 * node:sqlite devolve linhas com prototipo nulo, que o React nao consegue
 * serializar para Client Components — por isso toda linha vira objeto simples.
 */
function plain<T>(row: unknown): T {
  return { ...(row as object) } as T;
}

/** SELECT de varias linhas. */
export function all<T = Row>(sql: string, ...params: unknown[]): T[] {
  return (db.prepare(sql).all(...(params as never[])) as unknown[]).map((r) => plain<T>(r));
}

/** SELECT de uma linha (ou null). */
export function one<T = Row>(sql: string, ...params: unknown[]): T | null {
  const row = db.prepare(sql).get(...(params as never[]));
  return row === undefined ? null : plain<T>(row);
}

/** INSERT / UPDATE / DELETE. */
export function run(sql: string, ...params: unknown[]) {
  return db.prepare(sql).run(...(params as never[]));
}

export function id(): string {
  return randomUUID();
}

export function now(): string {
  return new Date().toISOString();
}
