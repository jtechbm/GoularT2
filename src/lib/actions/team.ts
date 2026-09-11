"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomBytes } from "node:crypto";
import { id, now, one, run } from "@/lib/db";
import { hashPassword, requirePermission, requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { str, strOrNull } from "@/lib/format";
import { validarSenha } from "@/lib/senha";
import type { Role } from "@/lib/types";

const DIAS_CONVITE = 7;

function refresh() {
  revalidatePath("/equipe");
  revalidatePath("/clientes");
}

/**
 * Trilha de tudo que mexe em acesso.
 *
 * Criar conta, mudar papel e desativar são as três ações que abrem ou
 * fecham a porta de um sistema com dados financeiros de terceiros. Sem
 * registro, uma promoção indevida a admin é indistinguível de um cadastro
 * legítimo feito meses antes.
 */
async function registrar(userId: string, actorId: string | null, type: string, detail?: string) {
  await run(
    "INSERT INTO user_events (id, user_id, actor_id, type, detail, created_at) VALUES (?,?,?,?,?,?)",
    id(),
    userId,
    actorId,
    type,
    detail ?? null,
    now(),
  );
}

/**
 * Cria a conta e devolve um convite, sem senha digitada por terceiro.
 *
 * O fluxo anterior pedia que o admin escolhesse uma senha provisória de
 * seis caracteres e a passasse adiante. Essa senha viajava por WhatsApp,
 * ficava no histórico da conversa e quase nunca era trocada. Agora a conta
 * nasce sem senha utilizável e com um link de uso único: quem recebe
 * escolhe a própria senha, e o admin nunca a conhece.
 */
export async function createTeamMemberAction(formData: FormData) {
  const actor = await requirePermission("equipe.gerenciar");

  const email = str(formData.get("email")).trim().toLowerCase();
  const nome = str(formData.get("name")).trim();
  if (!email.includes("@") || !nome) throw new Error("Nome e e-mail são obrigatórios.");

  if (await one("SELECT id FROM users WHERE lower(email) = lower(?)", email)) {
    throw new Error("Já existe um usuário com este e-mail.");
  }

  const userId = id();
  const token = randomBytes(32).toString("hex");
  const expira = new Date(Date.now() + DIAS_CONVITE * 864e5).toISOString();

  // hash de uma senha aleatória que ninguém conhece: a conta existe mas não
  // dá para entrar nela até o convite ser usado
  await run(
    `INSERT INTO users (id, name, email, password_hash, role, job_title, color, active, created_at,
                        must_change_password, invite_token, invite_expires_at)
     VALUES (?,?,?,?,?,?,?,1,?,1,?,?)`,
    userId,
    nome,
    email,
    hashPassword(randomBytes(32).toString("hex")),
    (str(formData.get("role")) || "membro") as Role,
    strOrNull(formData.get("job_title")),
    str(formData.get("color")) || "#7c3aed",
    now(),
    token,
    expira,
  );

  await registrar(userId, actor.id, "criado", `papel ${str(formData.get("role")) || "membro"}`);

  refresh();
  redirect(`/equipe?ok=1&convite=${userId}`);
}

/** Gera um convite novo quando o anterior expirou ou se perdeu. */
export async function reenviarConviteAction(formData: FormData) {
  const actor = await requirePermission("equipe.gerenciar");
  const userId = str(formData.get("user_id"));

  const token = randomBytes(32).toString("hex");
  await run(
    "UPDATE users SET invite_token=?, invite_expires_at=?, must_change_password=1 WHERE id=?",
    token,
    new Date(Date.now() + DIAS_CONVITE * 864e5).toISOString(),
    userId,
  );
  // convite novo invalida qualquer sessão aberta com a senha antiga
  await run("DELETE FROM sessions WHERE user_id = ?", userId);
  await registrar(userId, actor.id, "convite_reenviado");

  refresh();
  redirect(`/equipe?ok=1&convite=${userId}`);
}

export async function updateTeamMemberAction(formData: FormData) {
  const actor = await requireUser();
  const userId = str(formData.get("user_id"));
  const isSelf = actor.id === userId;
  // gerenciar equipe é permissão de admin; o código antigo aceitava gestor
  // direto pelo campo role, furando o modelo de permissões
  const gerencia = can(actor, "equipe.gerenciar");

  if (!isSelf && !gerencia) throw new Error("Sem permissão para editar este usuário.");

  const alvo = await one<{ role: string; name: string; email: string }>(
    "SELECT role, name, email FROM users WHERE id = ?",
    userId,
  );
  if (!alvo) throw new Error("Usuário não encontrado.");

  if (gerencia) {
    const novoPapel = str(formData.get("role"));
    await run(
      "UPDATE users SET name=?, email=?, role=?, job_title=?, color=? WHERE id=?",
      str(formData.get("name")),
      str(formData.get("email")).toLowerCase(),
      novoPapel,
      strOrNull(formData.get("job_title")),
      str(formData.get("color")) || "#7c3aed",
      userId,
    );
    if (novoPapel && novoPapel !== alvo.role) {
      await registrar(userId, actor.id, "papel_alterado", `${alvo.role} para ${novoPapel}`);
      // papel novo muda o que a pessoa enxerga: a sessão precisa recarregar
      await run("DELETE FROM sessions WHERE user_id=?", userId);
    }
  } else {
    await run(
      "UPDATE users SET name=?, job_title=?, color=? WHERE id=?",
      str(formData.get("name")),
      strOrNull(formData.get("job_title")),
      str(formData.get("color")) || "#7c3aed",
      userId,
    );
  }

  // trocar a própria senha aqui é permitido; definir a de outra pessoa não.
  // Quem esqueceu a senha recebe um convite novo, e o admin segue sem saber
  // qual é.
  const senha = String(formData.get("password") ?? "");
  if (senha) {
    if (!isSelf) throw new Error("Você não define a senha de outra pessoa. Envie um convite novo.");
    const v = validarSenha(senha, { nome: alvo.name, email: alvo.email });
    if (!v.ok) throw new Error(v.erro!);
    await run(
      "UPDATE users SET password_hash=?, must_change_password=0, password_changed_at=? WHERE id=?",
      hashPassword(senha),
      now(),
      userId,
    );
    await registrar(userId, actor.id, "senha_alterada");
  }

  refresh();
  redirect(`/equipe?ok=1&u=${userId}`);
}

/**
 * Liga e desliga o acesso.
 *
 * Desativar derruba as sessões na hora. A confirmação fica na tela, mas a
 * checagem de permissão é aqui: botão desabilitado não é segurança.
 */
export async function toggleTeamMemberAction(formData: FormData) {
  const actor = await requirePermission("equipe.gerenciar");
  const userId = str(formData.get("user_id"));

  if (userId === actor.id) {
    throw new Error("Você não pode desativar o próprio acesso.");
  }

  const alvo = await one<{ active: number; name: string; role: string }>(
    "SELECT active, name, role FROM users WHERE id = ?",
    userId,
  );
  if (!alvo) throw new Error("Usuário não encontrado.");

  // o último admin ativo não pode ser desligado, senão ninguém mais
  // gerencia equipe nem integrações
  if (alvo.active === 1 && alvo.role === "admin") {
    const outros = await one<{ n: number }>(
      "SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND active = 1 AND id <> ?",
      userId,
    );
    if ((outros?.n ?? 0) === 0) {
      throw new Error("Este é o último admin ativo. Promova outra pessoa antes de desativar este acesso.");
    }
  }

  await run("UPDATE users SET active = 1 - active WHERE id = ?", userId);
  await run("DELETE FROM sessions WHERE user_id = ?", userId);
  await registrar(userId, actor.id, alvo.active === 1 ? "desativado" : "reativado");

  refresh();
  redirect("/equipe?ok=1");
}

/** A pessoa define a própria senha a partir do link de convite. */
export async function definirSenhaAction(formData: FormData) {
  const token = str(formData.get("token"));
  const senha = String(formData.get("password") ?? "");
  const confirmacao = String(formData.get("password_confirm") ?? "");

  const alvo = await one<{ id: string; name: string; email: string; invite_expires_at: string | null }>(
    "SELECT id, name, email, invite_expires_at FROM users WHERE invite_token = ? AND active = 1",
    token,
  );
  if (!alvo) redirect("/convite/invalido");
  if (alvo.invite_expires_at && new Date(alvo.invite_expires_at) < new Date()) {
    redirect("/convite/expirado");
  }

  if (senha !== confirmacao) throw new Error("As duas senhas não são iguais.");
  const v = validarSenha(senha, { nome: alvo.name, email: alvo.email });
  if (!v.ok) throw new Error(v.erro!);

  await run(
    `UPDATE users SET password_hash=?, must_change_password=0, password_changed_at=?,
            invite_token=NULL, invite_expires_at=NULL WHERE id=?`,
    hashPassword(senha),
    now(),
    alvo.id,
  );
  await registrar(alvo.id, alvo.id, "senha_definida", "pelo convite");

  redirect("/login?senha=definida");
}
