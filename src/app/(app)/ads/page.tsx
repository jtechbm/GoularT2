import Link from "next/link";
import { Suspense } from "react";
import { requireUser, visibleClientIds } from "@/lib/auth";
import { adsRows, clientOptions, marketplaceBreakdown } from "@/lib/queries";
import { brl, brlShort, currentMonth, dateBR, lastMonths, monthLabel, num, origemLabel, pct } from "@/lib/format";
import { Card, Empty, Field, MARKETPLACE_COLOR, MarketplaceChip, PageHeader, Stat } from "@/components/ui";
import { SaveBar, SubmitButton } from "@/components/submit";
import { MonthPicker } from "@/components/month-picker";
import { SplitBar } from "@/components/charts";
import { createAdsAction, deleteAdsAction } from "@/lib/actions/ads";
import { MARKETPLACES, marketplaceLabel } from "@/lib/types";

export default async function AdsPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; cliente?: string; canal?: string; ok?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const months = lastMonths(12);
  const ref = sp.mes && months.includes(sp.mes) ? sp.mes : currentMonth();

  const escopo = await visibleClientIds(user);
  const rows = await adsRows({ refMonth: ref, clientId: sp.cliente, marketplace: sp.canal, scope: escopo });
  const clients = await clientOptions(escopo);
  const breakdown = await marketplaceBreakdown(ref, undefined, escopo);

  // separar o que veio da loja do que a equipe digitou: o texto da tela
  // dizia "lançamentos" para tudo, mesmo quando ninguém lançou nada
  const automaticos = rows.filter((r) => r.source === "api").length;
  const manuais = rows.length - automaticos;

  const totals = rows.reduce(
    (a, e) => ({
      invested: a.invested + e.invested,
      revenue: a.revenue + e.revenue,
      clicks: a.clicks + e.clicks,
      orders: a.orders + e.orders,
    }),
    { invested: 0, revenue: 0, clicks: 0, orders: 0 },
  );
  const roas = totals.invested ? totals.revenue / totals.invested : 0;

  const byClient = new Map<string, { name: string; id: string; invested: number; revenue: number }>();
  for (const r of rows) {
    const acc = byClient.get(r.client_id) ?? { name: r.client_name, id: r.client_id, invested: 0, revenue: 0 };
    acc.invested += r.invested;
    acc.revenue += r.revenue;
    byClient.set(r.client_id, acc);
  }
  const clientRanking = [...byClient.values()].sort((a, b) => b.invested - a.invested);

  const declaredAds = breakdown.reduce((s, b) => s + b.ads, 0);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <PageHeader
        title="Ads"
        subtitle={`Investimento por cliente, marketplace e período · ${monthLabel(ref)}`}
        actions={
          <Suspense fallback={null}>
            <MonthPicker months={months} value={ref} />
          </Suspense>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Investido no mês"
          value={brl(totals.invested)}
          hint={origemLabel(automaticos, manuais)}
          tone="warn"
        />
        <Stat label="Receita atribuída" value={brl(totals.revenue)} tone="brand" />
        <Stat
          label="ROAS médio"
          value={roas ? `${roas.toFixed(2)}x` : "—"}
          hint={roas ? `ACOS ${pct(1 / roas)}` : "sem receita atribuída"}
          tone={roas >= 4 ? "ok" : roas >= 2 ? "warn" : "bad"}
        />
        <Stat
          label="Ads no fechamento"
          value={brl(declaredAds)}
          hint="valor lançado no financeiro"
          tone="info"
        />
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <Card bodyClassName="p-0" title="Campanhas do período">
            <form className="flex flex-wrap items-end gap-3 border-b border-line p-4" action="/ads" method="get">
              <input type="hidden" name="mes" value={ref} />
              <div className="min-w-44 flex-1">
                <label className="label">Cliente</label>
                <select name="cliente" defaultValue={sp.cliente ?? ""} className="select">
                  <option value="">Todos</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="w-44">
                <label className="label">Marketplace</label>
                <select name="canal" defaultValue={sp.canal ?? ""} className="select">
                  <option value="">Todos</option>
                  {MARKETPLACES.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" className="btn btn-ghost">
                Filtrar
              </button>
            </form>

            {rows.length ? (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Cliente</th>
                      <th>Canal</th>
                      <th>Campanha</th>
                      <th>Período</th>
                      <th className="num">Investido</th>
                      <th className="num">Receita</th>
                      <th className="num">ROAS</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((e) => {
                      const r = e.invested ? e.revenue / e.invested : 0;
                      return (
                        <tr key={e.id}>
                          <td>
                            <Link href={`/clientes/${e.client_id}?tab=ads`} className="font-medium text-ink hover:text-brand">
                              {e.client_name}
                            </Link>
                          </td>
                          <td>
                            <MarketplaceChip value={e.marketplace} />
                          </td>
                          <td className="text-xs text-muted">{e.campaign ?? "—"}</td>
                          <td className="text-xs text-dim">
                            {dateBR(e.period_start)}
                            {e.period_end !== e.period_start && ` → ${dateBR(e.period_end)}`}
                          </td>
                          <td className="num font-semibold text-ink">{brl(e.invested)}</td>
                          <td className="num text-muted">{brl(e.revenue)}</td>
                          <td className={`num font-semibold ${r >= 3 ? "text-ok" : r > 0 ? "text-warn" : "text-dim"}`}>
                            {r ? `${r.toFixed(2)}x` : "—"}
                          </td>
                          <td className="num">
                            <form action={deleteAdsAction}>
                              <input type="hidden" name="entry_id" value={e.id} />
                              <input type="hidden" name="client_id" value={e.client_id} />
                              <input type="hidden" name="redirect_to" value={`/ads?mes=${ref}`} />
                              <SubmitButton variant="ghost" size="sm" confirm="Excluir este lançamento?">
                                ✕
                              </SubmitButton>
                            </form>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-surface-2">
                      <td colSpan={4} className="text-xs font-semibold text-dim">
                        Total do filtro · {num(totals.clicks)} cliques · {num(totals.orders)} pedidos
                      </td>
                      <td className="num font-bold text-ink">{brl(totals.invested)}</td>
                      <td className="num font-semibold">{brl(totals.revenue)}</td>
                      <td className="num font-bold text-accent">{roas ? `${roas.toFixed(2)}x` : "—"}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <div className="p-5">
                <Empty
                  title="Nenhum investimento no período"
                  hint="Use o formulário ao lado para registrar o investimento de Ads deste mês."
                />
              </div>
            )}
          </Card>

          <Card title="Investimento por cliente" subtitle={monthLabel(ref)}>
            {clientRanking.length ? (
              <div className="space-y-3">
                {clientRanking.map((c) => {
                  const r = c.invested ? c.revenue / c.invested : 0;
                  const share = totals.invested ? c.invested / totals.invested : 0;
                  return (
                    <div key={c.id}>
                      <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                        <Link href={`/clientes/${c.id}?tab=ads`} className="font-medium text-ink hover:text-brand">
                          {c.name}
                        </Link>
                        <span className="text-muted">
                          {brlShort(c.invested)} · {r ? `${r.toFixed(2)}x` : "—"}
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-surface-3">
                        <div
                          className="h-full rounded-full bg-brand"
                          style={{ width: `${Math.max(2, share * 100)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-dim">Nada no período.</p>
            )}
          </Card>
        </div>

        <div className="space-y-3">
          <form action={createAdsAction}>
            <Card
              title="Lançar à mão"
              subtitle="Para canal sem conexão ou para completar o que a loja não devolve"
              bodyClassName="p-5 pb-0"
            >
              <input type="hidden" name="redirect_to" value={`/ads?mes=${ref}`} />
              <div className="space-y-3">
                <Field label="Cliente *">
                  <select name="client_id" required className="select" defaultValue={sp.cliente ?? ""}>
                    <option value="">Selecione…</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Marketplace">
                  <select name="marketplace" className="select">
                    {MARKETPLACES.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Campanha">
                  <input name="campaign" className="input" placeholder="nome da campanha" />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Início *">
                    <input name="period_start" type="date" required defaultValue={`${ref}-01`} className="input" />
                  </Field>
                  <Field label="Fim">
                    <input name="period_end" type="date" defaultValue={today} className="input" />
                  </Field>
                  <Field label="Investido (R$)">
                    <input name="invested" inputMode="decimal" className="input" placeholder="0,00" />
                  </Field>
                  <Field label="Receita (R$)">
                    <input name="revenue" inputMode="decimal" className="input" placeholder="0,00" />
                  </Field>
                  <Field label="Cliques">
                    <input name="clicks" inputMode="numeric" className="input" />
                  </Field>
                  <Field label="Pedidos">
                    <input name="orders" inputMode="numeric" className="input" />
                  </Field>
                </div>
                <Field label="Observações">
                  <textarea name="notes" rows={2} className="textarea" />
                </Field>
              </div>
              <SaveBar label="Registrar" hint="" />
            </Card>
          </form>

          <Card title="Ads por marketplace" subtitle="Valor lançado no fechamento do mês">
            {breakdown.length ? (
              <SplitBar
                parts={breakdown.map((b) => ({
                  label: marketplaceLabel(b.marketplace),
                  value: b.ads,
                  color: MARKETPLACE_COLOR[b.marketplace] ?? "var(--primary)",
                }))}
              />
            ) : (
              <p className="text-sm text-dim">Sem fechamento neste mês.</p>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
