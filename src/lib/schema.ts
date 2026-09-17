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

CREATE TABLE IF NOT EXISTS client_goals (
  id             text PRIMARY KEY,
  client_id      text NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  ref_month      text NOT NULL,
  -- NULL em qualquer campo significa "sem meta", e nao zero: zero e uma
  -- meta legitima e nao pode ser confundido com ausencia
  marketplace    text,
  revenue        double precision,
  orders         integer,
  avg_ticket     double precision,
  min_margin     double precision,
  ads_budget     double precision,
  min_roas       double precision,
  max_acos       double precision,
  notes          text,
  created_by     text REFERENCES users(id) ON DELETE SET NULL,
  created_at     text NOT NULL,
  updated_at     text NOT NULL
);

-- uma meta geral por mes, mais uma por loja quando o time quiser detalhar
CREATE UNIQUE INDEX IF NOT EXISTS idx_goals_geral ON client_goals(client_id, ref_month)
  WHERE marketplace IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_goals_loja  ON client_goals(client_id, ref_month, marketplace)
  WHERE marketplace IS NOT NULL;

-- alertas sao recalculados a cada carregamento; esta tabela guarda so o que
-- a equipe FEZ com eles: marcou como resolvido, quem marcou e quando.
-- Guardar o alerta em si daria uma tabela cheia de linha morta e o risco de
-- mostrar problema que ja nao existe.
CREATE TABLE IF NOT EXISTS alert_resolutions (
  id          text PRIMARY KEY,
  alert_key   text NOT NULL UNIQUE,
  client_id   text REFERENCES clients(id) ON DELETE CASCADE,
  kind        text NOT NULL,
  ref_month   text,
  note        text,
  resolved_by text REFERENCES users(id) ON DELETE SET NULL,
  resolved_at text NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_alertas_cliente ON alert_resolutions(client_id);

-- Quadro de tarefas: as etapas antigas (disponivel, em_andamento,
-- concluida) continuam validas, e entram 'assumida' e 'em_revisao'.
-- 'concluida' passa a significar APROVADA, e so a revisao coloca a tarefa
-- la. Sem isso, "concluida" queria dizer duas coisas diferentes.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS started_at       text;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS submitted_at     text;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS reviewed_at      text;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS reviewed_by      text REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS review_note      text;
-- exige evidencia antes de mandar para revisao
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS requires_evidence integer NOT NULL DEFAULT 0;
-- quantas vezes voltou da revisao, util para achar retrabalho
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS rejections       integer NOT NULL DEFAULT 0;
-- tarefa que a propria pessoa registrou para si. Nao muda o fluxo, mas o
-- revisor precisa saber: ninguem definiu escopo nem prazo alem de quem fez.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS self_created integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS task_checklist (
  id         text PRIMARY KEY,
  task_id    text NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  label      text NOT NULL,
  required   integer NOT NULL DEFAULT 0,
  done       integer NOT NULL DEFAULT 0,
  done_by    text REFERENCES users(id) ON DELETE SET NULL,
  done_at    text,
  position   integer NOT NULL DEFAULT 0,
  created_at text NOT NULL
);

CREATE TABLE IF NOT EXISTS task_evidence (
  id         text PRIMARY KEY,
  task_id    text NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  -- 'link' guarda url; 'nota' guarda texto. Arquivo entra como link para
  -- onde ele estiver, porque este sistema nao hospeda arquivo.
  kind       text NOT NULL DEFAULT 'link',
  url        text,
  body       text,
  user_id    text REFERENCES users(id) ON DELETE SET NULL,
  created_at text NOT NULL
);

CREATE TABLE IF NOT EXISTS task_comments (
  id         text PRIMARY KEY,
  task_id    text NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id    text REFERENCES users(id) ON DELETE SET NULL,
  body       text NOT NULL,
  created_at text NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_check_task   ON task_checklist(task_id, position);
CREATE INDEX IF NOT EXISTS idx_evid_task    ON task_evidence(task_id, created_at);
CREATE INDEX IF NOT EXISTS idx_coment_task  ON task_comments(task_id, created_at);

-- Fechamento por DIA, ao lado do fechamento por mes.
--
-- O snapshot mensal continua sendo a verdade do mes, porque e o numero que
-- a equipe corrige a mao quando precisa. Esta tabela e o historico: um dia
-- que ja passou nao muda mais, entao da para comparar semana com semana e
-- ver a curva dentro do mes. A chave unica por cliente, loja e dia e o que
-- impede a sincronizacao incremental de duplicar linha.
CREATE TABLE IF NOT EXISTS finance_daily (
  id          text PRIMARY KEY,
  client_id   text NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  marketplace text NOT NULL,
  day         text NOT NULL,
  revenue     double precision NOT NULL DEFAULT 0,
  orders      integer NOT NULL DEFAULT 0,
  units       integer NOT NULL DEFAULT 0,
  fees        double precision NOT NULL DEFAULT 0,
  shipping    double precision NOT NULL DEFAULT 0,
  tax         double precision NOT NULL DEFAULT 0,
  ads         double precision NOT NULL DEFAULT 0,
  ads_revenue double precision NOT NULL DEFAULT 0,
  clicks      integer NOT NULL DEFAULT 0,
  prints      integer NOT NULL DEFAULT 0,
  source      text NOT NULL DEFAULT 'api',
  updated_at  text NOT NULL,
  UNIQUE (client_id, marketplace, day)
);

CREATE INDEX IF NOT EXISTS idx_daily_cliente ON finance_daily(client_id, day);
CREATE INDEX IF NOT EXISTS idx_daily_dia     ON finance_daily(day);

-- Uma linha por execucao de sincronizacao: quando comecou, quando acabou,
-- o que deu. sync_logs guarda o resultado por conta; isto guarda a rodada
-- inteira, que e o que a tela de integracoes precisa para dizer "a ultima
-- sincronizacao bem-sucedida foi tal hora".
CREATE TABLE IF NOT EXISTS sync_runs (
  id                    text PRIMARY KEY,
  client_marketplace_id text REFERENCES client_marketplaces(id) ON DELETE CASCADE,
  marketplace           text,
  -- 'manual', 'cron' ou 'cli'
  trigger               text NOT NULL DEFAULT 'manual',
  started_at            text NOT NULL,
  finished_at           text,
  status                text NOT NULL DEFAULT 'rodando',
  days_written          integer NOT NULL DEFAULT 0,
  message               text,
  error                 text,
  started_by            text REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_runs_conta ON sync_runs(client_marketplace_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_runs_data  ON sync_runs(started_at DESC);

-- ate onde o historico diario ja foi preenchido, para a proxima rodada
-- comecar de onde parou em vez de varrer tudo de novo
ALTER TABLE client_marketplaces ADD COLUMN IF NOT EXISTS daily_synced_until text;
ALTER TABLE client_marketplaces ADD COLUMN IF NOT EXISTS last_success_at    text;

-- Acesso da equipe.
--
-- Ninguem mais digita a senha de outra pessoa. O admin cria a conta e o
-- sistema devolve um link de convite de uso unico; quem recebe escolhe a
-- propria senha. Senha provisoria digitada por terceiro circula por
-- WhatsApp, fica salva no historico da conversa e quase nunca e trocada.
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password integer NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS invite_token         text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS invite_expires_at    text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at  text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_convite ON users(invite_token)
  WHERE invite_token IS NOT NULL;

-- Trilha de quem mexeu em acesso. Este sistema guarda faturamento e tokens
-- de loja: mudanca de papel e desativacao precisam deixar rastro.
CREATE TABLE IF NOT EXISTS user_events (
  id         text PRIMARY KEY,
  user_id    text REFERENCES users(id) ON DELETE CASCADE,
  actor_id   text REFERENCES users(id) ON DELETE SET NULL,
  type       text NOT NULL,
  detail     text,
  created_at text NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_events ON user_events(user_id, created_at DESC);

-- Fechamento da cobranca.
--
-- Antes, clicar em "gerar cobrancas" reescrevia toda cobranca pendente com
-- o faturamento do momento. Uma sincronizacao posterior mudava em silencio
-- o valor de uma cobranca que ja tinha sido enviada ao cliente. Fechar
-- congela os numeros e guarda o snapshot do que foi usado, para a conversa
-- com o cliente ter uma base fixa.
ALTER TABLE agency_charges ADD COLUMN IF NOT EXISTS locked      integer NOT NULL DEFAULT 0;
ALTER TABLE agency_charges ADD COLUMN IF NOT EXISTS closed_at   text;
ALTER TABLE agency_charges ADD COLUMN IF NOT EXISTS closed_by   text REFERENCES users(id) ON DELETE SET NULL;
-- JSON com os numeros que sustentaram o calculo no momento do fechamento
ALTER TABLE agency_charges ADD COLUMN IF NOT EXISTS snapshot    text;
-- soma dos ajustes posteriores; o valor fechado em si nunca e reescrito
ALTER TABLE agency_charges ADD COLUMN IF NOT EXISTS adjustments double precision NOT NULL DEFAULT 0;
ALTER TABLE agency_charges ADD COLUMN IF NOT EXISTS receipt_url text;

-- Ajuste depois do fechamento entra como linha nova, nunca editando o
-- valor original. Assim a diferenca entre o que foi combinado e o que foi
-- cobrado fica visivel em vez de sumir dentro do total.
CREATE TABLE IF NOT EXISTS charge_adjustments (
  id         text PRIMARY KEY,
  charge_id  text NOT NULL REFERENCES agency_charges(id) ON DELETE CASCADE,
  amount     double precision NOT NULL,
  reason     text NOT NULL,
  created_by text REFERENCES users(id) ON DELETE SET NULL,
  created_at text NOT NULL
);

CREATE TABLE IF NOT EXISTS charge_events (
  id         text PRIMARY KEY,
  charge_id  text NOT NULL REFERENCES agency_charges(id) ON DELETE CASCADE,
  type       text NOT NULL,
  detail     text,
  actor_id   text REFERENCES users(id) ON DELETE SET NULL,
  created_at text NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ajuste_cobranca ON charge_adjustments(charge_id, created_at);
CREATE INDEX IF NOT EXISTS idx_evento_cobranca ON charge_events(charge_id, created_at DESC);

-- Notificacoes.
--
-- Uma linha por pessoa avisada, e nao uma por evento. O mesmo comentario
-- que menciona tres pessoas gera tres linhas, porque cada uma le e marca
-- como lida no seu tempo. Com uma linha so por evento, marcar como lida
-- apagaria o aviso dos outros.
CREATE TABLE IF NOT EXISTS notifications (
  id         text PRIMARY KEY,
  user_id    text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- quem provocou; null quando foi o proprio sistema (prazo vencendo)
  actor_id   text REFERENCES users(id) ON DELETE SET NULL,
  type       text NOT NULL,
  title      text NOT NULL,
  body       text,
  -- para onde o clique leva
  href       text NOT NULL,
  task_id    text REFERENCES tasks(id) ON DELETE CASCADE,
  client_id  text REFERENCES clients(id) ON DELETE CASCADE,
  read_at    text,
  created_at text NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notif_pessoa ON notifications(user_id, read_at, created_at DESC);

-- Penalidades.
--
-- Uma linha por penalidade detectada. external_key e a identidade dela
-- no marketplace (id do aviso, nível de reputação, id da infração), e o
-- índice único por conta é o que impede a mesma penalidade de ser
-- avisada de novo a cada rodada.
CREATE TABLE IF NOT EXISTS penalties (
  id                    text PRIMARY KEY,
  client_id             text NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  client_marketplace_id text NOT NULL REFERENCES client_marketplaces(id) ON DELETE CASCADE,
  marketplace           text NOT NULL,
  -- reputacao | aviso | infracao | punicao
  kind                  text NOT NULL,
  -- critico | atencao | informativo
  severity              text NOT NULL,
  external_key          text NOT NULL,
  title                 text NOT NULL,
  detail                text,
  -- o que a API devolveu no momento, para conferir depois
  data                  text,
  status                text NOT NULL DEFAULT 'aberta',
  detected_at           text NOT NULL,
  resolved_at           text,
  resolved_by           text REFERENCES users(id) ON DELETE SET NULL,
  resolution_note       text,
  -- 1 quando o proprio marketplace mostrou que passou (reputacao voltou)
  auto_resolved         integer NOT NULL DEFAULT 0,
  UNIQUE (client_marketplace_id, kind, external_key)
);

CREATE INDEX IF NOT EXISTS idx_penal_cliente ON penalties(client_id, status, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_penal_status  ON penalties(status, detected_at DESC);

-- Reputacao e estado, nao evento: so da para saber que piorou comparando
-- com a leitura anterior. Guardar a serie tambem mostra a tendencia das
-- metricas antes de a cor mudar.
CREATE TABLE IF NOT EXISTS reputation_snapshots (
  id                    text PRIMARY KEY,
  client_marketplace_id text NOT NULL REFERENCES client_marketplaces(id) ON DELETE CASCADE,
  level_id              text,
  -- durante a protecao do Decola a cor exibida nao e a real
  real_level            text,
  protection_end_date   text,
  power_seller_status   text,
  claims_rate           double precision,
  claims_value          integer,
  delayed_rate          double precision,
  delayed_value         integer,
  cancellations_rate    double precision,
  cancellations_value   integer,
  sales_completed       integer,
  metrics_period        text,
  captured_at           text NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rep_conta ON reputation_snapshots(client_marketplace_id, captured_at DESC);

-- Avisos oficiais do marketplace ao vendedor. Guarda todos, mesmo os que
-- nao sao penalidade, porque a categoria de alerta nunca apareceu numa
-- conta real ainda e a classificacao precisa ser conferida contra o bruto.
CREATE TABLE IF NOT EXISTS marketplace_notices (
  id                    text PRIMARY KEY,
  client_marketplace_id text NOT NULL REFERENCES client_marketplaces(id) ON DELETE CASCADE,
  external_id           text NOT NULL,
  category              text,
  sub_category          text,
  title                 text,
  description           text,
  highlighted           integer NOT NULL DEFAULT 0,
  from_date             text,
  is_alert              integer NOT NULL DEFAULT 0,
  first_seen_at         text NOT NULL,
  UNIQUE (client_marketplace_id, external_id)
);

-- Entrega das notificacoes por canal. Hoje so existe 'app'. O WhatsApp
-- entra como outro canal lendo as pendentes daqui, sem refazer a deteccao
-- e sem criar a penalidade de novo quando um envio falhar.
CREATE TABLE IF NOT EXISTS notification_deliveries (
  id              text PRIMARY KEY,
  notification_id text NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  channel         text NOT NULL,
  status          text NOT NULL DEFAULT 'pendente',
  attempts        integer NOT NULL DEFAULT 0,
  last_error      text,
  created_at      text NOT NULL,
  sent_at         text,
  UNIQUE (notification_id, channel)
);

CREATE INDEX IF NOT EXISTS idx_entregas_pendentes ON notification_deliveries(channel, status);

-- quando cada conta foi verificada e se a permissao de anuncios existe
ALTER TABLE client_marketplaces ADD COLUMN IF NOT EXISTS penalties_checked_at text;
ALTER TABLE client_marketplaces ADD COLUMN IF NOT EXISTS items_permission     text;

-- Escrow de cada pedido da Shopee, buscado uma vez só.
--
-- A Shopee exige uma chamada por pedido para dar o valor liquido. Refazer
-- todas a cada rodada estourava o limite de 60 segundos da Vercel assim que
-- o mes passava de uns 500 pedidos: a funcao morria no meio, sem gravar erro,
-- e a conta ficava "conectada" sem atualizar nada. Pedido concluido nao muda
-- de valor, entao guarda aqui e cada rodada so busca os que ainda faltam.
CREATE TABLE IF NOT EXISTS shopee_order_escrow (
  client_marketplace_id text NOT NULL REFERENCES client_marketplaces(id) ON DELETE CASCADE,
  order_sn              text NOT NULL,
  day                   text NOT NULL,
  revenue               double precision NOT NULL DEFAULT 0,
  fees                  double precision NOT NULL DEFAULT 0,
  shipping              double precision NOT NULL DEFAULT 0,
  fetched_at            text NOT NULL,
  PRIMARY KEY (client_marketplace_id, order_sn)
);

CREATE INDEX IF NOT EXISTS idx_escrow_dia ON shopee_order_escrow(client_marketplace_id, day);

-- Pedidos da Shopee em tempo real.
--
-- A tabela deixou de guardar so pedido concluido: guarda o pedido desde o
-- pagamento, com o status atual. O valor vem sempre do escrow da Shopee, que
-- ja existe antes da conclusao com a comissao e a taxa estimadas; final = 1
-- quando o pedido concluiu e o valor nao muda mais.
ALTER TABLE shopee_order_escrow ADD COLUMN IF NOT EXISTS status        text;
ALTER TABLE shopee_order_escrow ADD COLUMN IF NOT EXISTS escrow_amount double precision NOT NULL DEFAULT 0;
ALTER TABLE shopee_order_escrow ADD COLUMN IF NOT EXISTS final         integer NOT NULL DEFAULT 0;
ALTER TABLE shopee_order_escrow ADD COLUMN IF NOT EXISTS updated_at    text;

-- Todo aviso recebido de marketplace fica registrado, valido ou nao. O
-- formato exato do aviso da Shopee so e confirmado quando o primeiro chegar,
-- e sem este registro uma assinatura recusada seria silenciosa.
CREATE TABLE IF NOT EXISTS webhook_events (
  id           text PRIMARY KEY,
  marketplace  text NOT NULL,
  received_at  text NOT NULL,
  valid        integer NOT NULL DEFAULT 0,
  code         integer,
  shop_id      text,
  order_sn     text,
  order_status text,
  body         text,
  result       text,
  error        text
);

CREATE INDEX IF NOT EXISTS idx_webhook_recebidos ON webhook_events(marketplace, received_at DESC);

-- Anuncios da propria loja, importados do marketplace.
--
-- Existem para o comparador ter um produto "dele" com dono: a consulta da
-- comparacao filtra pelo cliente do usuario no proprio WHERE, e para isso o
-- produto precisa estar preso a uma conta conectada.
CREATE TABLE IF NOT EXISTS client_products (
  id                    text PRIMARY KEY,
  client_id             text NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  client_marketplace_id text NOT NULL REFERENCES client_marketplaces(id) ON DELETE CASCADE,
  marketplace           text NOT NULL,
  external_id           text NOT NULL,
  title                 text NOT NULL,
  price                 double precision NOT NULL DEFAULT 0,
  url                   text,
  status                text,
  updated_at            text NOT NULL,
  UNIQUE (client_marketplace_id, external_id)
);

CREATE INDEX IF NOT EXISTS idx_produtos_cliente ON client_products(client_id, marketplace);

-- Quando a busca rodou, e o que ela disse.
--
-- Sem isto, busca que nao achou nada fica idêntica à busca que nunca
-- aconteceu: as duas mostram tabela vazia, e a explicação do modelo ("o
-- único anúncio comparável tinha faixa de preço") se perdia junto.
ALTER TABLE client_products ADD COLUMN IF NOT EXISTS last_search_at   text;
ALTER TABLE client_products ADD COLUMN IF NOT EXISTS last_search_note text;

-- Fotografia do mercado para um produto, quando o preco veio de busca na web.
--
-- Nao e historico: cada busca substitui a anterior inteira, numa transacao.
-- Misturar buscas de datas diferentes distorce a mediana, que e justamente o
-- numero que a tela usa para dizer se o preco esta alto.
CREATE TABLE IF NOT EXISTS market_comparisons (
  id             text PRIMARY KEY,
  product_id     text NOT NULL REFERENCES client_products(id) ON DELETE CASCADE,
  -- copiada do produto na criacao, para travar a comparacao na mesma plataforma
  marketplace    text NOT NULL,
  seller         text,
  title          text NOT NULL,
  price          double precision NOT NULL,
  url            text,
  source_snippet text,
  note           text,
  author         text REFERENCES users(id),
  created_at     text NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_comparacoes_produto ON market_comparisons(product_id);

-- Análise de uma loja escrita por modelo de linguagem.
--
-- O dossiê fica gravado junto do resultado de proposito: analise de tres meses
-- atrás sem os números que a geraram é opinião solta, e ninguem consegue dizer
-- depois se a recomendacao fazia sentido na epoca.
--
-- status 'parcial' é a análise em que o modelo estourou o tempo. Os números
-- do dossiê continuam valendo, porque são nossos e não dependem dele.
CREATE TABLE IF NOT EXISTS store_analyses (
  id                    text PRIMARY KEY,
  client_id             text NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  -- a análise é do CLIENTE inteiro, com uma seção por canal: o cliente vende
  -- no Mercado Livre e na Shopee ao mesmo tempo, e separar as duas analises
  -- esconderia justamente o que interessa. As colunas de loja ficaram para
  -- as análises antigas, feitas canal por canal.
  client_marketplace_id text REFERENCES client_marketplaces(id) ON DELETE CASCADE,
  marketplace           text,
  ref_month             text NOT NULL,
  status                text NOT NULL,
  dossier               text NOT NULL,
  result                text,
  model                 text,
  duration_ms           integer,
  created_by            text REFERENCES users(id),
  created_at            text NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_analises_loja    ON store_analyses(client_marketplace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analises_cliente ON store_analyses(client_id, created_at DESC);

ALTER TABLE store_analyses ALTER COLUMN client_marketplace_id DROP NOT NULL;
ALTER TABLE store_analyses ALTER COLUMN marketplace           DROP NOT NULL;

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
  "store_analyses",
  "market_comparisons",
  "client_products",
  "webhook_events",
  "shopee_order_escrow",
  "notification_deliveries",
  "marketplace_notices",
  "reputation_snapshots",
  "penalties",
  "notifications",
  "charge_events",
  "charge_adjustments",
  "user_events",
  "sync_runs",
  "finance_daily",
  "task_comments",
  "task_evidence",
  "task_checklist",
  "alert_resolutions",
  "client_goals",
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
