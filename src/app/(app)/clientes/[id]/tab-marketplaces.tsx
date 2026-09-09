import { Card, Chip, Empty, Field, MarketplaceChip, StatusChip } from "@/components/ui";
import { SaveBar, SubmitButton } from "@/components/submit";
import {
  addMarketplaceAction,
  removeMarketplaceAction,
  updateMarketplaceAction,
} from "@/lib/actions/clients";
import {
  disconnectAccountAction,
  generateAuthLinkAction,
  revokeAuthLinkAction,
  syncAccountAction,
} from "@/lib/actions/integrations";
import { AuthLink } from "@/components/auth-link";
import { dateTimeBR, monthLabel } from "@/lib/format";
import { MARKETPLACES, marketplaceLabel, type Client, type ClientMarketplace } from "@/lib/types";

export function TabMarketplaces({
  client,
  accounts,
  refMonth,
  manager,
}: {
  client: Client;
  accounts: ClientMarketplace[];
  refMonth: string;
  manager: boolean;
}) {
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <div className="space-y-3 lg:col-span-2">
        {accounts.length ? (
          accounts.map((a) => (
            <Card
              key={a.id}
              title={<MarketplaceChip value={a.marketplace} />}
              subtitle={a.last_sync_at ? `Última sincronização: ${dateTimeBR(a.last_sync_at)}` : "Nunca sincronizada"}
              actions={<StatusChip value={a.status} />}
              bodyClassName="p-5 pb-0"
            >
              <form action={updateMarketplaceAction}>
                <input type="hidden" name="client_id" value={client.id} />
                <input type="hidden" name="marketplace_id" value={a.id} />
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Apelido da conta">
                    <input name="nickname" defaultValue={a.nickname ?? ""} className="input" placeholder="como a equipe chama esta conta" />
                  </Field>
                  <Field label="ID externo" hint="Seller ID (ML) ou Shop ID (Shopee).">
                    <input name="external_id" defaultValue={a.external_id ?? ""} className="input" />
                  </Field>
                  <Field label="Status">
                    <select name="status" defaultValue={a.status} className="select">
                      <option value="pendente">Pendente</option>
                      <option value="conectado">Conectado</option>
                      <option value="erro">Erro</option>
                      <option value="desativado">Desativado</option>
                    </select>
                  </Field>
                </div>

                {a.last_error && (
                  <p className="mt-3 rounded-lg border border-bad/30 bg-bad-soft px-3 py-2 text-xs text-bad">
                    {a.last_error}
                  </p>
                )}

                <SaveBar label="Salvar conta" hint="Dados da conta usados pela integração." />
              </form>

              <div className="-mx-5 flex flex-wrap items-center gap-2 border-t border-line bg-surface-2 px-5 py-3">
                <form action={syncAccountAction} className="flex items-center gap-2">
                  <input type="hidden" name="account_id" value={a.id} />
                  <input type="hidden" name="ref_month" value={refMonth} />
                  <input type="hidden" name="redirect_to" value={`/clientes/${client.id}?tab=marketplaces`} />
                  <SubmitButton variant="ghost" size="sm" pendingLabel="Sincronizando…">
                    ⟳ Sincronizar {monthLabel(refMonth)}
                  </SubmitButton>
                </form>

                {manager && (
                  <form action={generateAuthLinkAction}>
                    <input type="hidden" name="account_id" value={a.id} />
                    <input type="hidden" name="redirect_to" value={`/clientes/${client.id}?tab=marketplaces`} />
                    <SubmitButton
                      variant={a.status === "conectado" ? "ghost" : "primary"}
                      size="sm"
                      pendingLabel="Gerando…"
                      title={
                        a.status === "conectado"
                          ? "Use quando as permissões do app mudarem ou o lojista revogar o acesso"
                          : undefined
                      }
                    >
                      {a.status === "conectado"
                        ? "Pedir nova autorização"
                        : a.auth_token
                          ? "Gerar novo link"
                          : "Gerar link de autorização"}
                    </SubmitButton>
                  </form>
                )}

                {manager && a.auth_token && (
                  <form action={revokeAuthLinkAction}>
                    <input type="hidden" name="account_id" value={a.id} />
                    <input type="hidden" name="redirect_to" value={`/clientes/${client.id}?tab=marketplaces`} />
                    <SubmitButton variant="ghost" size="sm" confirm="Invalidar o link enviado?">
                      Invalidar link
                    </SubmitButton>
                  </form>
                )}

                {manager && a.status === "conectado" && (
                  <form action={disconnectAccountAction}>
                    <input type="hidden" name="account_id" value={a.id} />
                    <SubmitButton variant="ghost" size="sm" confirm="Apagar os tokens desta conta?">
                      Desconectar
                    </SubmitButton>
                  </form>
                )}

                {manager && (
                  <form action={removeMarketplaceAction}>
                    <input type="hidden" name="client_id" value={client.id} />
                    <input type="hidden" name="marketplace_id" value={a.id} />
                    <SubmitButton variant="danger" size="sm" confirm="Remover esta conta do cliente?">
                      Remover conta
                    </SubmitButton>
                  </form>
                )}

                <span className="text-[0.7rem] text-dim">
                  A sincronização traz apenas os valores finais do mês (faturamento, taxas, impostos, pedidos).
                </span>
              </div>

              {a.auth_token && !a.auth_used_at && (
                <div className="-mx-5 border-t border-line px-5 py-3">
                  <AuthLink
                    token={a.auth_token}
                    expiresAt={a.auth_expires_at}
                    marketplaceLabel={marketplaceLabel(a.marketplace)}
                    clientPhone={client.contact_phone}
                  />
                </div>
              )}

            </Card>
          ))
        ) : (
          <Card>
            <Empty
              title="Nenhum marketplace cadastrado"
              hint="Adicione as contas de Shopee e Mercado Livre que este cliente opera."
            />
          </Card>
        )}
      </div>

      <div className="space-y-3">
        {manager && (
          <form action={addMarketplaceAction}>
            <input type="hidden" name="client_id" value={client.id} />
            <Card title="Adicionar canal" bodyClassName="p-5 pb-0">
              <div className="space-y-3">
                <Field label="Marketplace">
                  <select name="marketplace" className="select">
                    {MARKETPLACES.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Apelido">
                  <input name="nickname" className="input" placeholder="como a equipe chama esta conta" />
                </Field>
                <Field label="ID externo">
                  <input name="external_id" className="input" placeholder="opcional" />
                </Field>
              </div>
              <SaveBar label="Adicionar canal" hint="" />
            </Card>
          </form>
        )}

        <Card title="Como funciona a integração">
          <ol className="space-y-2.5 text-xs leading-relaxed text-muted">
            <li>
              <Chip tone="brand">1</Chip> Cadastre a conta do cliente aqui (apelido e, se souber, o ID externo).
            </li>
            <li>
              <Chip tone="brand">2</Chip> Configure as chaves do app em <code className="font-mono">.env</code> —
              partner key da Shopee e client id/secret do Mercado Livre.
            </li>
            <li>
              <Chip tone="brand">3</Chip> Gere o <strong>link de autorização</strong> e mande para o lojista. Ele
              aprova no painel do próprio marketplace — não entra aqui e não vê nada do sistema.
            </li>
            <li>
              <Chip tone="brand">4</Chip> Sincronize o mês. Só os valores finais entram no GoularT — nada de pedido a
              pedido.
            </li>
          </ol>
        </Card>
      </div>
    </div>
  );
}
