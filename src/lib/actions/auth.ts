"use server";

import { redirect } from "next/navigation";
import { createSession, destroySession, login } from "@/lib/auth";
import { str } from "@/lib/format";

export type LoginState = { error?: string };

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = str(formData.get("email"));
  const password = String(formData.get("password") ?? "");

  if (!email || !password) return { error: "Informe e-mail e senha." };

  const user = await login(email, password);
  if (!user) return { error: "E-mail ou senha inválidos." };

  await createSession(user.id);
  redirect("/");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}
