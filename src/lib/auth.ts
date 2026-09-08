import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { all, id, now, one, run } from "./db";
import type { Role, User } from "./types";

const COOKIE = "goulart_session";
const SESSION_DAYS = 14;

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
  run(
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
  if (token) run("DELETE FROM sessions WHERE token = ?", token);
  jar.delete(COOKIE);
}

/** Usuario da sessao atual, ou null. */
export async function currentUser(): Promise<User | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  const row = one<User & { expires_at: string }>(
    `SELECT u.*, s.expires_at FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token = ? AND u.active = 1`,
    token,
  );
  if (!row) return null;
  if (new Date(row.expires_at) < new Date()) {
    run("DELETE FROM sessions WHERE token = ?", token);
    return null;
  }
  return publicUser(row);
}

/** Remove o hash da senha antes do objeto circular pela aplicação. */
function publicUser(row: User & { password_hash?: string; expires_at?: string }): User {
  const { password_hash: _hash, expires_at: _exp, ...user } = row;
  return user as User;
}

/** Usuario da sessao; redireciona para /login quando nao houver. */
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

export function isManager(user: { role: Role }): boolean {
  return user.role === "admin" || user.role === "gestor";
}

export function login(email: string, password: string): User | null {
  const row = one<User & { password_hash: string }>(
    "SELECT * FROM users WHERE lower(email) = lower(?) AND active = 1",
    email.trim(),
  );
  if (!row || !verifyPassword(password, row.password_hash)) return null;
  return publicUser(row);
}

export function listUsers(includeInactive = false): User[] {
  return all<User>(
    `SELECT id, name, email, role, job_title, color, active, created_at FROM users ${includeInactive ? "" : "WHERE active = 1"} ORDER BY name COLLATE NOCASE`,
  );
}

export function createUser(input: {
  name: string;
  email: string;
  password: string;
  role: Role;
  job_title?: string;
  color?: string;
}): string {
  const userId = id();
  run(
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
