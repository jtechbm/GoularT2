import { AuthLink } from "./auth-link";
import { Card, Chip, StoreChip } from "./ui";
import { SubmitButton } from "./submit";
import { generateAuthLinkAction, requestAccessAction, syncAccountAction } from "@/lib/actions/integrations";
import { relativeBR } from "@/lib/format";
import { MARKETPLACES, marketplaceLabel, type Client, type ClientMarketplace } from "@/lib/types";

/** Liga quantas lojas o cliente operar, inclusive várias na mesma plataforma. */
export function ConectarLojas({
  client,
  accounts,
  manager,
  destaque,
  disponiveis,
  refMonth,
}: {
  client: Client;
  accounts: ClientMarketplace[];
  manager: boolean;
  /** id da loja cujo link acabou de ser gerado */
  destaque?: string;
  /** plataformas cujo app já está liberado para conectar */
  disponiveis: string[];
  refMonth: string;
}) {
  if (!manager) return null;

  const conectadas = accounts.filter((a) => a.status === "conectado").length;

  return (
    <Card
      title="Lojas do cliente"
      subtitle={`${accounts.length} ${accounts.length === 1 ? "loja cadastrada" : "lojas cadastradas"} · ${conectadas} conectada${conectadas === 1 ? "" : "s"}`}
    >
      <div className="space-y-3">
        {accounts.map((conta) => {
          const conectado = conta.status === "conectado";
          const temLink = Boolean(conta.auth_token);
          const disponivel = disponiveis.includes(conta.marketplace);
          const nome = conta.nickname || conta.external_id || marketplaceLabel(conta.marketplace);

          return (
            <div key={conta.id} className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-line bg-surface-2 px-4 py-3">
                <div className="min-w-0 space-y-1">
                  <StoreChip marketplace={conta.marketplace} name={nome} />
                  <div className="text-xs text-muted">
                    {!disponivel
                      ? "Conexão ainda não liberada"
                      : conectado
                        ? conta.last_sync_at
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
                  <span className="flex items-center gap-2">
                    <Chip tone="ok">Conectada</Chip>
                    <form action={syncAccountAction}>
                      <input type="hidden" name="account_id" value={conta.id} />
                      <input type="hidden" name="ref_month" value={refMonth} />
                      <input type="hidden" name="redirect_to" value={`/clientes/${client.id}`} />
                      <SubmitButton variant={conta.last_sync_at ? "ghost" : "primary"} pendingLabel="Buscando…">
                        {conta.last_sync_at ? "Atualizar números" : "Buscar números agora"}
                      </SubmitButton>
                    </form>
                  </span>
                ) : (
                  <form action={generateAuthLinkAction}>
                    <input type="hidden" name="account_id" value={conta.id} />
                    <input type="hidden" name="redirect_to" value={`/clientes/${client.id}`} />
                    <SubmitButton variant={temLink ? "ghost" : "primary"} pendingLabel="Gerando…">
                      {temLink ? "Gerar link novo" : "Gerar link de acesso"}
                    </SubmitButton>
                  </form>
                )}
              </div>

              {disponivel && temLink && !conectado && (destaque === conta.id || !destaque) && conta.auth_token && (
                <AuthLink
                  token={conta.auth_token}
                  expiresAt={conta.auth_expires_at}
                  marketplaceLabel={nome}
                  clientPhone={client.contact_phone}
                />
              )}
            </div>
          );
        })}

        <div className="border-t border-line pt-3">
          <p className="mb-2 text-xs font-medium text-ink">Cadastrar outra loja</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {MARKETPLACES.filter((m) => disponiveis.includes(m.value)).map((m) => (
              <form
                key={m.value}
                action={requestAccessAction}
                className="rounded-[10px] border border-line bg-surface-2 p-3"
              >
                <input type="hidden" name="client_id" value={client.id} />
                <input type="hidden" name="marketplace" value={m.value} />
                <StoreChip marketplace={m.value} name={m.label} />
                <input
                  name="nickname"
                  className="input my-2"
                  placeholder="Nome da loja"
                  aria-label={`Nome da nova loja ${m.label}`}
                  required
                />
                <SubmitButton variant="primary" size="sm" pendingLabel="Cadastrando…">
                  + Cadastrar loja
                </SubmitButton>
              </form>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}
