import Link from "next/link";
import { Card, Chip } from "./ui";
import { SubmitButton } from "./submit";
import { concluirOnboardingAction } from "@/lib/actions/clients";
import { pct } from "@/lib/format";
import type { OnboardingResultado } from "@/lib/onboarding";

/**
 * Barra fina de progresso. Prefiro isto a um número solto: dá para ver de
 * longe se o cliente está no começo ou quase pronto.
 */
function Barra({ valor }: { valor: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
      <div
        className={`h-full rounded-full ${valor >= 1 ? "bg-ok" : valor >= 0.5 ? "bg-brand" : "bg-warn"}`}
        style={{ width: `${Math.max(3, valor * 100)}%` }}
      />
    </div>
  );
}

export function OnboardingCard({
  clientId,
  resultado,
  manager,
  emOnboarding,
}: {
  clientId: string;
  resultado: OnboardingResultado;
  manager: boolean;
  /** o cliente ainda está com status onboarding */
  emOnboarding: boolean;
}) {
  const feitos = resultado.itens.filter((i) => i.feito).length;

  return (
    <Card
      title="Onboarding"
      subtitle={`${feitos} de ${resultado.itens.length} concluídos`}
      actions={
        <Chip tone={resultado.completo ? "ok" : "warn"}>
          {resultado.completo ? "pronto para ativar" : `${resultado.pendentesObrigatorios.length} obrigatórios`}
        </Chip>
      }
    >
      <Barra valor={resultado.progresso} />
      <p className="mt-1.5 text-[0.7rem] text-dim">{pct(resultado.progresso)} concluído</p>

      <ul className="mt-3 space-y-1.5">
        {resultado.itens.map((i) => (
          <li key={i.key} className="flex items-start gap-2 text-xs">
            <span className={i.feito ? "text-ok" : i.obrigatorio ? "text-bad" : "text-dim"}>
              {i.feito ? "✓" : "○"}
            </span>
            <span className="min-w-0 flex-1">
              {i.feito || !i.href ? (
                <span className={i.feito ? "text-muted line-through" : "text-ink"}>{i.label}</span>
              ) : (
                <Link href={i.href} className="text-ink hover:text-brand">
                  {i.label}
                </Link>
              )}
              {!i.obrigatorio && <span className="ml-1 text-[0.65rem] text-dim">opcional</span>}
              {!i.feito && i.hint && <span className="block text-[0.65rem] text-dim">{i.hint}</span>}
            </span>
          </li>
        ))}
      </ul>

      {manager && emOnboarding && (
        <form action={concluirOnboardingAction} className="mt-4 border-t border-line pt-3">
          <input type="hidden" name="client_id" value={clientId} />
          <SubmitButton
            variant={resultado.completo ? "primary" : "ghost"}
            size="sm"
            disabled={!resultado.completo}
            pendingLabel="Ativando…"
            title={
              resultado.completo
                ? undefined
                : `Faltam: ${resultado.pendentesObrigatorios.map((i) => i.label).join(", ")}`
            }
          >
            Ativar cliente
          </SubmitButton>
          {!resultado.completo && (
            <p className="mt-2 text-[0.7rem] text-dim">
              O cliente só vira Ativo quando os itens obrigatórios estiverem prontos.
            </p>
          )}
        </form>
      )}
    </Card>
  );
}
