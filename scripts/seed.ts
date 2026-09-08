/**
 * Popula o GoularT com o acesso do Kadu, a equipe e uma carteira de exemplo.
 * Uso: npm run seed          (mantém o que existe)
 *      npm run seed -- reset (apaga tudo antes)
 */
import { randomUUID, scryptSync, randomBytes } from "node:crypto";
import { db, run, one, all } from "../src/lib/db.ts";

const reset = process.argv.includes("reset");

function hash(password: string): string {
  const salt = randomBytes(16).toString("hex");
  return `scrypt:${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

const uid = () => randomUUID();
const iso = (d = new Date()) => d.toISOString();

function monthsBack(n: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getFullYear(), now.getMonth() - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

if (reset) {
  for (const t of [
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
  ]) {
    db.exec(`DELETE FROM ${t}`);
  }
  console.log("Base limpa.");
}

if (one("SELECT id FROM users LIMIT 1")) {
  console.log("Já existem usuários — nada foi alterado. Use: npm run seed -- reset");
  process.exit(0);
}

// ---------------------------------------------------------------- equipe
const TEAM = [
  { name: "Kadu Goulart", email: "kadu@goulart.com.br", role: "admin", job: "Head da operação", color: "#a855f7", pass: "goulart123" },
  { name: "Marina Prado", email: "marina@goulart.com.br", role: "gestor", job: "Gestora de contas", color: "#f97316", pass: "goulart123" },
  { name: "Rafael Lima", email: "rafael@goulart.com.br", role: "membro", job: "Analista de marketplace", color: "#22d3ee", pass: "goulart123" },
  { name: "Bianca Souza", email: "bianca@goulart.com.br", role: "membro", job: "Especialista em Ads", color: "#ec4899", pass: "goulart123" },
  { name: "Tiago Nunes", email: "tiago@goulart.com.br", role: "membro", job: "Conteúdo e anúncios", color: "#34d399", pass: "goulart123" },
];

const users = TEAM.map((t) => {
  const id = uid();
  run(
    `INSERT INTO users (id, name, email, password_hash, role, job_title, color, active, created_at)
     VALUES (?,?,?,?,?,?,?,1,?)`,
    id,
    t.name,
    t.email,
    hash(t.pass),
    t.role,
    t.job,
    t.color,
    iso(),
  );
  return { ...t, id };
});

const [kadu, marina, rafael, bianca, tiago] = users;

// ---------------------------------------------------------------- clientes
const CLIENTS = [
  { name: "Casa & Cia Utilidades", seg: "Casa e decoração", status: "ativo", tier: "premium", fee: 4500, owner: marina, base: 320000, margem: 0.14, canais: ["mercado_livre", "shopee"] },
  { name: "PetMundo Distribuidora", seg: "Pet", status: "ativo", tier: "premium", fee: 5200, owner: kadu, base: 410000, margem: 0.12, canais: ["mercado_livre", "shopee"] },
  { name: "TecnoFast Eletrônicos", seg: "Eletrônicos", status: "atencao", tier: "standard", fee: 3800, owner: rafael, base: 260000, margem: 0.07, canais: ["mercado_livre"] },
  { name: "Bella Moda Fitness", seg: "Moda", status: "ativo", tier: "standard", fee: 2900, owner: bianca, base: 155000, margem: 0.18, canais: ["shopee", "mercado_livre"] },
  { name: "Ferramentas Rocha", seg: "Ferramentas", status: "ativo", tier: "standard", fee: 3200, owner: marina, base: 198000, margem: 0.15, canais: ["mercado_livre"] },
  { name: "NutriVida Suplementos", seg: "Suplementos", status: "onboarding", tier: "light", fee: 1900, owner: tiago, base: 42000, margem: 0.1, canais: ["shopee"] },
  { name: "Lar Doce Enxovais", seg: "Cama, mesa e banho", status: "pausado", tier: "light", fee: 0, owner: null, base: 61000, margem: 0.05, canais: ["shopee"] },
];

const months = monthsBack(6);
const clientIds: { id: string; name: string; canais: string[]; owner: (typeof users)[0] | null }[] = [];

for (const c of CLIENTS) {
  const id = uid();
  const started = new Date();
  started.setMonth(started.getMonth() - (6 + Math.floor(Math.random() * 18)));

  run(
    `INSERT INTO clients (id, name, trade_name, doc, status, segment, tier, contact_name, contact_email, contact_phone,
                          fee_model, monthly_fee, commission_pct, started_at, owner_id, summary, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    id,
    c.name,
    c.name.split(" ")[0],
    null,
    c.status,
    c.seg,
    c.tier,
    "Contato comercial",
    `contato@${c.name.split(" ")[0].toLowerCase()}.com.br`,
    "(11) 90000-0000",
    c.fee > 0 ? "fixo" : "percentual",
    c.fee,
    c.fee > 0 ? 0 : 0.05,
    started.toISOString().slice(0, 10),
    c.owner?.id ?? null,
    `Operação em ${c.canais.length > 1 ? "Mercado Livre e Shopee" : c.canais[0] === "shopee" ? "Shopee" : "Mercado Livre"}. Segmento de ${c.seg.toLowerCase()}.`,
    iso(),
    iso(),
  );

  if (c.owner) {
    run("INSERT INTO client_team (client_id, user_id, role) VALUES (?,?,?)", id, c.owner.id, "responsavel");
  }
  // um analista extra em cada conta
  const extra = users[2 + Math.floor(Math.random() * 3)];
  if (extra.id !== c.owner?.id) {
    run("INSERT INTO client_team (client_id, user_id, role) VALUES (?,?,?)", id, extra.id, "analista");
  }

  for (const mk of c.canais) {
    run(
      `INSERT INTO client_marketplaces (id, client_id, marketplace, nickname, external_id, status, created_at)
       VALUES (?,?,?,?,?,?,?)`,
      uid(),
      id,
      mk,
      `${c.name.split(" ")[0]} ${mk === "shopee" ? "Shopee" : "ML"}`,
      String(100000000 + Math.floor(Math.random() * 899999999)),
      "pendente",
      iso(),
    );
  }

  // fechamento dos últimos 6 meses
  months.forEach((ref, i) => {
    const trend = 1 + (i - months.length / 2) * 0.045 + (Math.random() - 0.5) * 0.08;
    const drop = c.status === "atencao" && i >= months.length - 2 ? 0.72 : 1;
    const total = c.base * trend * drop;

    c.canais.forEach((mk, idx) => {
      const share = c.canais.length === 1 ? 1 : idx === 0 ? 0.62 : 0.38;
      const revenue = Math.round(total * share);
      const fees = Math.round(revenue * 0.135);
      const shipping = Math.round(revenue * 0.06);
      const tax = Math.round(revenue * 0.09);
      const ads = Math.round(revenue * (0.05 + Math.random() * 0.03));
      const cogs = Math.round(revenue * (1 - c.margem - 0.135 - 0.06 - 0.09 - 0.06));
      const profit = revenue - fees - shipping - tax - ads - cogs;
      const orders = Math.round(revenue / (70 + Math.random() * 90));

      run(
        `INSERT INTO finance_snapshots (id, client_id, marketplace, ref_month, revenue, orders, units, cogs, fees,
                                        shipping, tax, ads, profit, source, updated_by, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'manual',?,?)`,
        uid(),
        id,
        mk,
        ref,
        revenue,
        orders,
        Math.round(orders * 1.3),
        cogs,
        fees,
        shipping,
        tax,
        ads,
        profit,
        kadu.id,
        iso(),
      );

      // lançamento de Ads do mês
      run(
        `INSERT INTO ads_entries (id, client_id, marketplace, campaign, period_start, period_end, invested, revenue,
                                  clicks, orders, notes, created_by, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        uid(),
        id,
        mk,
        mk === "shopee" ? "Shopee Ads — produto" : "Product Ads — geral",
        `${ref}-01`,
        `${ref}-28`,
        ads,
        Math.round(ads * (2.5 + Math.random() * 2.5)),
        Math.round(ads * 3.2),
        Math.round(orders * 0.28),
        null,
        bianca.id,
        iso(),
      );
    });
  });

  clientIds.push({ id, name: c.name, canais: c.canais, owner: c.owner });
}

// ---------------------------------------------------------------- anotações
const NOTES: [string, string, string][] = [
  ["Casa & Cia Utilidades", "reuniao", "Alinhamento mensal: cliente quer subir 20 SKUs novos de organizadores até o dia 20. Rafael fica com a criação dos anúncios."],
  ["Casa & Cia Utilidades", "financeiro", "Renegociamos o frete com a transportadora — impacto de -1,2pp no custo de envio a partir do próximo mês."],
  ["PetMundo Distribuidora", "mudanca", "Migramos a operação para Full no ML. Prazo de entrega caiu e a conversão subiu ~9%."],
  ["TecnoFast Eletrônicos", "alerta", "Queda forte de faturamento nos últimos 2 meses. Concorrência baixou preço em fones. Precisa de plano de ação até sexta."],
  ["TecnoFast Eletrônicos", "reuniao", "Cliente aprovou reduzir margem em 3 SKUs para recuperar buy box."],
  ["Bella Moda Fitness", "nota", "Coleção nova chega em duas semanas — segurar investimento em Ads dos produtos que vão sair de linha."],
  ["Ferramentas Rocha", "financeiro", "Imposto subiu por mudança de regime. Revisar precificação de toda a linha."],
  ["NutriVida Suplementos", "nota", "Onboarding: aguardando acesso à conta Shopee e planilha de custos."],
];

for (const [clientName, kind, body] of NOTES) {
  const c = clientIds.find((x) => x.name === clientName);
  if (!c) continue;
  const author = c.owner ?? kadu;
  const d = new Date(Date.now() - Math.floor(Math.random() * 20) * 864e5);
  run(
    "INSERT INTO client_notes (id, client_id, user_id, kind, body, pinned, created_at) VALUES (?,?,?,?,?,?,?)",
    uid(),
    c.id,
    author.id,
    kind,
    body,
    kind === "alerta" ? 1 : 0,
    iso(d),
  );
}

// ---------------------------------------------------------------- tarefas
const TASKS: [string, string | null, string, string, number][] = [
  ["Montar plano de recuperação de buy box", "TecnoFast Eletrônicos", "urgente", "disponivel", 2],
  ["Subir 20 SKUs novos de organizadores", "Casa & Cia Utilidades", "alta", "disponivel", 5],
  ["Revisar títulos e fichas dos 30 SKUs campeões", "PetMundo Distribuidora", "media", "disponivel", 7],
  ["Conferir fechamento financeiro do mês", null, "alta", "disponivel", 3],
  ["Ajustar lances do Shopee Ads", "Bella Moda Fitness", "media", "em_andamento", 1],
  ["Auditar precificação pós-mudança de regime", "Ferramentas Rocha", "alta", "em_andamento", 4],
  ["Coletar acessos da conta Shopee", "NutriVida Suplementos", "media", "concluida", -3],
  ["Migrar catálogo para Full", "PetMundo Distribuidora", "alta", "concluida", -8],
  ["Padronizar imagens do catálogo", "Casa & Cia Utilidades", "baixa", "concluida", -12],
];

const POINTS: Record<string, number> = { baixa: 5, media: 10, alta: 20, urgente: 35 };
const workers = [rafael, bianca, tiago, marina];

TASKS.forEach(([title, clientName, priority, status, dueOffset], i) => {
  const id = uid();
  const client = clientName ? clientIds.find((c) => c.name === clientName) : null;
  const assignee = status === "disponivel" ? null : workers[i % workers.length];
  const due = new Date(Date.now() + dueOffset * 864e5).toISOString().slice(0, 10);
  const createdAt = iso(new Date(Date.now() - (i + 2) * 864e5));

  run(
    `INSERT INTO tasks (id, title, description, client_id, priority, status, due_date, points, created_by,
                        assignee_id, claimed_at, completed_at, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    id,
    title,
    null,
    client?.id ?? null,
    priority,
    status,
    due,
    POINTS[priority],
    kadu.id,
    assignee?.id ?? null,
    assignee ? createdAt : null,
    status === "concluida" ? iso(new Date(Date.now() - i * 864e5)) : null,
    createdAt,
    iso(),
  );

  run(
    "INSERT INTO task_events (id, task_id, user_id, type, points, meta, created_at) VALUES (?,?,?,?,?,?,?)",
    uid(),
    id,
    kadu.id,
    "criada",
    0,
    null,
    createdAt,
  );
  if (assignee) {
    run(
      "INSERT INTO task_events (id, task_id, user_id, type, points, meta, created_at) VALUES (?,?,?,?,?,?,?)",
      uid(),
      id,
      assignee.id,
      "assumida",
      0,
      null,
      createdAt,
    );
  }
  if (status === "concluida" && assignee) {
    run(
      "INSERT INTO task_events (id, task_id, user_id, type, points, meta, created_at) VALUES (?,?,?,?,?,?,?)",
      uid(),
      id,
      assignee.id,
      "concluida",
      POINTS[priority],
      null,
      iso(new Date(Date.now() - i * 864e5)),
    );
  }
});

// ---------------------------------------------------------------- chat
const CHANNELS = [
  { slug: "operacao-diaria", name: "operacao-diaria", desc: "Rotina do dia a dia da equipe", client: null },
  { slug: "financeiro", name: "financeiro", desc: "Fechamentos, impostos e cobranças", client: null },
  { slug: "tecnofast", name: "tecnofast", desc: "Plano de recuperação da conta", client: "TecnoFast Eletrônicos" },
];

const MESSAGES: [string, (typeof users)[0], string][] = [
  ["operacao-diaria", kadu, "Bom dia, time. Fechamento do mês entra hoje — quem não lançou os números do cliente, lança até 18h."],
  ["operacao-diaria", marina, "Casa & Cia e Ferramentas Rocha já estão lançados."],
  ["operacao-diaria", rafael, "TecnoFast eu lanço depois do almoço, estou fechando com o cliente ainda."],
  ["financeiro", kadu, "Atenção na Ferramentas Rocha: mudança de regime tributário mexeu na margem. Já pedi revisão de preço."],
  ["financeiro", bianca, "Ads de outubro fechou em 6,1% do faturamento na carteira. ROAS médio 3,4x."],
  ["tecnofast", rafael, "Perdemos buy box em 3 SKUs de fone. Concorrente baixou 12%."],
  ["tecnofast", kadu, "Monta o plano com cenário de margem reduzida em 3pp e traz amanhã. Se recuperar giro, compensa."],
  ["tecnofast", marina, "Consigo apoiar na negociação com o cliente se precisar."],
];

const channelIds = new Map<string, string>();
for (const c of CHANNELS) {
  const id = uid();
  channelIds.set(c.slug, id);
  const client = c.client ? clientIds.find((x) => x.name === c.client) : null;
  run(
    "INSERT INTO chat_channels (id, slug, name, description, kind, client_id, created_by, created_at) VALUES (?,?,?,?,?,?,?,?)",
    id,
    c.slug,
    c.name,
    c.desc,
    client ? "cliente" : "equipe",
    client?.id ?? null,
    kadu.id,
    iso(),
  );
}

MESSAGES.forEach(([slug, author, body], i) => {
  run(
    "INSERT INTO chat_messages (id, channel_id, user_id, body, created_at) VALUES (?,?,?,?,?)",
    uid(),
    channelIds.get(slug),
    author.id,
    body,
    iso(new Date(Date.now() - (MESSAGES.length - i) * 36e5)),
  );
});

const counts = {
  usuarios: all("SELECT id FROM users").length,
  clientes: all("SELECT id FROM clients").length,
  fechamentos: all("SELECT id FROM finance_snapshots").length,
  tarefas: all("SELECT id FROM tasks").length,
};

console.log("GoularT populado:", counts);
console.log("\nAcesso inicial:");
for (const t of TEAM) console.log(`  ${t.email}  ·  ${t.pass}  (${t.role})`);
console.log("\nTroque as senhas em /equipe assim que entrar.");
