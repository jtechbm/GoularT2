/** Esquema do Elleva no Postgres (Supabase). Aplicado por `npm run migrar`. */
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            text PRIMARY KEY,
  name          text NOT NULL,
  email         text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role          text NOT NULL DEFAULT 'membro',
  job_title     text,
  color         text NOT NULL DEFAULT '#7c3aed',
  active        integer NOT NULL DEFAULT 1,
  created_at    text NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token      text PRIMARY KEY,
  user_id    text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at text NOT NULL,
  expires_at text NOT NULL
);

CREATE TABLE IF NOT EXISTS clients (
  id             text PRIMARY KEY,
  name           text NOT NULL,
  trade_name     text,
  doc            text,
  status         text NOT NULL DEFAULT 'ativo',
  segment        text,
  tier           text NOT NULL DEFAULT 'standard',
  contact_name   text,
  contact_email  text,
  contact_phone  text,
  fee_model      text NOT NULL DEFAULT 'fixo',
  monthly_fee    double precision NOT NULL DEFAULT 0,
  commission_pct double precision NOT NULL DEFAULT 0,
  started_at     text,
  owner_id       text REFERENCES users(id) ON DELETE SET NULL,
  summary        text,
  created_at     text NOT NULL,
  updated_at     text NOT NULL
);

CREATE TABLE IF NOT EXISTS client_team (
  client_id text NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id   text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role      text NOT NULL DEFAULT 'analista',
  PRIMARY KEY (client_id, user_id)
);

CREATE TABLE IF NOT EXISTS client_marketplaces (
  id           text PRIMARY KEY,
  client_id    text NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  marketplace  text NOT NULL,
  nickname     text,
  external_id  text,
  status       text NOT NULL DEFAULT 'pendente',
  credentials  text,
  last_sync_at text,
  last_error   text,
  created_at   text NOT NULL,
  UNIQUE (client_id, marketplace, external_id)
);

CREATE TABLE IF NOT EXISTS finance_snapshots (
  id          text PRIMARY KEY,
  client_id   text NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  marketplace text NOT NULL,
  ref_month   text NOT NULL,
  revenue     double precision NOT NULL DEFAULT 0,
  orders      integer NOT NULL DEFAULT 0,
  units       integer NOT NULL DEFAULT 0,
  cogs        double precision NOT NULL DEFAULT 0,
  fees        double precision NOT NULL DEFAULT 0,
  shipping    double precision NOT NULL DEFAULT 0,
  tax         double precision NOT NULL DEFAULT 0,
  ads         double precision NOT NULL DEFAULT 0,
  profit      double precision NOT NULL DEFAULT 0,
  source      text NOT NULL DEFAULT 'manual',
  updated_by  text REFERENCES users(id) ON DELETE SET NULL,
  updated_at  text NOT NULL,
  UNIQUE (client_id, marketplace, ref_month)
);

CREATE TABLE IF NOT EXISTS ads_entries (
  id           text PRIMARY KEY,
  client_id    text NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  marketplace  text NOT NULL,
  campaign     text,
  period_start text NOT NULL,
  period_end   text NOT NULL,
  invested     double precision NOT NULL DEFAULT 0,
  revenue      double precision NOT NULL DEFAULT 0,
  clicks       integer NOT NULL DEFAULT 0,
  orders       integer NOT NULL DEFAULT 0,
  notes        text,
  created_by   text REFERENCES users(id) ON DELETE SET NULL,
  created_at   text NOT NULL
);

CREATE TABLE IF NOT EXISTS client_notes (
  id         text PRIMARY KEY,
  client_id  text NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id    text REFERENCES users(id) ON DELETE SET NULL,
  kind       text NOT NULL DEFAULT 'nota',
  body       text NOT NULL,
  pinned     integer NOT NULL DEFAULT 0,
  created_at text NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id           text PRIMARY KEY,
  title        text NOT NULL,
  description  text,
  client_id    text REFERENCES clients(id) ON DELETE SET NULL,
  priority     text NOT NULL DEFAULT 'media',
  status       text NOT NULL DEFAULT 'disponivel',
  due_date     text,
  points       integer NOT NULL DEFAULT 10,
  created_by   text REFERENCES users(id) ON DELETE SET NULL,
  assignee_id  text REFERENCES users(id) ON DELETE SET NULL,
  claimed_at   text,
  completed_at text,
  created_at   text NOT NULL,
  updated_at   text NOT NULL
);

CREATE TABLE IF NOT EXISTS task_events (
  id         text PRIMARY KEY,
  task_id    text NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id    text REFERENCES users(id) ON DELETE SET NULL,
  type       text NOT NULL,
  points     integer NOT NULL DEFAULT 0,
  meta       text,
  created_at text NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_channels (
  id          text PRIMARY KEY,
  slug        text NOT NULL UNIQUE,
  name        text NOT NULL,
  description text,
  kind        text NOT NULL DEFAULT 'equipe',
  client_id   text REFERENCES clients(id) ON DELETE CASCADE,
  created_by  text REFERENCES users(id) ON DELETE SET NULL,
  created_at  text NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id         text PRIMARY KEY,
  channel_id text NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
  user_id    text REFERENCES users(id) ON DELETE SET NULL,
  body       text NOT NULL,
  created_at text NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_reads (
  channel_id   text NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
  user_id      text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_at text NOT NULL,
  PRIMARY KEY (channel_id, user_id)
);

CREATE TABLE IF NOT EXISTS sync_logs (
  id                    text PRIMARY KEY,
  client_marketplace_id text REFERENCES client_marketplaces(id) ON DELETE CASCADE,
  marketplace           text NOT NULL,
  ref_month             text,
  status                text NOT NULL,
  message               text,
  created_at            text NOT NULL
);

CREATE TABLE IF NOT EXISTS agency_charges (
  id            text PRIMARY KEY,
  client_id     text NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  ref_month     text NOT NULL,
  fee           double precision NOT NULL DEFAULT 0,
  commission    double precision NOT NULL DEFAULT 0,
  extra         double precision NOT NULL DEFAULT 0,
  revenue_base  double precision NOT NULL DEFAULT 0,
  total         double precision NOT NULL DEFAULT 0,
  status        text NOT NULL DEFAULT 'pendente',
  due_date      text,
  paid_at       text,
  method        text,
  notes         text,
  created_by    text REFERENCES users(id) ON DELETE SET NULL,
  created_at    text NOT NULL,
  updated_at    text NOT NULL,
  UNIQUE (client_id, ref_month)
);

CREATE TABLE IF NOT EXISTS agency_expenses (
  id          text PRIMARY KEY,
  ref_month   text NOT NULL,
  category    text NOT NULL DEFAULT 'outros',
  description text NOT NULL,
  amount      double precision NOT NULL DEFAULT 0,
  recurring   integer NOT NULL DEFAULT 0,
  paid        integer NOT NULL DEFAULT 0,
  due_date    text,
  paid_at     text,
  notes       text,
  created_by  text REFERENCES users(id) ON DELETE SET NULL,
  created_at  text NOT NULL,
  updated_at  text NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_charges_month  ON agency_charges(ref_month, status);
CREATE INDEX IF NOT EXISTS idx_expenses_month ON agency_expenses(ref_month);

-- loja própria do Kadu x cliente atendido
ALTER TABLE clients ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'cliente';

-- link de autorização enviado ao lojista (Fase 1 das integrações)
ALTER TABLE client_marketplaces ADD COLUMN IF NOT EXISTS auth_token      text;
ALTER TABLE client_marketplaces ADD COLUMN IF NOT EXISTS auth_expires_at text;
ALTER TABLE client_marketplaces ADD COLUMN IF NOT EXISTS auth_used_at    text;
ALTER TABLE client_marketplaces ADD COLUMN IF NOT EXISTS authorized_at   text;
ALTER TABLE client_marketplaces ADD COLUMN IF NOT EXISTS authorized_ip   text;
ALTER TABLE client_marketplaces ADD COLUMN IF NOT EXISTS auth_created_by text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_cm_auth_token ON client_marketplaces(auth_token)
  WHERE auth_token IS NOT NULL;

-- campanhas trazidas da API convivem com os lançamentos feitos à mão:
-- 'source' separa os dois para a sincronização substituir só o que é dela
ALTER TABLE ads_entries ADD COLUMN IF NOT EXISTS source      text NOT NULL DEFAULT 'manual';
ALTER TABLE ads_entries ADD COLUMN IF NOT EXISTS external_id text;
ALTER TABLE ads_entries ADD COLUMN IF NOT EXISTS updated_at  text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ads_api
  ON ads_entries(client_id, marketplace, external_id, period_start)
  WHERE source = 'api';

CREATE INDEX IF NOT EXISTS idx_fin_client   ON finance_snapshots(client_id, ref_month);
CREATE INDEX IF NOT EXISTS idx_ads_client   ON ads_entries(client_id, period_start);
CREATE INDEX IF NOT EXISTS idx_notes_client ON client_notes(client_id, created_at);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status, priority);
CREATE INDEX IF NOT EXISTS idx_msgs_channel ON chat_messages(channel_id, created_at);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
`;

/** Tabelas na ordem segura para limpeza (filhas antes das pais). */
export const TABLES = [
  "agency_charges",
  "agency_expenses",
  "task_events",
  "tasks",
  "chat_messages",
  "chat_reads",
  "chat_channels",
  "sync_logs",
  "client_notes",
  "ads_entries",
  "finance_snapshots",
  "client_marketplaces",
  "client_team",
  "clients",
  "sessions",
  "users",
];
