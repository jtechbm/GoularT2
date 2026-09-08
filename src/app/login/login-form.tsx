"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "@/lib/actions/auth";
import { SubmitButton } from "@/components/submit";
import { ThemeToggle } from "@/components/theme-toggle";
import { Wordmark } from "@/components/nav";

export function LoginForm({ hasUsers }: { hasUsers: boolean }) {
  const [state, formAction] = useActionState<LoginState, FormData>(loginAction, {});

  return (
    <main className="app-shell flex min-h-screen items-center justify-center p-5">
      <div className="w-full max-w-[380px]">
        <div className="mb-8 flex justify-center">
          <Wordmark size="lg" />
        </div>

        <form action={formAction} className="card space-y-4 p-6">
          <div>
            <label className="label" htmlFor="email">
              E-mail
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              autoFocus
              required
              className="input"
              placeholder="seu e-mail de acesso"
            />
          </div>

          <div>
            <label className="label" htmlFor="password">
              Senha
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="input"
              placeholder="••••••••"
            />
          </div>

          {state.error && (
            <p className="flash rounded-[10px] bg-bad-soft px-3 py-2 text-sm font-medium text-bad">{state.error}</p>
          )}

          <SubmitButton className="w-full" pendingLabel="Entrando…">
            Entrar
          </SubmitButton>

          {!hasUsers && (
            <p className="rounded-[10px] bg-warn-soft px-3 py-2 text-xs leading-relaxed text-warn">
              Nenhum usuário cadastrado ainda. Rode{" "}
              <code className="font-mono">npm run criar-admin -- seu@email</code> para criar o primeiro acesso.
            </p>
          )}
        </form>

        <div className="mx-auto mt-5 w-44">
          <ThemeToggle />
        </div>
      </div>
    </main>
  );
}
