import { AuthLink } from "./auth-link";
import { Card, Chip } from "./ui";
import { SubmitButton } from "./submit";
import { requestAccessAction } from "@/lib/actions/integrations";
import { relativeBR } from "@/lib/format";
import { MARKETPLACES, type Client, type ClientMarketplace } from "@/lib/types";

/**
 * Caminho principal para ligar as lojas do cliente: um botão por marketplace.
 * Sem jargão de "canal", "conta" ou "OAuth" — quem usa só precisa saber que
 * está pedindo acesso ao cliente.
 */
export function ConectarLojas({
  client,
  accounts,
  manager,
  destaque,
  disponiveis,
}: {
  client: Client;
  accounts: ClientMarketplace[];
  manager: boolean;
  /** marketplace cujo link acabou de ser gerado */
  destaque?: string;
  /** marketplaces com chaves configuradas no ambiente */
  disponiveis: string[];
}) {
  if (!manager) return null;

  const porMarketplace = new Map(accounts.map((a) => [a.marketplace, a]));
  const tudoConectado = MARKETPLACES.every((m) => porMarketplace.get(m.value)?.status === "conectado");

  return (
    <Card
      title="Lojas do cliente"
      subtitle={
        tudoConectado
          ? "Os números chegam sozinhos das lojas conectadas."
          : "Peça acesso ao cliente para os números entrarem automaticamente."
      }
    >
      <div className="space-y-3">
        {MARKETPLACES.map((m) => {
          const conta = porMarketplace.get(m.value);
          const conectado = conta?.status === "conectado";
          const temLink = Boolean(conta?.auth_token);
          const disponivel = disponiveis.includes(m.value);

          return (
            <div key={m.value} className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-line bg-surface-2 px-4 py-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-ink">{m.label}</div>
                  <div className="text-xs text-muted">
                    {!disponivel
                      ? "Integração ainda não configurada no sistema"
                      : conectado
                      ? conta?.last_sync_at
                        ? `Conectada · atualizada ${relativeBR(conta.last_sync_at)}`
                        : "Conectada · ainda não sincronizada"
                      : temLink
                        ? "Link enviado, aguardando o cliente aprovar"
                        : "Ainda não conectada"}
                  </div>
                </div>

                {!disponivel ? (
                  <Chip tone="neutral">Indisponível</Chip>
                ) : conectado ? (
                  <Chip tone="ok">Conectada</Chip>
                ) : (
                  <form action={requestAccessAction}>
                    <input type="hidden" name="client_id" value={client.id} />
                    <input type="hidden" name="marketplace" value={m.value} />
                    <SubmitButton variant={temLink ? "ghost" : "primary"} pendingLabel="Gerando…">
                      {temLink ? "Gerar link novo" : `Pedir acesso à ${m.label}`}
                    </SubmitButton>
                  </form>
                )}
              </div>

              {disponivel && temLink && !conectado && (destaque === m.value || !destaque) && conta?.auth_token && (
                <AuthLink
                  token={conta.auth_token}
                  expiresAt={conta.auth_expires_at}
                  marketplaceLabel={m.label}
                  clientPhone={client.contact_phone}
                />
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
