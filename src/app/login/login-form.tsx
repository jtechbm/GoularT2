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
      <div className="w-full max-w-sm">
        <div className="mb-7 text-center">
          <Wordmark size="lg" />
          <p className="mt-2 text-sm text-muted">Operação interna · acesso restrito à equipe</p>
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
              placeholder="voce@goulart.com.br"
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
            <p className="flash rounded-lg border border-bad/30 bg-bad-soft px-3 py-2 text-xs font-medium text-bad">
              {state.error}
            </p>
          )}

          <SubmitButton className="w-full" pendingLabel="Entrando…">
            Entrar
          </SubmitButton>

          {!hasUsers && (
            <p className="rounded-lg border border-warn/30 bg-warn-soft px-3 py-2 text-xs text-warn">
              Nenhum usuário cadastrado ainda. Rode <code className="font-mono">npm run seed</code> para criar o acesso
              inicial do Kadu.
            </p>
          )}
        </form>

        <div className="mx-auto mt-5 w-40">
          <ThemeToggle />
        </div>
      </div>
    </main>
  );
}
