import { randomUUID } from "node:crypto";
import pg from "pg";

const { Pool, types } = pg;

/**
 * O driver devolve bigint (COUNT, SUM de inteiros) e numeric como string, para não
 * perder precisão. Aqui todos os valores cabem em number com folga, e o resto do
 * sistema espera number — então convertemos na entrada.
 */
types.setTypeParser(20, (v) => (v === null ? null : Number(v))); // int8
types.setTypeParser(1700, (v) => (v === null ? null : Number(v))); // numeric

function connectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL não definida. Copie .env.example para .env e informe a string de conexão do Supabase.",
    );
  }
  return url;
}

/**
 * TLS: por padrão a conexão é cifrada sem validar a cadeia do certificado — é o que
 * o pooler do Supabase aceita sem configuração extra. Para validação completa,
 * aponte DATABASE_SSL_CA para o certificado da Supabase.
 */
function ssl(): { ca?: string; rejectUnauthorized: boolean } | boolean {
  if (process.env.DATABASE_SSL === "off") return false;
  const ca = process.env.DATABASE_SSL_CA;
  return ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: false };
}

declare global {
  // eslint-disable-next-line no-var
  var __goulartPool: pg.Pool | undefined;
}

function open(): pg.Pool {
  const pool = new Pool({
    connectionString: connectionString(),
    ssl: ssl(),
    max: Number(process.env.DATABASE_POOL_MAX ?? 8),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
    application_name: "goulart",
  });
  // um erro em conexão ociosa não pode derrubar o processo
  pool.on("error", (err) => console.error("[db] erro em conexão ociosa:", err.message));
  return pool;
}

/**
 * O pool só é aberto na primeira consulta: assim o build do Next consegue importar
 * este módulo sem exigir DATABASE_URL.
 */
export function getPool(): pg.Pool {
  return (globalThis.__goulartPool ??= open());
}

/** Encerra o pool — usado pelos scripts de linha de comando. */
export async function closePool(): Promise<void> {
  const existing = globalThis.__goulartPool;
  if (!existing) return;
  globalThis.__goulartPool = undefined;
  await existing.end();
}

/**
 * As consultas são escritas com `?` (mais legível e igual em todo o projeto) e
 * convertidas para os marcadores posicionais do Postgres na hora de executar.
 */
function toPositional(sql: string): string {
  let n = 0;
  return sql.replace(/\?/g, () => `$${++n}`);
}

type Row = Record<string, unknown>;

/** SELECT de várias linhas. */
export async function all<T = Row>(sql: string, ...params: unknown[]): Promise<T[]> {
  const res = await getPool().query(toPositional(sql), params);
  return res.rows as T[];
}

/** SELECT de uma linha (ou null). */
export async function one<T = Row>(sql: string, ...params: unknown[]): Promise<T | null> {
  const res = await getPool().query(toPositional(sql), params);
  return (res.rows[0] as T | undefined) ?? null;
}

/** INSERT / UPDATE / DELETE. Devolve quantas linhas foram afetadas. */
export async function run(sql: string, ...params: unknown[]): Promise<number> {
  const res = await getPool().query(toPositional(sql), params);
  return res.rowCount ?? 0;
}

/** Executa SQL bruto sem parâmetros (migração, limpeza). */
export async function exec(sql: string): Promise<void> {
  await getPool().query(sql);
}

/** Roda as operações dentro de uma transação; desfaz tudo em caso de erro. */
export async function transaction<T>(fn: (q: typeof all) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  const scoped = (async <R,>(sql: string, ...params: unknown[]) => {
    const res = await client.query(toPositional(sql), params);
    return res.rows as R[];
  }) as typeof all;
  try {
    await client.query("BEGIN");
    const out = await fn(scoped);
    await client.query("COMMIT");
    return out;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export function id(): string {
  return randomUUID();
}

export function now(): string {
  return new Date().toISOString();
}
