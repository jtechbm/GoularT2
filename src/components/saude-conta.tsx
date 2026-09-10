import { Chip } from "./ui";
import { SubmitButton } from "./submit";
import { syncAccountAction, generateAuthLinkAction } from "@/lib/actions/integrations";
import { dateTimeBR, relativeBR } from "@/lib/format";
import { diagnosticar, diasSemAtualizar, proximaSincronizacao } from "@/lib/integracao-status";
import type { ClientMarketplace } from "@/lib/types";

const STATUS_TEXTO: Record<string, { label: string; tone: "ok" | "warn" | "bad" | "neutral" }> = {
  conectado: { label: "Conectada", tone: "ok" },
  pendente: { label: "Aguardando o lojista", tone: "warn" },
  erro: { label: "Com erro", tone: "bad" },
  desativado: { label: "Desativada", tone: "neutral" },
};

/**
 * Estado de uma conta em uma linha, com o que fazer a respeito.
 *
 * Mostra a última sincronização BEM-SUCEDIDA, não a última tentativa. Uma
 * conta que falha há três dias tem "última sincronização" de hoje se o
 * campo for a tentativa, e isso esconde exatamente o problema que a tela
 * deveria denunciar.
 */
export function SaudeConta({
  conta,
  refMonth,
  redirectTo,
  manager,
}: {
  conta: ClientMarketplace;
  refMonth: string;
  redirectTo: string;
  /** pode pedir nova autorização */
  manager: boolean;
}) {
  const st = STATUS_TEXTO[conta.status] ?? { label: conta.status, tone: "neutral" as const };
  const diag = diagnosticar(conta.last_error);
  const parada = diasSemAtualizar(conta.last_success_at);
  const proxima = proximaSincronizacao();

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone={st.tone}>{st.label}</Chip>
        {conta.last_success_at ? (
          <span className="text-[0.7rem] text-dim" title={dateTimeBR(conta.last_success_at)}>
            última atualização com sucesso {relativeBR(conta.last_success_at)}
          </span>
        ) : (
          <span className="text-[0.7rem] text-warn">nunca atualizou com sucesso</span>
        )}
        {parada !== null && parada >= 2 && <Chip tone="bad">parada há {parada} dias</Chip>}
      </div>

      {conta.status === "conectado" && (
        <p className="text-[0.7rem] text-dim">
          Próxima rodada automática {relativeBR(proxima.toISOString())}, às 3h da manhã.
        </p>
      )}

      {diag && (
        <div className="rounded-[10px] border border-bad/30 bg-bad-soft px-3 py-2.5">
          <p className="text-xs font-medium text-bad">{diag.titulo}</p>
          <p className="mt-0.5 text-[0.7rem] text-muted">{diag.acao}</p>
          <details className="mt-1.5">
            <summary className="cursor-pointer text-[0.65rem] text-dim">detalhe técnico</summary>
            <p className="mt-1 break-words font-mono text-[0.65rem] text-dim">{conta.last_error}</p>
          </details>

          <div className="mt-2 flex flex-wrap gap-2">
            {diag.tentarDeNovo && (
              <form action={syncAccountAction}>
                <input type="hidden" name="account_id" value={conta.id} />
                <input type="hidden" name="ref_month" value={refMonth} />
                <input type="hidden" name="redirect_to" value={redirectTo} />
                <SubmitButton variant="ghost" size="sm" pendingLabel="Tentando…">
                  Tentar de novo
                </SubmitButton>
              </form>
            )}
            {diag.precisaReautorizar && manager && (
              <form action={generateAuthLinkAction}>
                <input type="hidden" name="account_id" value={conta.id} />
                <input type="hidden" name="redirect_to" value={redirectTo} />
                <SubmitButton variant="primary" size="sm" pendingLabel="Gerando…">
                  Pedir nova autorização
                </SubmitButton>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
