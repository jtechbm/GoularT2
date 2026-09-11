import Link from "next/link";
import { Suspense } from "react";
import { requirePermission } from "@/lib/auth";
import { all } from "@/lib/db";
import { sincronizacoes } from "@/lib/queries";
import { integrationStatus } from "@/lib/integrations";
import { currentMonth, dateTimeBR, lastMonths, monthLabel, relativeBR } from "@/lib/format";
import { diagnosticar, proximaSincronizacao } from "@/lib/integracao-status";
import { Card, Chip, Empty, MarketplaceChip, PageHeader, Stat, StatusChip } from "@/components/ui";
import { SubmitButton } from "@/components/submit";
import { MonthPicker } from "@/components/month-picker";
import {
  disconnectAccountAction,
  generateAuthLinkAction,
  syncAccountAction,
  syncAllAction,
} from "@/lib/actions/integrations";

// a sincronização com os marketplaces pode levar dezenas de segundos
export const maxDuration = 60;

export default async function IntegracoesPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; ok?: string; erro?: string; sync?: string; total?: string }>;
}) {
  const user = await requirePermission("integracoes.gerenciar");
  const sp = await searchParams;
  const months = lastMonths(12);
  const ref = sp.mes && months.includes(sp.mes) ? sp.mes : currentMonth();
  const manager = true; // a página inteira já exige a permissão de integrações

  const status = await integrationStatus();
  const rodadas = await sincronizacoes(20);

  const accounts = await all<{
    id: string;
    marketplace: string;
    nickname: string | null;
    external_id: string | null;
    status: string;
    last_success_at: string | null;
    last_sync_at: string | null;
    last_error: string | null;
    client_id: string;
    client_name: string;
  }>(
    `SELECT cm.*, c.name AS client_name
       FROM client_marketplaces cm JOIN clients c ON c.id = cm.client_id
      ORDER BY lower(c.name), cm.marketplace`,
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
            ? "Esta loja ainda não está disponível para conexão."
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
        <Stat
          label="Próxima rodada"
          value={relativeBR(proximaSincronizacao().toISOString())}
          hint="todo dia às 3h da manhã"
          tone="info"
        />
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        {status.map((s) => (
          <Card
            key={s.marketplace}
            title={<MarketplaceChip value={s.marketplace} />}
            subtitle={`${s.connected} de ${s.accounts} contas conectadas`}
            actions={<Chip tone={s.configured ? "ok" : "warn"}>{s.configured ? "pronta para conectar" : "indisponível"}</Chip>}
          >
            {s.configured ? (
              <p className="text-xs leading-relaxed text-muted">
                Peça acesso a cada lojista pelo botão <strong>Conectar</strong> abaixo. Ele aprova no painel da
                própria loja e o acesso fica guardado cifrado.
              </p>
            ) : (
              <div className="space-y-2">
                <p className="text-xs leading-relaxed text-muted">
                  A conexão com esta loja ainda não foi liberada. Enquanto isso, os valores dela podem ser
                  lançados à mão na aba Resultados de cada cliente.
                </p>
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
            <table className="data responsiva">
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
                    <td data-label="Cliente">
                      <Link href={`/clientes/${a.client_id}?tab=marketplaces`} className="font-medium text-ink hover:text-brand">
                        {a.client_name}
                      </Link>
                    </td>
                    <td data-label="Canal">
                      <MarketplaceChip value={a.marketplace} />
                    </td>
                    <td className="text-xs text-muted" data-label="Conta">{a.nickname ?? "—"}</td>
                    <td className="font-mono text-[0.7rem] text-dim" data-label="ID externo">{a.external_id ?? "—"}</td>
                    <td data-label="Status">
                      <StatusChip value={a.status} />
                      {a.last_error && (
                        <div className="mt-1 max-w-56 text-[0.65rem] text-bad">
                          {diagnosticar(a.last_error)?.titulo}
                        </div>
                      )}
                    </td>
                    <td className="text-xs text-dim" data-label="Última sync">
                      {a.last_success_at ? (
                        <span title={dateTimeBR(a.last_success_at)}>{relativeBR(a.last_success_at)}</span>
                      ) : (
                        <span className="text-warn">nunca</span>
                      )}
                      {a.last_sync_at && a.last_success_at !== a.last_sync_at && (
                        <span className="block text-[0.65rem] text-dim">
                          tentativa {relativeBR(a.last_sync_at)}
                        </span>
                      )}
                    </td>
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
                            <form action={generateAuthLinkAction}>
                              <input type="hidden" name="account_id" value={a.id} />
                              <input type="hidden" name="redirect_to" value={`/integracoes?mes=${ref}`} />
                              <SubmitButton variant="primary" size="sm" pendingLabel="Gerando…">
                                Gerar link
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

      <Card
        className="mt-3"
        title="Rodadas de sincronização"
        subtitle="Início, duração e o que cada uma gravou"
        bodyClassName="p-0"
      >
        {rodadas.length ? (
          <div className="table-wrap">
            <table className="data responsiva">
              <thead>
                <tr>
                  <th>Início</th>
                  <th>Duração</th>
                  <th>Cliente</th>
                  <th>Canal</th>
                  <th>Origem</th>
                  <th>Status</th>
                  <th className="num">Dias</th>
                  <th>Detalhe</th>
                </tr>
              </thead>
              <tbody>
                {rodadas.map((r) => {
                  const duracao =
                    r.finished_at && r.started_at
                      ? Math.round((new Date(r.finished_at).getTime() - new Date(r.started_at).getTime()) / 1000)
                      : null;
                  return (
                    <tr key={r.id}>
                      <td className="text-xs text-dim" data-label="Início">{dateTimeBR(r.started_at)}</td>
                      <td className="text-xs text-dim" data-label="Duração">{duracao === null ? "—" : `${duracao}s`}</td>
                      <td className="text-xs text-muted" data-label="Cliente">{r.client_name ?? "—"}</td>
                      <td data-label="Canal">{r.marketplace ? <MarketplaceChip value={r.marketplace} /> : "—"}</td>
                      <td className="text-xs text-dim" data-label="Origem">
                        {r.trigger === "cron"
                          ? "automática"
                          : r.trigger === "cli"
                            ? "linha de comando"
                            : r.started_by_name ?? "manual"}
                      </td>
                      <td data-label="Status">
                        <Chip tone={r.status === "ok" ? "ok" : r.status === "rodando" ? "warn" : "bad"}>
                          {r.status === "ok" ? "ok" : r.status === "rodando" ? "rodando" : "erro"}
                        </Chip>
                      </td>
                      <td className="num text-xs text-muted" data-label="Dias">{r.days_written || "—"}</td>
                      <td className="max-w-64 truncate text-xs text-muted" title={r.error ?? r.message ?? ""} data-label="Detalhe">
                        {r.error ? diagnosticar(r.error)?.titulo : r.message ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-5">
            <Empty title="Nenhuma rodada ainda" hint="A primeira sincronização aparece aqui." />
          </div>
        )}
      </Card>

    </>
  );
}
