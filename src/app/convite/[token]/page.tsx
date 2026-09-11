import { notFound } from "next/navigation";
import { one } from "@/lib/db";
import { definirSenhaAction } from "@/lib/actions/team";
import { REGRA_SENHA } from "@/lib/senha";
import { Wordmark } from "@/components/nav";
import { SubmitButton } from "@/components/submit";

/**
 * Página pública onde a pessoa convidada escolhe a própria senha.
 *
 * Fica fora do grupo autenticado de propósito: quem chega aqui ainda não
 * tem conta utilizável. O token é a única credencial, é de uso único e
 * vence em sete dias.
 */
export default async function ConvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const alvo = await one<{ name: string; email: string; invite_expires_at: string | null }>(
    "SELECT name, email, invite_expires_at FROM users WHERE invite_token = ? AND active = 1",
    token,
  );

  const expirado = Boolean(alvo?.invite_expires_at && new Date(alvo.invite_expires_at) < new Date());

  // token inexistente e token expirado dão a mesma resposta: não vale
  // contar para quem tentou adivinhar se acertou o formato
  if (!alvo || expirado) notFound();

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Wordmark size="lg" />
        </div>

        <div className="rounded-[14px] border border-line bg-surface p-6">
          <h1 className="text-lg font-semibold text-ink">Olá, {alvo.name.split(" ")[0]}</h1>
          <p className="mt-1 text-sm text-muted">
            Escolha uma senha para entrar com <strong>{alvo.email}</strong>.
          </p>

          <form action={definirSenhaAction} className="mt-5 space-y-3">
            <input type="hidden" name="token" value={token} />

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted">Senha</span>
              <input
                name="password"
                type="password"
                required
                minLength={12}
                autoComplete="new-password"
                className="input"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted">Repita a senha</span>
              <input
                name="password_confirm"
                type="password"
                required
                minLength={12}
                autoComplete="new-password"
                className="input"
              />
            </label>

            <p className="text-[0.7rem] text-dim">{REGRA_SENHA}</p>

            <SubmitButton className="w-full" pendingLabel="Salvando…">
              Definir senha e entrar
            </SubmitButton>
          </form>
        </div>

        <p className="mt-4 text-center text-[0.7rem] text-dim">
          Este link vale uma vez só. Se der problema, peça outro a quem te cadastrou.
        </p>
      </div>
    </main>
  );
}
