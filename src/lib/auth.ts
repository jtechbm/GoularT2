import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { all, id, now, one, run } from "./db";
import { can, type Permission } from "./permissions";
import type { Role, User } from "./types";

const COOKIE = "goulart_session";
const SESSION_DAYS = 14;

/** Colunas de usuário liberadas para a aplicação — nunca o hash da senha. */
const USER_COLS = "id, name, email, role, job_title, color, active, created_at";
const USER_COLS_U = "u.id, u.name, u.email, u.role, u.job_title, u.color, u.active, u.created_at";

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split(":");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5);
  await run(
    "INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?,?,?,?)",
    token,
    userId,
    now(),
    expires.toISOString(),
  );
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await run("DELETE FROM sessions WHERE token = ?", token);
  jar.delete(COOKIE);
}

/** Usuário da sessão atual, ou null. */
export async function currentUser(): Promise<User | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;

  const row = await one<User & { expires_at: string }>(
    `SELECT ${USER_COLS_U}, s.expires_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token = ? AND u.active = 1`,
    token,
  );
  if (!row) return null;

  if (new Date(row.expires_at) < new Date()) {
    await run("DELETE FROM sessions WHERE token = ?", token);
    return null;
  }
  const { expires_at: _expires, ...user } = row;
  return user;
}

/** Usuário da sessão; redireciona para /login quando não houver. */
export async function requireUser(): Promise<User> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireRole(...roles: Role[]): Promise<User> {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect("/");
  return user;
}

/** Guarda de página: sem a permissão, volta para o início em vez de dar erro. */
export async function requirePermission(permission: Permission): Promise<User> {
  const user = await requireUser();
  if (!can(user, permission)) redirect("/");
  return user;
}

/** Guarda de Server Action: aqui um erro é melhor do que um redirect silencioso. */
export function assertCan(user: User, permission: Permission, message?: string): void {
  if (!can(user, permission)) throw new Error(message ?? "Seu papel não permite esta ação.");
}

/**
 * Clientes que a pessoa enxerga. `null` significa a carteira inteira.
 *
 * O membro só vê onde foi atribuído, que é o que a tela de Equipe promete ao
 * dizer "opera clientes atribuídos". Sem ninguém o atribuindo, ele vê vazio —
 * é melhor do que ver a carteira toda por omissão.
 */
export async function visibleClientIds(user: User): Promise<string[] | null> {
  if (can(user, "carteira.completa")) return null;
  const rows = await all<{ client_id: string }>(
    "SELECT client_id FROM client_team WHERE user_id = ?",
    user.id,
  );
  return rows.map((r) => r.client_id);
}

export async function canSeeClient(user: User, clientId: string): Promise<boolean> {
  const ids = await visibleClientIds(user);
  return ids === null || ids.includes(clientId);
}

/** Aborta a Server Action quando o cliente não é da pessoa. */
export async function assertClientAccess(user: User, clientId: string): Promise<void> {
  if (!(await canSeeClient(user, clientId))) throw new Error("Este cliente não está atribuído a você.");
}

export async function login(email: string, password: string): Promise<User | null> {
  const row = await one<User & { password_hash: string }>(
    "SELECT * FROM users WHERE lower(email) = lower(?) AND active = 1",
    email.trim(),
  );
  if (!row || !verifyPassword(password, row.password_hash)) return null;
  const { password_hash: _hash, ...user } = row;
  return user;
}

export async function listUsers(includeInactive = false): Promise<User[]> {
  return all<User>(
    `SELECT ${USER_COLS} FROM users ${includeInactive ? "" : "WHERE active = 1"} ORDER BY lower(name)`,
  );
}

export async function createUser(input: {
  name: string;
  email: string;
  password: string;
  role: Role;
  job_title?: string;
  color?: string;
}): Promise<string> {
  const userId = id();
  await run(
    `INSERT INTO users (id, name, email, password_hash, role, job_title, color, active, created_at)
     VALUES (?,?,?,?,?,?,?,1,?)`,
    userId,
    input.name.trim(),
    input.email.trim().toLowerCase(),
    hashPassword(input.password),
    input.role,
    input.job_title ?? null,
    input.color ?? "#7c3aed",
    now(),
  );
  return userId;
}
