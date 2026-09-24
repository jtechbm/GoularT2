"use client";

import Link from "next/link";

/**
 * Quando uma ação recusa ou algo quebra, esta tela diz o que aconteceu.
 *
 * Sem ela, o Next mostra "Application error: a client-side exception has
 * occurred", que não ajuda ninguém: a pessoa não sabe se perdeu o que
 * digitou, se o sistema caiu ou se ela fez algo errado.
 */
export default function ErroDoApp({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  // mensagem nossa (Error lançado numa ação) aparece; erro de infra, não
  const recado = error.message && !error.message.includes("digest") ? error.message : null;

  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <p className="text-3xl">🚧</p>
      <h1 className="mt-3 text-lg font-semibold text-ink">Não deu para concluir essa ação</h1>
      <p className="mt-2 text-sm text-muted">
        {recado ?? "Alguma coisa falhou no meio do caminho. Nada foi gravado pela metade."}
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <button type="button" onClick={reset} className="btn btn-primary btn-sm">
          Tentar de novo
        </button>
        <Link href="/" className="btn btn-ghost btn-sm">
          Voltar ao início
        </Link>
      </div>
      {error.digest && <p className="mt-4 text-[0.7rem] text-dim">código do erro: {error.digest}</p>}
    </div>
  );
}
