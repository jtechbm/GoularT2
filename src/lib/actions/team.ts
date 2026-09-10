"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { one, run } from "@/lib/db";
import { createUser, hashPassword, requirePermission, requireUser } from "@/lib/auth";
import { str, strOrNull } from "@/lib/format";
import type { Role } from "@/lib/types";

function refresh() {
  revalidatePath("/equipe");
  revalidatePath("/clientes");
}

export async function createTeamMemberAction(formData: FormData) {
  await requirePermission("equipe.gerenciar");
  const email = str(formData.get("email"));
  const password = String(formData.get("password") ?? "");
  if (!email || password.length < 6) throw new Error("E-mail válido e senha de ao menos 6 caracteres.");
  if (await one("SELECT id FROM users WHERE lower(email) = lower(?)", email)) {
    throw new Error("Já existe um usuário com este e-mail.");
  }

  createUser({
    name: str(formData.get("name")),
    email,
    password,
    role: (str(formData.get("role")) || "membro") as Role,
    job_title: strOrNull(formData.get("job_title")) ?? undefined,
    color: str(formData.get("color")) || "#7c3aed",
  });

  refresh();
  redirect("/equipe?ok=1");
}

export async function updateTeamMemberAction(formData: FormData) {
  const actor = await requireUser();
  const userId = str(formData.get("user_id"));
  const isSelf = actor.id === userId;
  if (!isSelf && actor.role !== "admin" && actor.role !== "gestor") {
    throw new Error("Sem permissão para editar este usuário.");
  }

  // Só admin/gestor mexem em papel e status; cada um edita os próprios dados.
  if (actor.role === "admin" || actor.role === "gestor") {
    await run(
      "UPDATE users SET name=?, email=?, role=?, job_title=?, color=?, active=? WHERE id=?",
      str(formData.get("name")),
      str(formData.get("email")).toLowerCase(),
      str(formData.get("role")),
      strOrNull(formData.get("job_title")),
      str(formData.get("color")) || "#7c3aed",
      formData.get("active") ? 1 : 0,
      userId,
    );
  } else {
    await run(
      "UPDATE users SET name=?, job_title=?, color=? WHERE id=?",
      str(formData.get("name")),
      strOrNull(formData.get("job_title")),
      str(formData.get("color")) || "#7c3aed",
      userId,
    );
  }

  const password = String(formData.get("password") ?? "");
  if (password) {
    if (password.length < 6) throw new Error("A senha precisa ter ao menos 6 caracteres.");
    await run("UPDATE users SET password_hash=? WHERE id=?", hashPassword(password), userId);
    // troca de senha de outra pessoa derruba as sessões dela
    if (!isSelf) await run("DELETE FROM sessions WHERE user_id=?", userId);
  }

  refresh();
  redirect(`/equipe?ok=1&u=${userId}`);
}

export async function toggleTeamMemberAction(formData: FormData) {
  await requirePermission("equipe.gerenciar");
  const userId = str(formData.get("user_id"));
  await run("UPDATE users SET active = 1 - active WHERE id = ?", userId);
  await run("DELETE FROM sessions WHERE user_id = ?", userId);
  refresh();
  redirect("/equipe");
}
