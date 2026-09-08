import { Card, Empty, Field, MarketplaceChip, Stat } from "@/components/ui";
import { SaveBar, SubmitButton } from "@/components/submit";
import { createAdsAction, deleteAdsAction } from "@/lib/actions/ads";
import { brl, currentMonth, dateBR, num, pct } from "@/lib/format";
import { MARKETPLACES, type AdsEntry, type Client, type ClientMarketplace } from "@/lib/types";

export function TabAds({
  client,
  entries,
  accounts,
}: {
  client: Client;
  entries: (AdsEntry & { author: string | null })[];
  accounts: ClientMarketplace[];
}) {
  const channels = accounts.length
    ? MARKETPLACES.filter((m) => accounts.some((a) => a.marketplace === m.value))
    : MARKETPLACES;

  const totals = entries.reduce(
    (a, e) => ({
      invested: a.invested + e.invested,
      revenue: a.revenue + e.revenue,
      clicks: a.clicks + e.clicks,
      orders: a.orders + e.orders,
    }),
    { invested: 0, revenue: 0, clicks: 0, orders: 0 },
  );
  const roas = totals.invested ? totals.revenue / totals.invested : 0;
  const back = `/clientes/${client.id}?tab=ads`;
  const today = new Date().toISOString().slice(0, 10);
  const firstOfMonth = `${currentMonth()}-01`;

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Investido (histórico)" value={brl(totals.invested)} tone="warn" />
        <Stat label="Receita atribuída" value={brl(totals.revenue)} tone="brand" />
        <Stat
          label="ROAS"
          value={roas ? `${roas.toFixed(2)}x` : "—"}
          hint={roas ? `ACOS ${pct(1 / roas)}` : "sem receita atribuída"}
          tone={roas >= 4 ? "ok" : roas >= 2 ? "warn" : "bad"}
        />
        <Stat label="Pedidos via Ads" value={num(totals.orders)} hint={`${num(totals.clicks)} cliques`} tone="info" />
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <form action={createAdsAction} className="lg:col-span-1">
          <input type="hidden" name="client_id" value={client.id} />
          <input type="hidden" name="redirect_to" value={back} />
          <Card title="Novo investimento" subtitle="Por marketplace e período" bodyClassName="p-5 pb-0">
            <div className="space-y-3">
              <Field label="Marketplace">
                <select name="marketplace" className="select">
                  {channels.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Campanha / praça">
                <input name="campaign" className="input" placeholder="Ads de produto — geral" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Início">
                  <input name="period_start" type="date" defaultValue={firstOfMonth} required className="input" />
                </Field>
                <Field label="Fim">
                  <input name="period_end" type="date" defaultValue={today} className="input" />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Investido (R$)">
                  <input name="invested" inputMode="decimal" className="input" placeholder="0,00" />
                </Field>
                <Field label="Receita atribuída (R$)">
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
            <SaveBar label="Registrar investimento" hint="" />
          </Card>
        </form>

        <Card className="lg:col-span-2" title="Lançamentos de Ads" bodyClassName="p-0">
          {entries.length ? (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Período</th>
                    <th>Canal</th>
                    <th>Campanha</th>
                    <th className="num">Investido</th>
                    <th className="num">Receita</th>
                    <th className="num">ROAS</th>
                    <th className="num">Pedidos</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => {
                    const r = e.invested ? e.revenue / e.invested : 0;
                    return (
                      <tr key={e.id}>
                        <td className="text-xs text-muted">
                          {dateBR(e.period_start)}
                          {e.period_end !== e.period_start && ` → ${dateBR(e.period_end)}`}
                        </td>
                        <td>
                          <MarketplaceChip value={e.marketplace} />
                        </td>
                        <td className="text-xs text-muted">{e.campaign ?? "—"}</td>
                        <td className="num font-semibold text-ink">{brl(e.invested)}</td>
                        <td className="num text-muted">{brl(e.revenue)}</td>
                        <td className={`num font-semibold ${r >= 3 ? "text-ok" : r > 0 ? "text-warn" : "text-dim"}`}>
                          {r ? `${r.toFixed(2)}x` : "—"}
                        </td>
                        <td className="num text-muted">{num(e.orders)}</td>
                        <td className="num">
                          <form action={deleteAdsAction}>
                            <input type="hidden" name="entry_id" value={e.id} />
                            <input type="hidden" name="client_id" value={client.id} />
                            <input type="hidden" name="redirect_to" value={back} />
                            <SubmitButton variant="ghost" size="sm" confirm="Excluir este lançamento?">
                              ✕
                            </SubmitButton>
                          </form>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-5">
              <Empty
                title="Nenhum investimento registrado"
                hint="Lance o investimento por marketplace e período para acompanhar ROAS e ACOS deste cliente."
              />
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
