import Link from "next/link";
import { Suspense } from "react";
import { isManager, requireUser } from "@/lib/auth";
import { all } from "@/lib/db";
import { syncLogs } from "@/lib/queries";
import { integrationStatus } from "@/lib/integrations";
import { currentMonth, dateTimeBR, lastMonths, monthLabel, relativeBR } from "@/lib/format";
import { Card, Chip, Empty, MarketplaceChip, PageHeader, Stat, StatusChip } from "@/components/ui";
import { SubmitButton } from "@/components/submit";
import { MonthPicker } from "@/components/month-picker";
import { connectAccountAction, disconnectAccountAction, syncAccountAction, syncAllAction } from "@/lib/actions/integrations";

export default async function IntegracoesPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; ok?: string; erro?: string; sync?: string; total?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const months = lastMonths(12);
  const ref = sp.mes && months.includes(sp.mes) ? sp.mes : currentMonth();
  const manager = isManager(user);

  const status = integrationStatus();
  const logs = syncLogs(15);

  const accounts = all<{
    id: string;
    marketplace: string;
    nickname: string | null;
    external_id: string | null;
    status: string;
    last_sync_at: string | null;
    last_error: string | null;
    client_id: string;
    client_name: string;
  }>(
    `SELECT cm.*, c.name AS client_name
       FROM client_marketplaces cm JOIN clients c ON c.id = cm.client_id
      ORDER BY c.name COLLATE NOCASE, cm.marketplace`,
  );

  const connected = accounts.filter((a) => a.status === "conectado").length;
  const withError = accounts.filter((a) => a.status === "erro").length;

  return (
    <>
      <PageHeader
        title="Integrações"
        subtitle="Shopee e Mercado Livre — o sistema puxa apenas os valores finais do mês."
        actions={
          <>
            <Suspense fallback={null}>
              <MonthPicker months={months} value={ref} />
            </Suspense>
            <form action={syncAllAction}>
              <input type="hidden" name="ref_month" value={ref} />
              <SubmitButton variant="accent" pendingLabel="Sincronizando…">
                ⟳ Sincronizar tudo
              </SubmitButton>
            </form>
          </>
        }
      />

      {sp.erro && (
        <div className="flash mb-4 rounded-lg border border-bad/30 bg-bad-soft px-4 py-2.5 text-sm text-bad">
          {sp.erro === "env"
            ? "Faltam as chaves do marketplace no arquivo .env."
            : `Falha na integração: ${decodeURIComponent(sp.erro)}`}
        </div>
      )}
      {sp.sync === "lote" && (
        <div className="flash mb-4 rounded-lg border border-ok/30 bg-ok-soft px-4 py-2.5 text-sm text-ok">
          Sincronização em lote concluída: {sp.ok ?? 0} de {sp.total ?? 0} contas.
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Contas cadastradas" value={String(accounts.length)} tone="brand" />
        <Stat label="Conectadas" value={String(connected)} tone="ok" />
        <Stat label="Com erro" value={String(withError)} tone={withError ? "bad" : "neutral"} />
        <Stat label="Mês de referência" value={monthLabel(ref)} tone="accent" />
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        {status.map((s) => (
          <Card
            key={s.marketplace}
            title={<MarketplaceChip value={s.marketplace} />}
            subtitle={`${s.connected} de ${s.accounts} contas conectadas`}
            actions={<Chip tone={s.configured ? "ok" : "warn"}>{s.configured ? "app configurado" : "sem chaves"}</Chip>}
          >
            {s.configured ? (
              <p className="text-xs leading-relaxed text-muted">
                Chaves carregadas. Conecte cada conta de cliente pelo botão <strong>Conectar</strong> abaixo — o
                consentimento OAuth guarda o token cifrado no banco.
              </p>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-muted">Defina no arquivo <code className="font-mono">.env</code>:</p>
                <ul className="space-y-1">
                  {s.missingEnv.map((v) => (
                    <li key={v} className="rounded bg-surface-2 px-2 py-1 font-mono text-[0.7rem] text-warn">
                      {v}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        ))}

        <Card title="O que a sincronização traz" subtitle="Sem detalhe de pedido">
          <ul className="space-y-1.5 text-xs text-muted">
            <li>• Faturamento do mês</li>
            <li>• Taxas e comissões do marketplace</li>
            <li>• Frete e impostos retidos</li>
            <li>• Quantidade de pedidos e unidades</li>
            <li className="text-dim">• Custo de produto e Ads continuam sendo lançados pela equipe</li>
          </ul>
        </Card>
      </div>

      <Card className="mt-3" title="Contas por cliente" bodyClassName="p-0">
        {accounts.length ? (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Canal</th>
                  <th>Conta</th>
                  <th>ID externo</th>
                  <th>Status</th>
                  <th>Última sync</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <Link href={`/clientes/${a.client_id}?tab=marketplaces`} className="font-medium text-ink hover:text-brand">
                        {a.client_name}
                      </Link>
                    </td>
                    <td>
                      <MarketplaceChip value={a.marketplace} />
                    </td>
                    <td className="text-xs text-muted">{a.nickname ?? "—"}</td>
                    <td className="font-mono text-[0.7rem] text-dim">{a.external_id ?? "—"}</td>
                    <td>
                      <StatusChip value={a.status} />
                      {a.last_error && <div className="mt-1 max-w-56 truncate text-[0.65rem] text-bad">{a.last_error}</div>}
                    </td>
                    <td className="text-xs text-dim">{a.last_sync_at ? relativeBR(a.last_sync_at) : "nunca"}</td>
                    <td>
                      <div className="flex justify-end gap-1.5">
                        <form action={syncAccountAction}>
                          <input type="hidden" name="account_id" value={a.id} />
                          <input type="hidden" name="ref_month" value={ref} />
                          <input type="hidden" name="redirect_to" value={`/integracoes?mes=${ref}`} />
                          <SubmitButton variant="ghost" size="sm" pendingLabel="…">
                            ⟳ Sync
                          </SubmitButton>
                        </form>
                        {manager &&
                          (a.status === "conectado" ? (
                            <form action={disconnectAccountAction}>
                              <input type="hidden" name="account_id" value={a.id} />
                              <SubmitButton variant="ghost" size="sm" confirm="Apagar os tokens desta conta?">
                                Desconectar
                              </SubmitButton>
                            </form>
                          ) : (
                            <form action={connectAccountAction}>
                              <input type="hidden" name="account_id" value={a.id} />
                              <SubmitButton variant="primary" size="sm">
                                Conectar
                              </SubmitButton>
                            </form>
                          ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-5">
            <Empty
              title="Nenhuma conta de marketplace cadastrada"
              hint="Adicione as contas na aba Marketplaces de cada cliente."
              action={
                <Link href="/clientes" className="btn btn-primary btn-sm">
                  Ir para clientes
                </Link>
              }
            />
          </div>
        )}
      </Card>

      <Card className="mt-3" title="Log de sincronizações" bodyClassName="p-0">
        {logs.length ? (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Cliente</th>
                  <th>Canal</th>
                  <th>Mês</th>
                  <th>Status</th>
                  <th>Detalhe</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id}>
                    <td className="text-xs text-dim">{dateTimeBR(l.created_at)}</td>
                    <td className="text-xs text-muted">{l.client_name ?? "—"}</td>
                    <td>
                      <MarketplaceChip value={l.marketplace} />
                    </td>
                    <td className="text-xs text-dim">{l.ref_month ? monthLabel(l.ref_month) : "—"}</td>
                    <td>
                      <Chip tone={l.status === "ok" ? "ok" : "bad"}>{l.status}</Chip>
                    </td>
                    <td className="max-w-md truncate text-xs text-muted">{l.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-5">
            <Empty title="Nenhuma sincronização executada" />
          </div>
        )}
      </Card>
    </>
  );
}
